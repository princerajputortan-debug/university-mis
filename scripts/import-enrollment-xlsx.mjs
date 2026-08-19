/**
 * Import enrollment rows from Excel into enrollment_id + Enrollment tables.
 * Usage: node scripts/import-enrollment-xlsx.mjs [path-to-xlsx]
 */
import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const defaultPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'add enrollment .xlsx'
);
const xlsxPath = process.argv[2] || defaultPath;

function readXlsx(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  return rows
    .map((row) => ({
      id: parseInt(String(row[0] ?? '').trim(), 10),
      enrollment: String(row[1] ?? '').trim(),
    }))
    .filter((row) => Number.isFinite(row.id) && row.id > 0 && row.enrollment);
}

async function syncEnrollmentPrismaTable() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT id, TRIM(enrollment) AS enrollment
    FROM enrollment_id
    WHERE id IS NOT NULL AND TRIM(enrollment) != ''
    ORDER BY id ASC
  `);

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Enrollment (
      id INT NOT NULL AUTO_INCREMENT,
      enrollment VARCHAR(191) NOT NULL,
      prefix VARCHAR(191) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY Enrollment_enrollment_key (enrollment)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE Enrollment');

  const seen = new Set();
  const prepared = [];
  for (const row of rows) {
    let label = String(row.enrollment).slice(0, 191);
    const norm = label.toLowerCase();
    if (seen.has(norm)) {
      label = `${label} (#${row.id})`.slice(0, 191);
    } else {
      seen.add(norm);
    }
    prepared.push({ id: Number(row.id), label });
  }

  for (let i = 0; i < prepared.length; i += 1000) {
    const chunk = prepared.slice(i, i + 1000);
    const values = chunk
      .map((r) => `(${r.id}, '${r.label.replace(/'/g, "''")}')`)
      .join(',');
    await prisma.$executeRawUnsafe(`INSERT INTO Enrollment (id, enrollment) VALUES ${values}`);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');

  return prepared.length;
}

async function main() {
  console.log('Reading:', xlsxPath);
  const rows = readXlsx(xlsxPath);

  const [{ c: beforeEnrollId }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS c FROM enrollment_id'
  );
  const [{ c: beforeEnrollment }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS c FROM Enrollment'
  );

  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM enrollment_id WHERE id = ${row.id} LIMIT 1`
    );

    if (existing.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE enrollment_id SET enrollment = ? WHERE id = ?`,
        row.enrollment,
        row.id
      );
      updated++;
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO enrollment_id (id, enrollment) VALUES (?, ?)`,
        row.id,
        row.enrollment
      );
      inserted++;
    }
  }

  const enrollmentSynced = await syncEnrollmentPrismaTable();

  const [{ c: afterEnrollId }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS c FROM enrollment_id'
  );
  const [{ c: afterEnrollment }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS c FROM Enrollment'
  );

  const sample = await prisma.$queryRawUnsafe(`
    SELECT id, enrollment FROM enrollment_id
    ORDER BY id DESC
    LIMIT 3
  `);

  console.log(`Excel rows: ${rows.length} (ids ${rows[0]?.id}–${rows[rows.length - 1]?.id})`);
  console.log(`enrollment_id: inserted ${inserted}, updated ${updated}`);
  console.log(`Enrollment (Prisma) synced: ${enrollmentSynced} rows`);
  console.log(
    `Before: enrollment_id ${Number(beforeEnrollId)}, Enrollment ${Number(beforeEnrollment)}`
  );
  console.log(
    `After: enrollment_id ${Number(afterEnrollId)}, Enrollment ${Number(afterEnrollment)}`
  );
  console.log('Latest sample:', sample);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
