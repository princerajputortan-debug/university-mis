/**
 * Fast bulk payment import via MySQL INSERT ... ON DUPLICATE KEY UPDATE.
 * ~100x faster than row-by-row Prisma upserts.
 *
 * Usage: node scripts/import-payment-bulk.mjs jodo "path/to/file.csv"
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const SOURCE_MAP = {
  razorpay: { table: 'RazorpayPayment', delegate: 'razorpayPayment', label: 'Razorpay' },
  jodo: { table: 'JodoPayment', delegate: 'jodoPayment', label: 'Jodo' },
  early: { table: 'EarlyPayment', delegate: 'earlyPayment', label: 'Early' },
  offline: { table: 'OfflinePayment', delegate: 'offlinePayment', label: 'Offline' },
  bank: { table: 'BankPayment', delegate: 'bankPayment', label: 'Bank' },
  propelld: { table: 'PropelldPayment', delegate: 'propelldPayment', label: 'Propelld' },
  others: { table: 'OthersPayment', delegate: 'othersPayment', label: 'Others' },
};

const CHUNK = 2000;

function firstValue(row, keys) {
  for (const key of keys) {
    const v = row[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim().split(/[ T]/)[0];
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')} 12:00:00`;
  }
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')} 12:00:00`;
  }
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  return null;
}

function parseFloatVal(value) {
  if (value === null || value === undefined || value === '') return 0;
  return parseFloat(String(value).replace(/,/g, '')) || 0;
}

function parseIntOpt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(String(value).trim(), 10);
  return Number.isNaN(n) ? null : n;
}

function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function sqlNum(v) {
  if (v === null || v === undefined) return 'NULL';
  return String(v);
}

async function bulkUpsert(table, rows) {
  if (!rows.length) return;
  const cols = `(transactionId, \`date\`, enrollmentId, amount, mode, batchId, discountedCourseFee, firstEmi, tenure, createdAt, updatedAt)`;
  const updates = `\`date\`=VALUES(\`date\`), enrollmentId=VALUES(enrollmentId), amount=VALUES(amount), mode=VALUES(mode), batchId=VALUES(batchId), discountedCourseFee=VALUES(discountedCourseFee), firstEmi=VALUES(firstEmi), tenure=VALUES(tenure), updatedAt=NOW()`;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk
      .map(
        r =>
          `(${sqlStr(r.transactionId)}, ${r.date ? sqlStr(r.date) : 'NULL'}, ${sqlNum(r.enrollmentId)}, ${sqlNum(r.amount)}, ${r.mode ? sqlStr(r.mode) : 'NULL'}, ${sqlNum(r.batchId)}, ${sqlNum(r.discountedCourseFee)}, ${sqlNum(r.firstEmi)}, ${sqlNum(r.tenure)}, NOW(), NOW())`
      )
      .join(',\n');
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`${table}\` ${cols} VALUES ${values} ON DUPLICATE KEY UPDATE ${updates}`
    );
    console.log(`  ${table}: ${Math.min(i + CHUNK, rows.length)} / ${rows.length}`);
  }
}

async function bulkUpsertConsolidated(rows, sourceName) {
  if (!rows.length) return;
  const cols = `(transactionId, \`date\`, enrollmentId, amount, mode, batchId, discountedCourseFee, firstEmi, tenure, sourceName, createdAt, updatedAt)`;
  const updates = `\`date\`=VALUES(\`date\`), enrollmentId=VALUES(enrollmentId), amount=VALUES(amount), mode=VALUES(mode), batchId=VALUES(batchId), discountedCourseFee=VALUES(discountedCourseFee), firstEmi=VALUES(firstEmi), tenure=VALUES(tenure), sourceName=VALUES(sourceName), updatedAt=NOW()`;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk
      .map(
        r =>
          `(${sqlStr(r.transactionId)}, ${r.date ? sqlStr(r.date) : 'NULL'}, ${sqlNum(r.enrollmentId)}, ${sqlNum(r.amount)}, ${r.mode ? sqlStr(r.mode) : 'NULL'}, ${sqlNum(r.batchId)}, ${sqlNum(r.discountedCourseFee)}, ${sqlNum(r.firstEmi)}, ${sqlNum(r.tenure)}, ${sqlStr(sourceName)}, NOW(), NOW())`
      )
      .join(',\n');
    await prisma.$executeRawUnsafe(
      `INSERT INTO ConsolidatedPayment ${cols} VALUES ${values} ON DUPLICATE KEY UPDATE ${updates}`
    );
    console.log(`  ConsolidatedPayment: ${Math.min(i + CHUNK, rows.length)} / ${rows.length}`);
  }
}

async function main() {
  const type = process.argv[2];
  const filePath = process.argv[3];
  if (!type || !filePath || !SOURCE_MAP[type]) {
    console.error('Usage: node scripts/import-payment-bulk.mjs <jodo|razorpay|...> <csv-path>');
    process.exit(1);
  }

  const { table, delegate, label } = SOURCE_MAP[type];
  const text = fs.readFileSync(path.resolve(filePath), 'utf8');
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  const byTx = new Map();

  for (const row of parsed.data) {
    const tx = firstValue(row, [
      'Settlement UTR / Transaction ID', 'TransactionId', 'transactionId',
      'Transaction ID', 'Transaction Id', 'transaction_id',
    ]);
    if (tx) byTx.set(String(tx), row);
  }

  const enrollRows = await prisma.enrollment.findMany({ select: { id: true, enrollment: true } });
  const validIds = new Set(enrollRows.map(r => r.id));
  const enrollTextToId = new Map(
    enrollRows.map(r => [String(r.enrollment).trim().toUpperCase(), r.id])
  );
  const formRows = await prisma.$queryRawUnsafe(`
    SELECT enrollment_no AS enrollmentId, batch AS batchId
    FROM AdmissionForm
    WHERE enrollment_no IS NOT NULL
  `);
  const batchMap = new Map(
    formRows.map((f) => [Number(f.enrollmentId), Number(f.batchId)])
  );

  function isRecoRow(row) {
    const idRaw = firstValue(row, [
      'enrollment_id', 'enrollmentId', 'Enrollment_Id', 'Enrollment ID', 'Enrollment_ID',
      'Enrollment_No', 'Enrollment No',
    ]);
    if (idRaw !== null && String(idRaw).trim().toLowerCase() === 'reco') return true;
    const textRaw = firstValue(row, ['Enrollment', 'EnrollmentNo', 'enrollmentNo', 'enrollment_no']);
    return textRaw !== null && String(textRaw).trim().toLowerCase() === 'reco';
  }

  function resolveEnrollmentId(row) {
    if (isRecoRow(row)) return null;
    const enrollRaw = firstValue(row, [
      'enrollment_id', 'enrollmentId', 'Enrollment_Id', 'Enrollment ID', 'Enrollment_ID',
      'Enrollment_No', 'Enrollment No',
    ]);
    if (enrollRaw !== null) {
      const s = String(enrollRaw).trim();
      if (s && s.toLowerCase() !== 'reco') {
        if (/^\d+$/.test(s)) {
          const id = parseInt(s, 10);
          return validIds.has(id) ? id : null;
        }
      }
    }
    const textRaw = firstValue(row, ['Enrollment', 'EnrollmentNo', 'enrollmentNo', 'enrollment_no']);
    if (textRaw !== null) {
      const s = String(textRaw).trim();
      if (s && s.toLowerCase() !== 'reco') {
        return enrollTextToId.get(s.toUpperCase()) ?? null;
      }
    }
    return null;
  }

  const records = [];
  let recoCount = 0;
  let skipped = 0;
  for (const row of byTx.values()) {
    const tx = firstValue(row, [
      'Settlement UTR / Transaction ID', 'TransactionId', 'transactionId',
      'Transaction ID', 'Transaction Id', 'transaction_id',
    ]);
    if (!tx) {
      skipped++;
      continue;
    }
    const enrollmentId = resolveEnrollmentId(row);
    if (enrollmentId === null && isRecoRow(row)) recoCount++;

    const discounted = parseFloatVal(row['Discounted Course Fee']);
    const firstEmi = parseFloatVal(row['1st EMI']);
    records.push({
      transactionId: String(tx),
      date: parseDate(firstValue(row, ['Date', 'date', 'Payment Date'])),
      enrollmentId,
      amount: parseFloatVal(firstValue(row, ['Transaction Amount (₹)', 'Transaction Amount', 'Amount', 'amount'])),
      mode: row.Mode || row.mode || null,
      batchId: enrollmentId ? (batchMap.get(enrollmentId) ?? null) : null,
      discountedCourseFee: discounted || null,
      firstEmi: firstEmi || null,
      tenure: parseIntOpt(firstValue(row, ['tenure', 'Tenure'])),
    });
  }

  console.log(`Bulk import: ${records.length} rows (${recoCount} reco → Reco tab, ${skipped} skipped) → ${table}`);
  await bulkUpsert(table, records);
  await bulkUpsertConsolidated(records, label);

  const count = await prisma[delegate].count();
  console.log('Done. Total in table:', count);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
