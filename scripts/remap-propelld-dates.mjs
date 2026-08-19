/**
 * Remap Propelld payment dates from source CSV (DD-MM-YYYY Date column)
 * into PropelldPayment + ConsolidatedPayment.
 *
 * Usage: node scripts/remap-propelld-dates.mjs [csv-path]
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const DEFAULT_CSV = path.resolve('c:/Users/Mahesh Singh bhati/Downloads/propelld_2026-06-07.csv');

function parseCsvDate(value) {
  if (!value) return null;
  const raw = String(value).trim().split(/[ T]/)[0];
  const dmy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')} 12:00:00`;
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')} 12:00:00`;
  }
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  return null;
}

async function main() {
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CSV;
  if (!fs.existsSync(csvPath)) {
    console.error('CSV not found:', csvPath);
    process.exit(1);
  }

  const text = fs.readFileSync(csvPath, 'utf8');
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  const byTx = new Map();
  for (const row of parsed.data) {
    const tx = String(row['Settlement UTR / Transaction ID'] || '').trim();
    if (tx) byTx.set(tx, row);
  }

  console.log(`Loaded ${byTx.size} rows from ${path.basename(csvPath)}`);

  const before = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS futureCnt, COALESCE(SUM(amount),0) AS futureAmt
    FROM ConsolidatedPayment
    WHERE sourceName='Propelld' AND DATE(date) > CURDATE()
  `);
  console.log('Before — future Consolidated Propelld:', before[0]);

  let updatedPropelld = 0;
  let updatedConsolidated = 0;
  let skipped = 0;

  for (const [transactionId, row] of byTx) {
    const sqlDate = parseCsvDate(row.Date);
    if (!sqlDate) {
      skipped++;
      continue;
    }

    const prop = await prisma.$executeRawUnsafe(
      `UPDATE PropelldPayment SET \`date\` = ? WHERE transactionId = ?`,
      sqlDate,
      transactionId
    );
    if (prop) updatedPropelld++;

    const cons = await prisma.$executeRawUnsafe(
      `UPDATE ConsolidatedPayment SET \`date\` = ? WHERE transactionId = ? AND sourceName = 'Propelld'`,
      sqlDate,
      transactionId
    );
    if (cons) updatedConsolidated++;
  }

  const after = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS futureCnt, COALESCE(SUM(amount),0) AS futureAmt
    FROM ConsolidatedPayment
    WHERE sourceName='Propelld' AND DATE(date) > CURDATE()
  `);

  const [{ mismatches }] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS mismatches
    FROM PropelldPayment p
    INNER JOIN ConsolidatedPayment c
      ON c.transactionId COLLATE utf8mb4_unicode_ci = p.transactionId COLLATE utf8mb4_unicode_ci
    WHERE c.sourceName = 'Propelld'
      AND DATE(p.date) != DATE(c.date)
  `);

  const fmt = n => `${(Number(n) / 1e7).toFixed(2)} Cr`;
  console.log(`Updated PropelldPayment: ${updatedPropelld}`);
  console.log(`Updated ConsolidatedPayment: ${updatedConsolidated}`);
  console.log(`Skipped (no parseable date): ${skipped}`);
  console.log('After — future Consolidated Propelld:', {
    count: Number(after[0].futureCnt),
    amount: fmt(after[0].futureAmt),
  });
  console.log('Remaining date mismatches:', Number(mismatches));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
