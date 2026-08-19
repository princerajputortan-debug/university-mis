/**
 * Set AdmissionForm.ugc_status = 5 (Bypass) for enrollments listed in Excel.
 *
 * Usage:
 *   node scripts/import-ugc-bypass-xlsx.mjs [path-to-xlsx]
 */
import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const BYPASS = 5;
const defaultPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'enrollment_bypass.xlsx'
);
const xlsxPath = process.argv[2] || defaultPath;

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function readEnrollmentCodes(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!raw.length) return { codes: [], enrollmentIds: [] };

  const header = raw[0].map(normalizeHeader);
  const enrollmentIdx = header.findIndex(
    (h) =>
      h === 'enrollment' ||
      h === 'enrollment_no' ||
      h === 'enrollment_id' ||
      h === 'enrollment_number'
  );
  const enrollmentNoIdx = header.findIndex(
    (h) => h === 'enrollment_no' || h === 'enrollmentid'
  );

  const codes = [];
  const codeSeen = new Set();
  const enrollmentIds = [];
  const idSeen = new Set();

  for (const row of raw.slice(1)) {
    if (enrollmentNoIdx >= 0) {
      const id = parseInt(String(row[enrollmentNoIdx] ?? '').trim(), 10);
      if (Number.isFinite(id) && id > 0 && !idSeen.has(id)) {
        idSeen.add(id);
        enrollmentIds.push(id);
      }
    }

    if (enrollmentIdx >= 0 && enrollmentIdx !== enrollmentNoIdx) {
      const code = String(row[enrollmentIdx] ?? '').trim();
      if (code && !codeSeen.has(code.toLowerCase())) {
        codeSeen.add(code.toLowerCase());
        codes.push(code);
      }
    }
  }

  if (enrollmentIdx < 0 && enrollmentNoIdx < 0) {
    throw new Error(`Missing enrollment column. Found headers: ${header.join(', ')}`);
  }

  return { codes, enrollmentIds };
}

async function resolveEnrollmentIds(codes) {
  const found = new Map();
  const missing = [];

  const chunkSize = 100;
  for (let i = 0; i < codes.length; i += chunkSize) {
    const chunk = codes.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, TRIM(enrollment) AS enrollment
       FROM enrollment_id
       WHERE TRIM(enrollment) IN (${placeholders})`,
      ...chunk
    );

    for (const row of rows) {
      found.set(String(row.enrollment).toLowerCase(), Number(row.id));
    }
  }

  for (const code of codes) {
    if (!found.has(code.toLowerCase())) missing.push(code);
  }

  return { found, missing };
}

async function main() {
  console.log('Reading:', xlsxPath);
  const { codes, enrollmentIds } = readEnrollmentCodes(xlsxPath);
  console.log(`Parsed ${codes.length} enrollment codes, ${enrollmentIds.length} enrollment IDs`);

  const [{ bypassBefore }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS bypassBefore FROM AdmissionForm WHERE ugc_status = ${BYPASS}`
  );
  const [{ erpBefore }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS erpBefore FROM AdmissionForm WHERE ugc_status = 4`
  );
  console.log(`Before: ERP(4)=${Number(erpBefore)}, Bypass(5)=${Number(bypassBefore)}`);

  const { found, missing } = await resolveEnrollmentIds(codes);
  for (const id of enrollmentIds) {
    found.set(String(id), id);
  }
  console.log(`Resolved ${found.size} unique enrollment IDs, ${missing.length} codes not in enrollment_id`);

  if (missing.length) {
    console.warn('Missing enrollments (first 10):', missing.slice(0, 10));
  }

  let updated = 0;
  let notFound = 0;
  let alreadyBypass = 0;
  let fromErp = 0;

  const enrollmentNos = [...found.values()];
  for (const enrollmentNo of enrollmentNos) {
    const existing = await prisma.$queryRawUnsafe(
      `SELECT ugc_status FROM AdmissionForm WHERE enrollment_no = ${enrollmentNo} LIMIT 1`
    );
    if (!existing.length) {
      notFound += 1;
      continue;
    }
    if (Number(existing[0].ugc_status) === BYPASS) {
      alreadyBypass += 1;
      continue;
    }
    if (Number(existing[0].ugc_status) === 4) fromErp += 1;

    const result = await prisma.$executeRawUnsafe(
      `UPDATE AdmissionForm SET ugc_status = ${BYPASS} WHERE enrollment_no = ${enrollmentNo}`
    );
    if (Number(result) > 0) updated += 1;
  }

  const [{ bypassAfter }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS bypassAfter FROM AdmissionForm WHERE ugc_status = ${BYPASS}`
  );
  const [{ erpAfter }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS erpAfter FROM AdmissionForm WHERE ugc_status = 4`
  );

  console.log('\nDone.');
  console.log(`  Updated to Bypass (5): ${updated}`);
  console.log(`  Of which were ERP (4): ${fromErp}`);
  console.log(`  Already Bypass: ${alreadyBypass}`);
  console.log(`  No AdmissionForm row: ${notFound}`);
  console.log(`  Missing enrollment_id lookup: ${missing.length}`);
  console.log(`After: ERP(4)=${Number(erpAfter)}, Bypass(5)=${Number(bypassAfter)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
