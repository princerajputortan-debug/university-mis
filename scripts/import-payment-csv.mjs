/**
 * Import payment CSV into a specific payment table (+ ConsolidatedPayment).
 * Usage: node scripts/import-payment-csv.mjs jodo "C:\path\to\file.csv"
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const SOURCE_MAP = {
  razorpay: { delegate: 'razorpayPayment', label: 'Razorpay' },
  jodo: { delegate: 'jodoPayment', label: 'Jodo' },
  early: { delegate: 'earlyPayment', label: 'Early' },
  offline: { delegate: 'offlinePayment', label: 'Offline' },
  bank: { delegate: 'bankPayment', label: 'Bank' },
  propelld: { delegate: 'propelldPayment', label: 'Propelld' },
  others: { delegate: 'othersPayment', label: 'Others' },
};

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function parseDateInput(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const datePart = raw.split(/[ T]/)[0];
  const iso = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  const dmy = datePart.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), 12, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function parseEnrollmentRef(row) {
  const idRaw = firstValue(row, [
    'enrollment_id', 'enrollmentId', 'Enrollment_Id', 'Enrollment ID', 'Enrollment_ID',
    'Enrollment_No', 'Enrollment No',
  ]);
  if (idRaw !== null) {
    const s = String(idRaw).trim();
    if (s && s.toLowerCase() !== 'reco') return { kind: 'id', value: s };
  }
  const textRaw = firstValue(row, ['Enrollment', 'EnrollmentNo', 'enrollmentNo', 'enrollment_no']);
  if (textRaw !== null) {
    const s = String(textRaw).trim();
    if (s && s.toLowerCase() !== 'reco') return { kind: 'text', value: s };
  }
  return null;
}

function parseTenure(row) {
  const raw = firstValue(row, ['tenure', 'Tenure', 'TENURE']);
  if (raw === null) return null;
  const parsed = parseInt(String(raw).trim(), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function loadValidEnrollmentIds(ids) {
  if (!ids.length) return new Set();
  const rows = await prisma.enrollment.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  return new Set(rows.map(r => r.id));
}

async function resolveEnrollmentId(row, validNumericIds) {
  const ref = parseEnrollmentRef(row);
  if (!ref) return null;
  if (ref.kind === 'id' && /^\d+$/.test(ref.value)) {
    const id = parseInt(ref.value, 10);
    if (validNumericIds.has(id)) return id;
    const exists = await prisma.enrollment.findUnique({ where: { id }, select: { id: true } });
    if (exists) {
      validNumericIds.add(id);
      return id;
    }
    return null;
  }
  const enrollment = await prisma.enrollment.findFirst({
    where: { enrollment: ref.value.trim() },
    select: { id: true },
  });
  return enrollment?.id ?? null;
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    throw new Error(parsed.errors[0].message);
  }
  return parsed.data;
}

async function main() {
  const type = process.argv[2];
  const filePath = process.argv[3];
  if (!type || !filePath || !SOURCE_MAP[type]) {
    console.error('Usage: node scripts/import-payment-csv.mjs <jodo|razorpay|...> <csv-path>');
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error('File not found:', resolved);
    process.exit(1);
  }

  const { delegate: delegateName, label: sourceName } = SOURCE_MAP[type];
  const specificTable = prisma[delegateName];
  const rawRows = readCsv(resolved);
  const byTx = new Map();
  for (const row of rawRows) {
    const transactionId = firstValue(row, [
      'Settlement UTR / Transaction ID',
      'TransactionId', 'transactionId', 'Transaction ID', 'Transaction Id', 'transaction_id',
    ]);
    if (transactionId) byTx.set(String(transactionId), row);
  }
  const rows = [...byTx.values()];
  console.log(`Importing ${rows.length} rows (${rawRows.length} in file) from ${path.basename(resolved)} → ${delegateName}`);

  const numericIds = [];
  for (const row of rows) {
    const ref = parseEnrollmentRef(row);
    if (ref?.kind === 'id' && /^\d+$/.test(ref.value)) {
      numericIds.push(parseInt(ref.value, 10));
    }
  }
  const validNumericIds = await loadValidEnrollmentIds([...new Set(numericIds)]);
  const batchByEnrollment = new Map();
  if (validNumericIds.size > 0) {
    const ids = [...validNumericIds].join(',');
    const forms = await prisma.$queryRawUnsafe(`
      SELECT enrollment_no AS enrollmentId, batch AS batchId
      FROM AdmissionForm
      WHERE enrollment_no IN (${ids})
    `);
    for (const f of forms) {
      batchByEnrollment.set(Number(f.enrollmentId), Number(f.batchId));
    }
  }

  const CHUNK = 1;
  let saved = 0;
  let skipped = 0;

  async function saveRow(row) {
    const transactionId = firstValue(row, [
      'Settlement UTR / Transaction ID',
      'TransactionId', 'transactionId', 'Transaction ID', 'Transaction Id', 'transaction_id',
    ]);
    if (!transactionId) return 'skip';

    const enrollRaw = firstValue(row, [
      'enrollment_id', 'enrollmentId', 'Enrollment_Id', 'Enrollment_No', 'Enrollment No',
    ]);
    const isReco =
      enrollRaw !== null && String(enrollRaw).trim().toLowerCase() === 'reco';
    const enrollmentId = isReco
      ? null
      : await resolveEnrollmentId(row, validNumericIds);

    const batchId = enrollmentId ? (batchByEnrollment.get(enrollmentId) ?? null) : null;

    let amountStr = firstValue(row, [
      'Transaction Amount (₹)', 'Transaction Amount (â,¹)', 'Amount', 'amount', 'Transaction Amount',
    ]) || '0';
    if (typeof amountStr === 'string') amountStr = amountStr.replace(/,/g, '');

    const commonData = {
      amount: parseFloat(amountStr) || 0,
      date: parseDateInput(firstValue(row, ['Date', 'date', 'Payment Date', 'paymentDate'])),
      enrollmentId,
      mode: row.Mode || row.mode || null,
      batchId,
      discountedCourseFee: parseFloat(row['Discounted Course Fee']) || 0,
      firstEmi: parseFloat(String(row['1st EMI'] ?? '').replace(/,/g, '')) || 0,
      tenure: parseTenure(row),
    };

    const tx = String(transactionId);
    await specificTable.upsert({
      where: { transactionId: tx },
      update: commonData,
      create: { transactionId: tx, ...commonData },
    });
    try {
      await prisma.consolidatedPayment.upsert({
        where: { transactionId: tx },
        update: { ...commonData, sourceName },
        create: { transactionId: tx, ...commonData, sourceName },
      });
    } catch (e) {
      if (e.code === 'P2002') {
        await prisma.consolidatedPayment.update({
          where: { transactionId: tx },
          data: { ...commonData, sourceName },
        });
      } else {
        throw e;
      }
    }
    return 'ok';
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map(saveRow));
    for (const r of results) {
      if (r === 'ok') saved++;
      else skipped++;
    }
    if (i + CHUNK >= rows.length || (i + CHUNK) % 500 < CHUNK) {
      console.log(`  ${Math.min(i + CHUNK, rows.length)} / ${rows.length} processed (${saved} saved, ${skipped} skipped)`);
    }
  }

  const finalCount = await specificTable.count();
  console.log('Done:', { saved, skipped, totalInTable: finalCount });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
