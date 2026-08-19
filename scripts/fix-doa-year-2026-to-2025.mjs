/**
 * Fix 10 admission forms: change date_of_admission year from 2026 to 2025.
 * Usage: node scripts/fix-doa-year-2026-to-2025.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

/** enrollment_no → corrected date (YYYY-MM-DD) */
const REVISIONS = [
  { enrollmentNo: 13959, date: '2025-12-03' },
  { enrollmentNo: 13960, date: '2025-12-03' },
  { enrollmentNo: 13961, date: '2025-08-02' },
  { enrollmentNo: 13962, date: '2025-11-02' },
  { enrollmentNo: 13964, date: '2025-12-03' },
  { enrollmentNo: 13965, date: '2025-07-02' },
  { enrollmentNo: 13969, date: '2025-12-03' },
  { enrollmentNo: 13972, date: '2025-11-02' },
  { enrollmentNo: 13976, date: '2025-09-02' },
  { enrollmentNo: 13989, date: '2025-11-02' },
];

async function main() {
  let updated = 0;
  const missing = [];

  for (const { enrollmentNo, date } of REVISIONS) {
    const before = await prisma.$queryRawUnsafe(
      `SELECT af.id, af.date_of_admission, e.enrollment
       FROM AdmissionForm af
       LEFT JOIN enrollment_id e ON e.id = af.enrollment_no
       WHERE af.enrollment_no = ${enrollmentNo}
       LIMIT 1`
    );

    if (!before.length) {
      missing.push(enrollmentNo);
      continue;
    }

    await prisma.$executeRawUnsafe(
      `UPDATE AdmissionForm SET date_of_admission = ? WHERE enrollment_no = ?`,
      date,
      enrollmentNo
    );

    updated++;
    const row = before[0];
    console.log(
      `${enrollmentNo} (${row.enrollment ?? 'n/a'}): ${row.date_of_admission} → ${date}`
    );
  }

  console.log(`\nUpdated: ${updated}/${REVISIONS.length}`);
  if (missing.length) {
    console.log('Not found for enrollment_no:', missing.join(', '));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
