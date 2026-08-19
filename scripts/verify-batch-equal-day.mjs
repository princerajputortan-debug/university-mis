/**
 * Verify equal-day comparison with Batch 9 official start 2026-04-14.
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const BATCH_START_OVERRIDES = { 9: '2026-04-14' };
const OUTLIER_GAP_DAYS = 90;

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((b - a) / 86400000));
}

function resolveBatchStart(batchId, distinctDoasAsc) {
  if (BATCH_START_OVERRIDES[batchId]) return BATCH_START_OVERRIDES[batchId];
  if (!distinctDoasAsc.length) return null;
  let start = distinctDoasAsc[0];
  for (let i = 0; i < distinctDoasAsc.length - 1; i++) {
    const gap = daysBetween(distinctDoasAsc[i], distinctDoasAsc[i + 1]);
    if (gap > OUTLIER_GAP_DAYS) {
      start = distinctDoasAsc[i + 1];
      continue;
    }
    break;
  }
  return start;
}

async function main() {
  const asOfDate = '2026-07-30';

  const distinctDoas = await prisma.$queryRawUnsafe(`
    SELECT
      af.batch AS batchId,
      DATE_FORMAT(af.date_of_admission, '%Y-%m-%d') AS doa
    FROM AdmissionForm af
    WHERE af.batch BETWEEN 1 AND 9
      AND af.date_of_admission IS NOT NULL
    GROUP BY af.batch, DATE_FORMAT(af.date_of_admission, '%Y-%m-%d')
    ORDER BY af.batch, doa
  `);

  const doasByBatch = new Map();
  for (const row of distinctDoas) {
    const batchId = Number(row.batchId);
    const list = doasByBatch.get(batchId) || [];
    list.push(row.doa);
    doasByBatch.set(batchId, list);
  }

  const batch9Start = resolveBatchStart(9, doasByBatch.get(9) || []);
  const n = daysBetween(batch9Start, asOfDate);
  console.log(`Batch 9: ${batch9Start} → ${asOfDate} = ${n} days\n`);

  for (let batchId = 1; batchId <= 9; batchId++) {
    const start = resolveBatchStart(batchId, doasByBatch.get(batchId) || []);
    const sameDayEnd = addDays(start, n);
    const countEnd = sameDayEnd > asOfDate ? asOfDate : sameDayEnd;
    const countRows = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS c
      FROM AdmissionForm
      WHERE batch = ${batchId}
        AND date_of_admission IS NOT NULL
        AND date_of_admission >= '${start}'
        AND date_of_admission <= '${countEnd}'
    `);
    console.log(
      `Batch ${batchId}: ${start} → ${countEnd} | day ${daysBetween(start, countEnd)} | admissions ${Number(countRows[0].c)}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
