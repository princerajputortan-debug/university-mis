/**
 * Inspect Batch 9 DOA distribution around official start.
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const earliest = await prisma.$queryRawUnsafe(`
    SELECT DATE_FORMAT(date_of_admission, '%Y-%m-%d') AS doa, COUNT(*) AS c
    FROM AdmissionForm
    WHERE batch = 9 AND date_of_admission IS NOT NULL
    GROUP BY DATE_FORMAT(date_of_admission, '%Y-%m-%d')
    ORDER BY doa
    LIMIT 40
  `);
  console.log('Batch 9 earliest DOAs:');
  for (const r of earliest) console.log(r.doa, Number(r.c));

  const around = await prisma.$queryRawUnsafe(`
    SELECT DATE_FORMAT(date_of_admission, '%Y-%m-%d') AS doa, COUNT(*) AS c
    FROM AdmissionForm
    WHERE batch = 9
      AND date_of_admission >= '2026-04-01'
      AND date_of_admission <= '2026-04-30'
    GROUP BY DATE_FORMAT(date_of_admission, '%Y-%m-%d')
    ORDER BY doa
  `);
  console.log('\nBatch 9 April 2026:');
  for (const r of around) console.log(r.doa, Number(r.c));

  const beforeOfficial = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS c
    FROM AdmissionForm
    WHERE batch = 9
      AND date_of_admission IS NOT NULL
      AND date_of_admission < '2026-04-14'
  `);
  console.log('\nBatch 9 before 2026-04-14:', Number(beforeOfficial[0].c));

  const starts = await prisma.$queryRawUnsafe(`
    SELECT
      af.batch AS batchId,
      DATE_FORMAT(MIN(af.date_of_admission), '%Y-%m-%d') AS minDoa,
      DATE_FORMAT(MIN(CASE WHEN af.date_of_admission >= '2022-01-01' THEN af.date_of_admission END), '%Y-%m-%d') AS minDoaAll,
      (
        SELECT DATE_FORMAT(af2.date_of_admission, '%Y-%m-%d')
        FROM AdmissionForm af2
        WHERE af2.batch = af.batch AND af2.date_of_admission IS NOT NULL
        GROUP BY af2.date_of_admission
        ORDER BY COUNT(*) DESC, af2.date_of_admission ASC
        LIMIT 1
      ) AS modeDoa
    FROM AdmissionForm af
    WHERE af.batch BETWEEN 1 AND 9 AND af.date_of_admission IS NOT NULL
    GROUP BY af.batch
    ORDER BY af.batch
  `);
  console.log('\nBatch start candidates:');
  console.log(starts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
