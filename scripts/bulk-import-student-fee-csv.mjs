/**
 * Bulk import Student Fee Structure from a CSV.
 *
 * Accepts numeric lookup ids (main_data_base style: Enrollment No = Enrollment.id,
 * Program/Batch/Payment Option/Type = numeric ids) OR text labels. Numeric ids
 * that exist are used directly; text labels are matched case-insensitively.
 * Rows whose enrollment cannot be resolved are skipped and reported.
 *
 * Usage: node scripts/bulk-import-student-fee-csv.mjs "<path-to-csv>"
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const CHUNK = 500;

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node scripts/bulk-import-student-fee-csv.mjs "<csv>"');
  process.exit(1);
}

function pick(row, ...keys) {
  for (const key of keys) {
    const v = row[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function num(v) {
  const raw = String(v ?? '').trim().replace(/,/g, '');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v) {
  const raw = String(v ?? '').trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  return parseInt(raw, 10);
}

function sqlVal(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function loadLookup(table, field) {
  const rows = await prisma.$queryRawUnsafe(`SELECT id, \`${field}\` AS label FROM \`${table}\``);
  const ids = new Set(rows.map((r) => Number(r.id)));
  const byLabel = new Map(rows.map((r) => [String(r.label).trim().toUpperCase(), Number(r.id)]));
  return { ids, byLabel };
}

function resolve(value, lookup) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const id = parseInt(raw, 10);
    if (lookup.ids.has(id)) return id;
  }
  return lookup.byLabel.get(raw.toUpperCase()) ?? null;
}

async function main() {
  if (!fs.existsSync(csvPath)) throw new Error(`File not found: ${csvPath}`);
  console.log('Student Fee CSV:', path.resolve(csvPath));

  const parsed = Papa.parse(fs.readFileSync(csvPath, 'utf8').trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const enrollmentRows = await prisma.$queryRawUnsafe('SELECT id, enrollment FROM Enrollment');
  const enrollment = {
    ids: new Set(enrollmentRows.map((r) => Number(r.id))),
    byLabel: new Map(enrollmentRows.map((r) => [String(r.enrollment).trim().toUpperCase(), Number(r.id)])),
  };
  const program = await loadLookup('Program', 'program');
  const paymentOption = await loadLookup('PaymentOption', 'paymentOption');
  const batch = await loadLookup('Batch', 'batch');
  const admissionType = await loadLookup('AdmissionType', 'type');

  const prepared = [];
  const byEnrollment = new Map();
  let skipped = 0;
  const skipSamples = [];

  for (const row of parsed.data) {
    const enrollmentId = resolve(pick(row, 'Enrollment No', 'Enrollment_No', 'enrollment_no'), enrollment);
    if (!enrollmentId) {
      skipped++;
      if (skipSamples.length < 15) skipSamples.push(pick(row, 'Enrollment No', 'Enrollment_No'));
      continue;
    }

    const feeAfter = (fee, schol) =>
      fee !== null ? Math.max(0, fee - (schol || 0)) : null;

    const sem = {};
    for (let i = 1; i <= 6; i++) {
      sem[`sem${i}Fee`] = num(pick(row, `Sem ${i} Fee`));
      sem[`sem${i}Scholarship`] = num(pick(row, `Sem ${i} Scholarship`));
      sem[`sem${i}FeeAfter`] = feeAfter(sem[`sem${i}Fee`], sem[`sem${i}Scholarship`]);
    }

    byEnrollment.set(enrollmentId, {
      enrollmentId,
      programId: resolve(pick(row, 'Program'), program),
      paymentOptionId: resolve(pick(row, 'Payment Option', 'Payment_option'), paymentOption),
      batchId: resolve(pick(row, 'Batch'), batch),
      typeId: resolve(pick(row, 'Type (UG/PG)', 'Type'), admissionType),
      couponName: pick(row, 'Coupon Name') || null,
      couponName2: pick(row, 'Coupon Name 2') || null,
      couponName3: pick(row, 'Coupon Name 3', 'Coupon 3') || null,
      currentSem: intOrNull(pick(row, 'Current Semester')),
      ...sem,
    });
  }

  prepared.push(...byEnrollment.values());
  console.log(
    `Parsed ${parsed.data.length} rows → ${prepared.length} resolvable enrollments (skipped ${skipped})`
  );
  if (skipSamples.length) console.log('  Skipped enrollment samples:', skipSamples);

  // Replace existing rows for these enrollments to avoid duplicate/stale links.
  const now = 'NOW(3)';
  let inserted = 0;
  for (let i = 0; i < prepared.length; i += CHUNK) {
    const chunk = prepared.slice(i, i + CHUNK);
    const ids = chunk.map((r) => r.enrollmentId).join(',');
    await prisma.$executeRawUnsafe(
      `DELETE FROM StudentFeeStructure WHERE enrollmentId IN (${ids})`
    );
    const values = chunk
      .map(
        (r) =>
          `(${[
            r.enrollmentId,
            sqlVal(r.programId),
            sqlVal(r.paymentOptionId),
            sqlVal(r.batchId),
            sqlVal(r.typeId),
            sqlVal(r.couponName),
            sqlVal(r.couponName2),
            sqlVal(r.couponName3),
            sqlVal(r.currentSem),
            sqlVal(r.sem1Fee), sqlVal(r.sem2Fee), sqlVal(r.sem3Fee), sqlVal(r.sem4Fee), sqlVal(r.sem5Fee), sqlVal(r.sem6Fee),
            sqlVal(r.sem1Scholarship), sqlVal(r.sem2Scholarship), sqlVal(r.sem3Scholarship), sqlVal(r.sem4Scholarship), sqlVal(r.sem5Scholarship), sqlVal(r.sem6Scholarship),
            sqlVal(r.sem1FeeAfter), sqlVal(r.sem2FeeAfter), sqlVal(r.sem3FeeAfter), sqlVal(r.sem4FeeAfter), sqlVal(r.sem5FeeAfter), sqlVal(r.sem6FeeAfter),
          ].join(',')}, ${now}, ${now})`
      )
      .join(',\n');

    await prisma.$executeRawUnsafe(`
      INSERT INTO StudentFeeStructure
        (enrollmentId, programId, paymentOptionId, batchId, typeId, couponName, couponName2, couponName3, currentSem,
         sem1Fee, sem2Fee, sem3Fee, sem4Fee, sem5Fee, sem6Fee,
         sem1Scholarship, sem2Scholarship, sem3Scholarship, sem4Scholarship, sem5Scholarship, sem6Scholarship,
         sem1FeeAfter, sem2FeeAfter, sem3FeeAfter, sem4FeeAfter, sem5FeeAfter, sem6FeeAfter,
         createdAt, updatedAt)
      VALUES ${values}
    `);
    inserted += chunk.length;
    console.log(`  Inserted ${inserted} / ${prepared.length}`);
  }

  const [{ c }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM StudentFeeStructure');
  console.log(`Done. StudentFeeStructure total rows: ${Number(c)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
