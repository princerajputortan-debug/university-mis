/**
 * Fast full-replace import of a Propelld dump into PropelldPayment + ConsolidatedPayment.
 * Usage: node scripts/import-propelld-bulk-fast.mjs "<csv path>"
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const CHUNK = 1000;
const TABLE = 'PropelldPayment';
const LABEL = 'Propelld';
const TX_COL = 'settlement_utr_/_transaction_id';

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node scripts/import-propelld-bulk-fast.mjs "<csv path>"');
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
  const raw = firstValue(row, ['Transaction Amount (₹)', 'Transaction Amount (â,¹)', 'Transaction Amount', 'Amount', 'amount']);
  return parseFloat(String(raw ?? '0').replace(/,/g, '')) || 0;
}

async function getAmountColumn() {
  const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${TABLE}\``);
  const col = cols.find((c) => String(c.Field).toLowerCase().startsWith('transaction_amount'));
  if (!col) throw new Error('No amount column');
  return col.Field;
}

async function main() {
  const amountCol = await getAmountColumn();

  const enrollments = await prisma.$queryRawUnsafe('SELECT id, enrollment FROM Enrollment WHERE id IS NOT NULL');
  const idToText = new Map(enrollments.map((r) => [Number(r.id), String(r.enrollment)]));
  const validIds = new Set(enrollments.map((r) => Number(r.id)));
  const forms = await prisma.$queryRawUnsafe('SELECT enrollment_no AS e, batch AS b FROM AdmissionForm WHERE enrollment_no IS NOT NULL');
  const batchMap = new Map(forms.map((f) => [Number(f.e), f.b != null ? Number(f.b) : null]));

  const parsed = Papa.parse(fs.readFileSync(path.resolve(csvPath), 'utf8').trim(), { header: true, skipEmptyLines: true });

  const byTx = new Map();
  for (const row of parsed.data) {
    const tx = firstValue(row, ['Settlement UTR / Transaction ID', 'Transaction ID', 'transaction_id']);
    if (tx) byTx.set(String(tx).trim(), row);
  }

  let mapped = 0;
  const records = [];
  for (const row of byTx.values()) {
    const tx = String(firstValue(row, ['Settlement UTR / Transaction ID', 'Transaction ID', 'transaction_id'])).trim();
    const rawEnr = firstValue(row, ['enrollment_id', 'enrollmentId', 'Enrollment_No', 'Enrollment No']);
    let enrollmentId = null;
    if (rawEnr != null) {
      const s = String(rawEnr).trim();
      if (/^\d+$/.test(s) && validIds.has(parseInt(s, 10))) enrollmentId = parseInt(s, 10);
    }
    if (enrollmentId != null) mapped++;
    const tenureRaw = firstValue(row, ['tenure', 'Tenure']);
    const tenure = tenureRaw != null && String(tenureRaw).trim() !== '' ? parseInt(String(tenureRaw), 10) : null;
    records.push({
      transactionId: tx,
      date: parseDate(firstValue(row, ['Date', 'date', 'Payment Date'])),
      enrollmentId,
      enrollmentText: enrollmentId != null ? (idToText.get(enrollmentId) ?? String(enrollmentId)) : (rawEnr != null ? String(rawEnr).trim() : null),
      amount: parseAmount(row),
      mode: row.Mode || row.mode || null,
      batchId: enrollmentId != null ? (batchMap.get(enrollmentId) ?? null) : null,
      discountedCourseFee: parseFloat(String(row['Discounted Course Fee'] ?? '').replace(/,/g, '')) || null,
      firstEmi: parseFloat(String(row['1st EMI'] ?? '').replace(/,/g, '')) || null,
      tenure: Number.isNaN(tenure) ? null : tenure,
    });
  }

  console.log(`Parsed ${parsed.data.length} rows → ${records.length} unique transactions (enrollment mapped: ${mapped})`);

  await prisma.$executeRawUnsafe(`DELETE FROM \`${TABLE}\``);
  let id = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const values = chunk.map((r) => {
      id += 1;
      return `(${id}, ${sqlStr(r.date)}, ${sqlStr(r.transactionId)}, ${sqlStr(r.enrollmentText)}, ${sqlNum(r.amount)}, ${sqlStr(r.mode)}, ${sqlNum(r.discountedCourseFee)}, ${sqlNum(r.firstEmi)}, ${sqlNum(r.tenure)}, ${sqlNum(r.batchId)}, ${sqlNum(r.enrollmentId)})`;
    }).join(',\n');
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`${TABLE}\` (id, \`date\`, \`${TX_COL}\`, enrollment_id, \`${amountCol}\`, mode, discounted_course_fee, \`1st_emi\`, tenure, batchId, enrollmentId) VALUES ${values}`
    );
    console.log(`  ${TABLE}: ${Math.min(i + CHUNK, records.length)} / ${records.length}`);
  }

  await prisma.$executeRawUnsafe(`DELETE FROM ConsolidatedPayment WHERE sourceName = ${sqlStr(LABEL)}`);
  const cols = `(transactionId, \`date\`, enrollmentId, amount, mode, batchId, discountedCourseFee, firstEmi, tenure, sourceName, createdAt, updatedAt)`;
  const updates = `\`date\`=VALUES(\`date\`), enrollmentId=VALUES(enrollmentId), amount=VALUES(amount), mode=VALUES(mode), batchId=VALUES(batchId), discountedCourseFee=VALUES(discountedCourseFee), firstEmi=VALUES(firstEmi), tenure=VALUES(tenure), sourceName=VALUES(sourceName), updatedAt=NOW()`;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const values = chunk.map((r) =>
      `(${sqlStr(r.transactionId)}, ${r.date ? sqlStr(`${r.date} 12:00:00`) : 'NULL'}, ${sqlNum(r.enrollmentId)}, ${sqlNum(r.amount)}, ${r.mode ? sqlStr(r.mode) : 'NULL'}, ${sqlNum(r.batchId)}, ${sqlNum(r.discountedCourseFee)}, ${sqlNum(r.firstEmi)}, ${sqlNum(r.tenure)}, ${sqlStr(LABEL)}, NOW(), NOW())`
    ).join(',\n');
    await prisma.$executeRawUnsafe(`INSERT INTO ConsolidatedPayment ${cols} VALUES ${values} ON DUPLICATE KEY UPDATE ${updates}`);
    console.log(`  ConsolidatedPayment: ${Math.min(i + CHUNK, records.length)} / ${records.length}`);
  }

  const [{ c: prop }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${TABLE}\``);
  const [{ c: con }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ConsolidatedPayment WHERE sourceName = ${sqlStr(LABEL)}`);
  const [{ c: withEnr }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ConsolidatedPayment WHERE sourceName = ${sqlStr(LABEL)} AND enrollmentId IS NOT NULL`);
  console.log(`\nDone. ${TABLE}=${Number(prop)} rows, ConsolidatedPayment(${LABEL})=${Number(con)} (mapped ${Number(withEnr)})`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
