/**
 * Update AdmissionForm lead_source + payment_option from Changes.xlsx
 * Match by enrollment text code (Enrollment.enrollment) and/or numeric id.
 *
 * Usage:
 *   node scripts/update-lead-payment-from-changes-xlsx.mjs [path-to-xlsx]
 */
import XLSX from 'xlsx';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const xlsxPath =
  process.argv[2] ||
  'C:/Users/Mahesh Singh bhati/OneDrive/Desktop/Plan 2024/New folder (6)/Table/Changes.xlsx';

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return row[k];
  }
  // tolerant of trailing spaces in headers
  for (const [hk, hv] of Object.entries(row)) {
    const n = hk.trim().toLowerCase();
    if (keys.some((k) => k.trim().toLowerCase() === n) && hv != null && String(hv).trim() !== '') {
      return hv;
    }
  }
  return null;
}

async function main() {
  console.log('Reading:', xlsxPath);
  const wb = XLSX.readFile(xlsxPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log('Excel rows:', rows.length);

  const updates = [];
  for (const row of rows) {
    const code = String(pick(row, 'Enrollment_No', 'enrollment_no', 'Enrollment No') ?? '').trim();
    const numericId = Number(pick(row, 'Enrollment_No_1', 'enrollment_id', 'Enrollment Id'));
    const leadSource = Number(pick(row, 'Lead_source', 'lead_source', 'Lead Source'));
    const paymentOption = Number(pick(row, 'Payment_option', 'Payment_option ', 'payment_option', 'Payment Option'));

    if (!code && !Number.isFinite(numericId)) continue;
    if (!Number.isFinite(leadSource) || !Number.isFinite(paymentOption)) {
      console.warn('Skip (missing lead/payment):', code || numericId);
      continue;
    }
    updates.push({
      code,
      numericId: Number.isFinite(numericId) ? numericId : null,
      leadSource,
      paymentOption,
    });
  }
  console.log('Parsed updates:', updates.length);

  const leadIds = [...new Set(updates.map((u) => u.leadSource))];
  const poIds = [...new Set(updates.map((u) => u.paymentOption))];

  const [leads, pos] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT id, \`lead\` FROM LeadSource WHERE id IN (${leadIds.join(',') || 0})`),
    prisma.$queryRawUnsafe(
      `SELECT id, paymentOption FROM PaymentOption WHERE id IN (${poIds.join(',') || 0})`
    ),
  ]);
  console.log('LeadSource matches:', leads);
  console.log('PaymentOption matches:', pos);

  let matched = 0;
  let updatedAf = 0;
  let updatedSfs = 0;
  let notFound = 0;
  const missing = [];

  for (const u of updates) {
    // Resolve enrollment id: prefer text code, fall back to numeric id column
    let enrollmentId = null;
    if (u.code) {
      const byCode = await prisma.$queryRawUnsafe(
        `SELECT id, enrollment FROM Enrollment WHERE enrollment = ? LIMIT 1`,
        u.code
      );
      if (byCode[0]) enrollmentId = Number(byCode[0].id);
    }
    if (enrollmentId == null && u.numericId != null) {
      const byId = await prisma.$queryRawUnsafe(
        `SELECT id, enrollment FROM Enrollment WHERE id = ? LIMIT 1`,
        u.numericId
      );
      if (byId[0]) enrollmentId = Number(byId[0].id);
    }

    if (enrollmentId == null) {
      notFound += 1;
      missing.push(u.code || String(u.numericId));
      continue;
    }
    matched += 1;

    const afResult = await prisma.$executeRawUnsafe(
      `
      UPDATE AdmissionForm
      SET lead_source = ?, payment_option = ?
      WHERE enrollment_no = ?
      `,
      u.leadSource,
      u.paymentOption,
      enrollmentId
    );
    updatedAf += Number(afResult);

    const sfsResult = await prisma.$executeRawUnsafe(
      `
      UPDATE StudentFeeStructure
      SET paymentOptionId = ?
      WHERE enrollmentId = ?
      `,
      u.paymentOption,
      enrollmentId
    );
    updatedSfs += Number(sfsResult);
  }

  console.log('\nDone');
  console.log('Matched enrollments:', matched);
  console.log('AdmissionForm rows updated:', updatedAf);
  console.log('StudentFeeStructure paymentOptionId updated:', updatedSfs);
  console.log('Not found:', notFound);
  if (missing.length) {
    console.log('Missing sample:', missing.slice(0, 20));
  }

  // Spot-check a few
  const sampleCodes = updates.slice(0, 3).map((u) => u.code).filter(Boolean);
  if (sampleCodes.length) {
    const placeholders = sampleCodes.map(() => '?').join(',');
    const check = await prisma.$queryRawUnsafe(
      `
      SELECT e.enrollment, af.enrollment_no, af.lead_source, af.payment_option
      FROM Enrollment e
      LEFT JOIN AdmissionForm af ON af.enrollment_no = e.id
      WHERE e.enrollment IN (${placeholders})
      `,
      ...sampleCodes
    );
    console.log('Spot check:', check);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
