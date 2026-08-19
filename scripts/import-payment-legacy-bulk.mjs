/**
 * Bulk import payment CSV into legacy payment tables + ConsolidatedPayment.
 * Usage: node scripts/import-payment-legacy-bulk.mjs razorpay "path/to/file.csv"
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const CHUNK = 500;
const TX_COL = 'settlement_utr_/_transaction_id';

const SOURCE_MAP = {
  razorpay: { table: 'RazorpayPayment', label: 'Razorpay', hasEnrollmentIdCol: true },
  jodo: { table: 'JodoPayment', label: 'Jodo', hasEnrollmentIdCol: false },
  early: { table: 'EarlyPayment', label: 'Early', hasEnrollmentIdCol: false },
  propelld: { table: 'PropelldPayment', label: 'Propelld', hasEnrollmentIdCol: false },
};

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
  if (v === null || v === undefined || v === '') return 'NULL';
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
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
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

async function getAmountColumn(table) {
  const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\``);
  const col = cols.find((c) => String(c.Field).toLowerCase().startsWith('transaction_amount'));
  if (!col) throw new Error(`No amount column on ${table}`);
  return col.Field;
}

async function loadMaps() {
  const enrollments = await prisma.$queryRawUnsafe(`
    SELECT id, enrollment FROM Enrollment WHERE id IS NOT NULL
  `);
  const idToText = new Map(
    enrollments.map((r) => [Number(r.id), String(r.enrollment)])
  );
  const validIds = new Set(enrollments.map((r) => Number(r.id)));

  const forms = await prisma.$queryRawUnsafe(`
    SELECT enrollment_no AS enrollmentId, batch AS batchId
    FROM AdmissionForm
    WHERE enrollment_no IS NOT NULL
  `);
  const batchMap = new Map(
    forms.map((f) => [Number(f.enrollmentId), f.batchId != null ? Number(f.batchId) : null])
  );

  return { idToText, validIds, batchMap };
}

function resolveEnrollmentId(row, validIds) {
  const raw = firstValue(row, [
    'enrollment_id',
    'enrollmentId',
    'Enrollment_Id',
    'Enrollment ID',
    'Enrollment_No',
    'Enrollment No',
  ]);
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'reco') return null;
  if (/^\d+$/.test(s)) {
    const id = parseInt(s, 10);
    return validIds.has(id) ? id : null;
  }
  return null;
}

async function nextLegacyPaymentId(table) {
  const [{ nextId }] = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM \`${table}\`
  `);
  return Number(nextId);
}

/** Legacy payment tables have no unique key on transaction id — upsert row-by-row. */
async function bulkUpsertLegacy(table, amountCol, rows, hasEnrollmentIdCol) {
  if (!rows.length) return;

  let nextId = await nextLegacyPaymentId(table);
  let updated = 0;
  let inserted = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM \`${table}\` WHERE \`${TX_COL}\` = ? ORDER BY id IS NULL, id DESC LIMIT 1`,
      r.transactionId
    );

    const dataFields = [
      ['date', r.date],
      ['enrollment_id', r.enrollmentText],
      [amountCol, r.amount],
      ['mode', r.mode],
      ['discounted_course_fee', r.discountedCourseFee],
      ['1st_emi', r.firstEmi],
      ['tenure', r.tenure],
    ];
    if (hasEnrollmentIdCol) {
      dataFields.push(['enrollmentId', r.enrollmentId], ['batchId', r.batchId]);
    }

    if (existing.length && existing[0].id != null) {
      const setClause = dataFields.map(([col]) => `\`${col}\` = ?`).join(', ');
      await prisma.$executeRawUnsafe(
        `UPDATE \`${table}\` SET ${setClause} WHERE id = ?`,
        ...dataFields.map(([, value]) => value),
        Number(existing[0].id)
      );
      updated += 1;
    } else if (existing.length) {
      const setClause = dataFields.map(([col]) => `\`${col}\` = ?`).join(', ');
      await prisma.$executeRawUnsafe(
        `UPDATE \`${table}\` SET id = ?, ${setClause} WHERE \`${TX_COL}\` = ? AND id IS NULL LIMIT 1`,
        nextId,
        ...dataFields.map(([, value]) => value),
        r.transactionId
      );
      nextId += 1;
      updated += 1;
    } else {
      const insertCols = ['id', TX_COL, ...dataFields.map(([col]) => col)];
      const insertValues = [nextId, r.transactionId, ...dataFields.map(([, value]) => value)];
      const colList = insertCols.map((col) => `\`${col}\``).join(', ');
      const placeholders = insertCols.map(() => '?').join(', ');
      await prisma.$executeRawUnsafe(
        `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders})`,
        ...insertValues
      );
      nextId += 1;
      inserted += 1;
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM \`${table}\` WHERE \`${TX_COL}\` = ? AND (id IS NULL OR id != ?)`,
      r.transactionId,
      existing.length && existing[0].id != null ? Number(existing[0].id) : nextId - 1
    );

    if ((i + 1) % 100 === 0 || i + 1 === rows.length) {
      console.log(`  ${table}: ${i + 1} / ${rows.length} (${inserted} inserted, ${updated} updated)`);
    }
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
        (r) =>
          `(${sqlStr(r.transactionId)}, ${r.date ? sqlStr(`${r.date} 12:00:00`) : 'NULL'}, ${sqlNum(r.enrollmentId)}, ${sqlNum(r.amount)}, ${r.mode ? sqlStr(r.mode) : 'NULL'}, ${sqlNum(r.batchId)}, ${sqlNum(r.discountedCourseFee)}, ${sqlNum(r.firstEmi)}, ${sqlNum(r.tenure)}, ${sqlStr(sourceName)}, NOW(), NOW())`
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
    console.error('Usage: node scripts/import-payment-legacy-bulk.mjs <razorpay|jodo|...> <csv-path>');
    process.exit(1);
  }

  const { table, label, hasEnrollmentIdCol } = SOURCE_MAP[type];
  const amountCol = await getAmountColumn(table);
  const maps = await loadMaps();

  const text = fs.readFileSync(path.resolve(filePath), 'utf8');
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  const byTx = new Map();
  for (const row of parsed.data) {
    const tx = firstValue(row, [
      'Settlement UTR / Transaction ID',
      'TransactionId',
      'transactionId',
      'Transaction ID',
      'transaction_id',
    ]);
    if (tx) byTx.set(String(tx).trim(), row);
  }

  const records = [];
  for (const row of byTx.values()) {
    const tx = firstValue(row, [
      'Settlement UTR / Transaction ID',
      'TransactionId',
      'transactionId',
      'Transaction ID',
      'transaction_id',
    ]);
    if (!tx) continue;

    const enrollmentId = resolveEnrollmentId(row, maps.validIds);
    const enrollmentText =
      enrollmentId != null
        ? maps.idToText.get(enrollmentId) ?? String(enrollmentId)
        : null;
    const batchId = enrollmentId != null ? (maps.batchMap.get(enrollmentId) ?? null) : null;
    const discounted = parseFloat(String(row['Discounted Course Fee'] ?? '').replace(/,/g, '')) || null;
    const firstEmi = parseFloat(String(row['1st EMI'] ?? '').replace(/,/g, '')) || null;
    const tenureRaw = firstValue(row, ['tenure', 'Tenure']);
    const tenure = tenureRaw != null && String(tenureRaw).trim() !== '' ? parseInt(String(tenureRaw), 10) : null;

    records.push({
      transactionId: String(tx).trim(),
      date: parseDate(firstValue(row, ['Date', 'date', 'Payment Date'])),
      enrollmentId,
      enrollmentText,
      amount: parseAmount(row),
      mode: row.Mode || row.mode || null,
      batchId,
      discountedCourseFee: discounted,
      firstEmi: firstEmi || null,
      tenure: Number.isNaN(tenure) ? null : tenure,
    });
  }

  const [{ c: before }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM \`${table}\` WHERE \`${TX_COL}\` IS NOT NULL AND \`${TX_COL}\` != ''`
  );

  console.log(`Importing ${records.length} rows → ${table} (amount col: ${amountCol})`);
  await bulkUpsertLegacy(table, amountCol, records, hasEnrollmentIdCol);
  await bulkUpsertConsolidated(records, label);

  const [{ c: after }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM \`${table}\` WHERE \`${TX_COL}\` IS NOT NULL AND \`${TX_COL}\` != ''`
  );
  const [{ c: consolidated }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM ConsolidatedPayment WHERE sourceName = ${sqlStr(label)}`
  );

  console.log(`Done. ${table} valid rows: ${Number(before)} → ${Number(after)}`);
  console.log(`Consolidated ${label}: ${Number(consolidated)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
