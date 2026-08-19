/**
 * Import enrollment rows into enrollment_id + Enrollment (Prisma) tables.
 *
 * Usage:
 *   node scripts/import-enrollment-csv.mjs [path-to-csv]
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const defaultPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'enrollment-template (1).csv'
);
const csvPath = process.argv[2] || defaultPath;

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const parsed = Papa.parse(fs.readFileSync(filePath, 'utf8').trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return parsed.data;
}

function parseId(value) {
  const raw = String(value ?? '').trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  return parseInt(raw, 10);
}

function parseEnrollment(value) {
  const raw = String(value ?? '').trim();
  return raw || null;
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
  console.log('Reading:', csvPath);
  const rows = readCsv(csvPath);

  const [{ c: beforeEnrollId }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS c FROM enrollment_id'
  );
  const [{ c: beforeEnrollment }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS c FROM Enrollment'
  );

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = parseId(row.id ?? row.Id ?? row.ID);
    const enrollment = parseEnrollment(row.enrollment ?? row.Enrollment);
    if (!id || !enrollment) {
      skipped++;
      continue;
    }

    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM enrollment_id WHERE id = ${id} LIMIT 1`
    );

    if (existing.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE enrollment_id SET enrollment = ? WHERE id = ?`,
        enrollment,
        id
      );
      updated++;
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO enrollment_id (id, enrollment) VALUES (?, ?)`,
        id,
        enrollment
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
    WHERE id >= 15521
    ORDER BY id DESC
    LIMIT 3
  `);

  console.log(`CSV rows: ${rows.length}`);
  console.log(`enrollment_id: inserted ${inserted}, updated ${updated}, skipped ${skipped}`);
  console.log(`Enrollment (Prisma) synced: ${enrollmentSynced} rows`);
  console.log(`Before: enrollment_id ${Number(beforeEnrollId)}, Enrollment ${Number(beforeEnrollment)}`);
  console.log(`After: enrollment_id ${Number(afterEnrollId)}, Enrollment ${Number(afterEnrollment)}`);
  console.log('Latest sample:', sample);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
