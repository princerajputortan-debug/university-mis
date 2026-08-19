/**
 * Replace LeadSource lookup data from Lead_sources.xlsx while preserving FK links.
 *
 * - Upserts rows by explicit `id` from Excel (updates labels in place)
 * - Deletes only unreferenced lead sources not present in the new file
 * - Keeps rows still referenced by AdmissionForm / comission_table_rr even if absent from Excel
 *
 * Usage:
 *   node scripts/import-lead-sources.mjs [path-to-xlsx]
 */
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient } from '../src/generated/prisma/index.js';

const defaultPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'Lead_sources.xlsx'
);
const xlsxPath = process.argv[2] || defaultPath;

if (!fs.existsSync(xlsxPath)) {
  console.error('File not found:', xlsxPath);
  process.exit(1);
}

const prisma = new PrismaClient();

function normalizeLead(value) {
  return String(value ?? '').trim();
}

const workbook = XLSX.readFile(xlsxPath);
const sheetName = workbook.SheetNames[0];
const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

const rows = rawRows
  .map((row) => ({
    id: Number(row.id),
    lead: normalizeLead(row.lead),
  }))
  .filter((row) => Number.isInteger(row.id) && row.id > 0 && row.lead);

console.log('Reading:', xlsxPath);
console.log('Sheet:', sheetName);
console.log('Valid rows:', rows.length);

const [admissionRefs, commissionRefs, beforeCount] = await Promise.all([
  prisma.$queryRawUnsafe(`
    SELECT DISTINCT leadSourceId AS id
    FROM AdmissionForm
    WHERE leadSourceId IS NOT NULL
  `),
  prisma.$queryRawUnsafe(`
    SELECT DISTINCT leadSourceId AS id
    FROM comission_table_rr
  `).catch(() => []),
  prisma.leadSource.count(),
]);

const protectedIds = new Set(
  [...admissionRefs, ...commissionRefs].map((row) => Number(row.id)).filter(Boolean)
);
const excelIds = new Set(rows.map((row) => row.id));

console.log('Lead sources before:', beforeCount);
console.log('Protected linked ids:', protectedIds.size);

// Stage 1: move existing excel ids to temporary unique labels to avoid unique-key clashes.
for (const row of rows) {
  await prisma.leadSource.upsert({
    where: { id: row.id },
    update: { lead: `__import_${row.id}__` },
    create: { id: row.id, lead: `__import_${row.id}__` },
  });
}

const seenLabels = new Set();
let upserted = 0;

for (const row of rows) {
  let lead = row.lead;
  const norm = lead.toLowerCase();
  if (seenLabels.has(norm)) {
    lead = `${lead} (#${row.id})`;
  } else {
    seenLabels.add(norm);
  }

  await prisma.leadSource.update({
    where: { id: row.id },
    data: { lead },
  });
  upserted++;
}

const existing = await prisma.leadSource.findMany({ select: { id: true } });
const deleteCandidates = existing
  .map((row) => row.id)
  .filter((id) => !excelIds.has(id) && !protectedIds.has(id));

let deleted = 0;
if (deleteCandidates.length > 0) {
  const result = await prisma.leadSource.deleteMany({
    where: { id: { in: deleteCandidates } },
  });
  deleted = result.count;
}

const keptButMissingFromExcel = [...protectedIds].filter((id) => !excelIds.has(id)).sort((a, b) => a - b);
const afterCount = await prisma.leadSource.count();
const sample = await prisma.leadSource.findMany({
  take: 5,
  orderBy: { id: 'asc' },
});

console.log('Upserted rows:', upserted);
console.log('Deleted unreferenced old rows:', deleted);
console.log('Kept linked ids missing from Excel:', keptButMissingFromExcel.length);
if (keptButMissingFromExcel.length > 0) {
  console.log('Kept ids (sample):', keptButMissingFromExcel.slice(0, 20));
}
console.log('Lead sources after:', afterCount);
console.log('Sample:', sample);

await prisma.$disconnect();
