/**
 * Import comission_table_rr.xlsx into MySQL table `comission_table_rr`.
 *
 * Usage:
 *   node scripts/import-comission-table-rr.mjs [path-to-xlsx]
 */
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient } from '../src/generated/prisma/index.js';

const defaultPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'comission_table_rr.xlsx'
);
const xlsxPath = process.argv[2] || defaultPath;

if (!fs.existsSync(xlsxPath)) {
  console.error('File not found:', xlsxPath);
  process.exit(1);
}

const prisma = new PrismaClient();

const workbook = XLSX.readFile(xlsxPath);
const sheetName = workbook.SheetNames[0];
const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

const rows = rawRows
  .map((row) => ({
    leadSourceId: row['Lead Source '] ?? row['Lead Source'] ?? null,
    batchId: row['Batch '] ?? row['Batch'] ?? null,
    commissionPct: row['%'] ?? null,
    combination: row['Combination'] ?? null,
  }))
  .filter((row) => row.leadSourceId != null && row.batchId != null);

console.log('Reading:', xlsxPath);
console.log('Sheet:', sheetName);
console.log('Valid rows:', rows.length);

await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS comission_table_rr`);

await prisma.$executeRawUnsafe(`
  CREATE TABLE comission_table_rr (
    id INT NOT NULL AUTO_INCREMENT,
    leadSourceId INT NOT NULL,
    batchId INT NOT NULL,
    commissionPct DOUBLE NULL,
    combination INT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY comission_table_rr_lead_batch_key (leadSourceId, batchId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

const chunkSize = 50;
let inserted = 0;

for (let i = 0; i < rows.length; i += chunkSize) {
  const chunk = rows.slice(i, i + chunkSize);
  const values = chunk
    .map((row) => {
      const pct = row.commissionPct == null ? 'NULL' : Number(row.commissionPct);
      const combo = row.combination == null ? 'NULL' : Number(row.combination);
      return `(${Number(row.leadSourceId)}, ${Number(row.batchId)}, ${pct}, ${combo})`;
    })
    .join(', ');

  await prisma.$executeRawUnsafe(`
    INSERT INTO comission_table_rr (leadSourceId, batchId, commissionPct, combination)
    VALUES ${values}
  `);
  inserted += chunk.length;
}

const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS cnt FROM comission_table_rr`);
const sample = await prisma.$queryRawUnsafe(`SELECT * FROM comission_table_rr ORDER BY id ASC LIMIT 5`);

console.log('Inserted rows:', inserted);
console.log('Table count:', Number(count[0].cnt));
console.log('Sample rows:', sample);

await prisma.$disconnect();
