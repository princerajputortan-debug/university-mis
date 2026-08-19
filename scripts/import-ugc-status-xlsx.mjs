/**
 * Update AdmissionForm.ugc_status from an Excel file keyed by enrollment_no.
 *
 * Usage:
 *   node scripts/import-ugc-status-xlsx.mjs [path-to-xlsx]
 *
 * Expected columns: Enrollment_No, UGC_status (name or numeric id)
 */
import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const defaultPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'Revised UGC status .xlsx'
);
const xlsxPath = process.argv[2] || defaultPath;

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function readRows(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!raw.length) return [];

  const header = raw[0].map(normalizeHeader);
  const enrollmentIdx = header.findIndex((h) => h === 'enrollment_no' || h === 'enrollment_id');
  const ugcIdx = header.findIndex((h) => h.startsWith('ugc_status'));

  if (enrollmentIdx < 0 || ugcIdx < 0) {
    throw new Error(`Missing columns. Found headers: ${header.join(', ')}`);
  }

  return raw
    .slice(1)
    .map((row) => ({
      enrollmentNo: parseInt(String(row[enrollmentIdx] ?? '').trim(), 10),
      ugcStatus: String(row[ugcIdx] ?? '').trim(),
    }))
    .filter((row) => Number.isFinite(row.enrollmentNo) && row.enrollmentNo > 0 && row.ugcStatus);
}

async function loadUgcStatusMap() {
  const rows = await prisma.ugcStatus.findMany({
    select: { id: true, ugcStatus: true },
  });
  const byId = new Map();
  const byName = new Map();
  for (const row of rows) {
    byId.set(row.id, row.id);
    byName.set(row.ugcStatus.toLowerCase(), row.id);
  }
  return { byId, byName, rows };
}

function resolveUgcStatusId(value, map) {
  const asNum = parseInt(value, 10);
  if (Number.isFinite(asNum) && map.byId.has(asNum)) return asNum;
  const byName = map.byName.get(value.toLowerCase());
  if (byName) return byName;
  return null;
}

async function main() {
  console.log('Reading:', xlsxPath);
  const rows = readRows(xlsxPath);
  console.log(`Parsed ${rows.length} rows`);

  const ugcMap = await loadUgcStatusMap();
  console.log(
    'UgcStatus lookup:',
    ugcMap.rows.map((r) => `${r.id}=${r.ugcStatus}`).join(', ')
  );

  const updates = [];
  const unknownStatus = new Set();
  const duplicateEnrollments = new Set();
  const seen = new Set();

  for (const row of rows) {
    const ugcStatusId = resolveUgcStatusId(row.ugcStatus, ugcMap);
    if (!ugcStatusId) {
      unknownStatus.add(row.ugcStatus);
      continue;
    }
    if (seen.has(row.enrollmentNo)) duplicateEnrollments.add(row.enrollmentNo);
    seen.add(row.enrollmentNo);
    updates.push({ enrollmentNo: row.enrollmentNo, ugcStatusId });
  }

  if (unknownStatus.size) {
    console.warn('Unknown UGC status values (skipped):', [...unknownStatus]);
  }
  if (duplicateEnrollments.size) {
    console.warn(`Duplicate enrollment rows: ${duplicateEnrollments.size} (last value wins)`);
  }

  let updated = 0;
  let notFound = 0;
  let unchanged = 0;

  const chunkSize = 200;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    for (const { enrollmentNo, ugcStatusId } of chunk) {
      const result = await prisma.$executeRawUnsafe(
        'UPDATE AdmissionForm SET ugc_status = ? WHERE enrollment_no = ?',
        ugcStatusId,
        enrollmentNo
      );
      const affected = Number(result);
      if (affected === 0) notFound += 1;
      else updated += 1;
    }
    process.stdout.write(`\r  Progress: ${Math.min(i + chunkSize, updates.length)} / ${updates.length}`);
  }
  console.log('');

  const [{ total }] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS total FROM AdmissionForm WHERE ugc_status IN (4, 5)
  `);

  console.log('Done.');
  console.log(`  Updated: ${updated}`);
  console.log(`  Not found (no AdmissionForm for enrollment_no): ${notFound}`);
  console.log(`  AdmissionForm rows with ugc_status 4 or 5: ${total}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
