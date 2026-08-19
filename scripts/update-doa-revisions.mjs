/**
 * Update revised date_of_admission for enrollment IDs from user screenshot.
 * Enrollment_No = enrollment_id.id (numeric FK on AdmissionForm.enrollment_no).
 * Usage: node scripts/update-doa-revisions.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

/** enrollment_no → revised DOA (YYYY-MM-DD) */
const REVISIONS = [
  { enrollmentNo: 14419, date: '2026-05-08' },
  { enrollmentNo: 14472, date: '2026-05-08' },
  { enrollmentNo: 14492, date: '2026-05-09' },
  { enrollmentNo: 14493, date: '2026-05-09' },
  { enrollmentNo: 14503, date: '2026-05-10' },
  { enrollmentNo: 14777, date: '2026-05-12' },
  { enrollmentNo: 14778, date: '2026-05-12' },
  { enrollmentNo: 14779, date: '2026-05-12' },
  { enrollmentNo: 14780, date: '2026-05-12' },
  { enrollmentNo: 14781, date: '2026-05-12' },
  { enrollmentNo: 14782, date: '2026-05-12' },
  { enrollmentNo: 14783, date: '2026-05-12' },
  { enrollmentNo: 14784, date: '2026-05-12' },
  { enrollmentNo: 14785, date: '2026-05-12' },
  { enrollmentNo: 14786, date: '2026-05-12' },
  { enrollmentNo: 14787, date: '2026-05-12' },
  { enrollmentNo: 14813, date: '2026-05-12' },
  { enrollmentNo: 14845, date: '2026-05-25' },
  { enrollmentNo: 14871, date: '2026-04-14' },
  { enrollmentNo: 14888, date: '2025-05-12' },
  { enrollmentNo: 14894, date: '2025-05-12' },
  { enrollmentNo: 15035, date: '2026-04-20' },
  { enrollmentNo: 15514, date: '2026-04-24' },
  { enrollmentNo: 16889, date: '2026-04-26' },
];

function formatDoa(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

async function main() {
  let updated = 0;
  const missing = [];
  const unchanged = [];

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

    const row = before[0];
    const oldDoa = formatDoa(row.date_of_admission);

    if (oldDoa === date) {
      unchanged.push(enrollmentNo);
      console.log(`${enrollmentNo} (${row.enrollment ?? 'n/a'}): already ${date}`);
      continue;
    }

    await prisma.$executeRawUnsafe(
      `UPDATE AdmissionForm SET date_of_admission = ? WHERE enrollment_no = ?`,
      date,
      enrollmentNo
    );

    updated++;
    console.log(`${enrollmentNo} (${row.enrollment ?? 'n/a'}): ${oldDoa ?? 'null'} → ${date}`);
  }

  console.log(`\nUpdated: ${updated}/${REVISIONS.length}`);
  console.log(`Already correct: ${unchanged.length}`);
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
