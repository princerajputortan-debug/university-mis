/**
 * Fast full-replace import of Misc dump into MiscPayment + ConsolidatedPayment.
 * Misc is collection-only (no enrollment / batch / EMI fields).
 *
 * Usage: node scripts/import-misc-bulk-fast.mjs "<csv path>"
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const CHUNK = 1000;
const LABEL = 'Misc';

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node scripts/import-misc-bulk-fast.mjs "<csv path>"');
  process.exit(1);
}

function firstValue(row, keys) {
  for (const key of keys) {
    const v = row[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}
function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}
function sqlNum(v) {
  if (v === null || v === undefined || v === '' || Number.isNaN(v)) return 'NULL';
  return String(v);
}
function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim().split(/[ T]/)[0];
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function parseAmount(row) {
  const raw = firstValue(row, [
    'Transaction Amount (₹)',
    'Transaction Amount (â,¹)',
    'Transaction Amount',
    'Amount',
    'amount',
  ]);
  return parseFloat(String(raw ?? '0').replace(/,/g, '')) || 0;
}

async function main() {
  const parsed = Papa.parse(fs.readFileSync(path.resolve(csvPath), 'utf8').trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const byTx = new Map();
  for (const row of parsed.data) {
    const tx = firstValue(row, [
      'Settlement UTR / Transaction ID',
      'Transaction ID',
      'transaction_id',
      'transactionId',
    ]);
    if (tx) byTx.set(String(tx).trim(), row);
  }

  const records = [];
  for (const row of byTx.values()) {
    const tx = String(
      firstValue(row, [
        'Settlement UTR / Transaction ID',
        'Transaction ID',
        'transaction_id',
        'transactionId',
      ])
    ).trim();
    const descRaw = firstValue(row, ['Description', 'description', 'Remarks', 'remarks']);
    records.push({
      transactionId: tx,
      date: parseDate(firstValue(row, ['Date', 'date', 'Payment Date'])),
      amount: parseAmount(row),
      mode: (row.Mode || row.mode || null) ? String(row.Mode || row.mode).trim() : null,
      description: descRaw != null ? String(descRaw).trim() || null : null,
    });
  }

  console.log(
    `Parsed ${parsed.data.length} rows → ${records.length} unique transactions`
  );

  await prisma.$executeRawUnsafe('DELETE FROM MiscPayment');
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const values = chunk
      .map(
        (r) =>
          `(${sqlStr(r.date ? `${r.date} 12:00:00.000` : null)}, ${sqlStr(r.transactionId)}, ${sqlNum(r.amount)}, ${sqlStr(r.mode)}, ${sqlStr(r.description)}, NOW(3), NOW(3))`
      )
      .join(',\n');
    await prisma.$executeRawUnsafe(`
      INSERT INTO MiscPayment (date, transactionId, amount, mode, description, createdAt, updatedAt)
      VALUES ${values}
    `);
    console.log(`  MiscPayment: ${Math.min(i + CHUNK, records.length)} / ${records.length}`);
  }

  // Remove any leftover Misc rows from ConsolidatedPayment (Misc must not live there).
  const removed = await prisma.$executeRawUnsafe(
    `DELETE FROM ConsolidatedPayment WHERE sourceName = ${sqlStr(LABEL)}`
  );

  const [{ c: misc }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM MiscPayment');
  const [{ s: sumAmt }] = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(amount),0) AS s FROM MiscPayment`
  );
  const [{ cpMisc }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS cpMisc FROM ConsolidatedPayment WHERE sourceName = ${sqlStr(LABEL)}`
  );
  console.log(
    `\nDone. MiscPayment=${Number(misc)} sum=${Number(sumAmt)}; removed leftover ConsolidatedPayment Misc rows=${removed}; remaining CP Misc=${Number(cpMisc)}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
