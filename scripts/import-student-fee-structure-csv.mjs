/**
 * Import StudentFeeStructure rows from fee_structure_template CSV.
 * CSV uses numeric lookup ids (Enrollment No = enrollment table id).
 *
 * Usage:
 *   node scripts/import-student-fee-structure-csv.mjs [path-to-csv]
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const defaultPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'fee_structure_template (5).csv'
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

function parseFloatOrNull(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function parseIntOrNull(value) {
  const raw = String(value ?? '').trim();
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  return parseInt(raw, 10);
}

function feeAfter(fee, scholarship) {
  if (fee === null) return null;
  return Math.max(0, fee - (scholarship || 0));
}

function buildPayload(row) {
  const sem1Fee = parseFloatOrNull(row['Sem 1 Fee']);
  const sem1Scholarship = parseFloatOrNull(row['Sem 1 Scholarship']);
  const sem2Fee = parseFloatOrNull(row['Sem 2 Fee']);
  const sem2Scholarship = parseFloatOrNull(row['Sem 2 Scholarship']);
  const sem3Fee = parseFloatOrNull(row['Sem 3 Fee']);
  const sem3Scholarship = parseFloatOrNull(row['Sem 3 Scholarship']);
  const sem4Fee = parseFloatOrNull(row['Sem 4 Fee']);
  const sem4Scholarship = parseFloatOrNull(row['Sem 4 Scholarship']);
  const sem5Fee = parseFloatOrNull(row['Sem 5 Fee']);
  const sem5Scholarship = parseFloatOrNull(row['Sem 5 Scholarship']);
  const sem6Fee = parseFloatOrNull(row['Sem 6 Fee']);
  const sem6Scholarship = parseFloatOrNull(row['Sem 6 Scholarship']);

  return {
    typeId: parseIntOrNull(row['Type (UG/PG)']),
    programId: parseIntOrNull(row['Program']),
    batchId: parseIntOrNull(row['Batch']),
    paymentOptionId: parseIntOrNull(row['Payment Option']),
    couponName: String(row['Coupon Name'] ?? '').trim() || null,
    couponName2: String(row['Coupon Name 2'] ?? '').trim() || null,
    couponName3: String(row['Coupon Name 3'] ?? row['Coupon 3'] ?? '').trim() || null,
    currentSem: parseIntOrNull(row['Current Semester']),
    sem1Fee,
    sem2Fee,
    sem3Fee,
    sem4Fee,
    sem5Fee,
    sem6Fee,
    sem1Scholarship,
    sem2Scholarship,
    sem3Scholarship,
    sem4Scholarship,
    sem5Scholarship,
    sem6Scholarship,
    sem1FeeAfter: feeAfter(sem1Fee, sem1Scholarship),
    sem2FeeAfter: feeAfter(sem2Fee, sem2Scholarship),
    sem3FeeAfter: feeAfter(sem3Fee, sem3Scholarship),
    sem4FeeAfter: feeAfter(sem4Fee, sem4Scholarship),
    sem5FeeAfter: feeAfter(sem5Fee, sem5Scholarship),
    sem6FeeAfter: feeAfter(sem6Fee, sem6Scholarship),
  };
}

async function main() {
  console.log('Reading:', csvPath);
  const rows = readCsv(csvPath);
  console.log(`Parsed ${rows.length} CSV rows`);

  const before = await prisma.studentFeeStructure.count();
  console.log(`StudentFeeStructure rows before: ${before}`);

  const enrollmentIds = new Set(
    (
      await prisma.enrollment.findMany({
        select: { id: true },
      })
    ).map((r) => r.id)
  );

  let upserted = 0;
  let skipped = 0;
  let missingEnrollment = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const enrollmentId = parseIntOrNull(row['Enrollment No']);
    if (!enrollmentId) {
      skipped += 1;
      continue;
    }
    if (!enrollmentIds.has(enrollmentId)) {
      missingEnrollment += 1;
      continue;
    }

    const payload = {
      enrollmentId,
      ...buildPayload(row),
    };

    await prisma.studentFeeStructure.upsert({
      where: { enrollmentId },
      update: payload,
      create: payload,
    });
    upserted += 1;

    if ((i + 1) % 100 === 0 || i + 1 === rows.length) {
      process.stdout.write(`\r  Progress: ${i + 1} / ${rows.length}`);
    }
  }
  console.log('');

  const after = await prisma.studentFeeStructure.count();
  const sample = await prisma.studentFeeStructure.findMany({
    where: { enrollmentId: { in: [1, 6707] } },
    select: {
      id: true,
      enrollmentId: true,
      batchId: true,
      programId: true,
      sem1Fee: true,
      sem1Scholarship: true,
      sem1FeeAfter: true,
    },
  });

  console.log('Done.');
  console.log(`  Upserted: ${upserted}`);
  console.log(`  Skipped (no enrollment no): ${skipped}`);
  console.log(`  Missing enrollment id: ${missingEnrollment}`);
  console.log(`  Total rows after: ${after}`);
  console.log('Sample:', sample);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
