/**
 * Import lead source payout rows from CSV/Excel-style data.
 *
 * Expected columns (flexible headers):
 * - Enrollment / enrollmentId
 * - LeadSource_Code / leadSourceId
 * - Commission % / commissionPct
 * - Pay Out / payoutAmount
 * - Invoice no. / invoiceNo
 * - Month / month
 * - Status / status
 *
 * Usage: node scripts/import-lead-source-payout.mjs [path-to-csv]
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const csvPath = process.argv[2];

if (!csvPath || !fs.existsSync(csvPath)) {
  console.error('Usage: node scripts/import-lead-source-payout.mjs <path-to-csv>');
  process.exit(1);
}

function pick(row, keys) {
  for (const key of keys) {
    const found = Object.keys(row).find(
      (k) => k.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, '')
    );
    if (found && row[found] != null && String(row[found]).trim() !== '') {
      return String(row[found]).trim();
    }
  }
  return '';
}

function parsePct(value) {
  if (!value) return null;
  const n = parseFloat(String(value).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseAmount(value) {
  const n = parseFloat(String(value).replace(/[,₹]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

const parsed = Papa.parse(fs.readFileSync(csvPath, 'utf8'), {
  header: true,
  skipEmptyLines: true,
});

let inserted = 0;
let skipped = 0;

for (const row of parsed.data) {
  const enrollmentId = parseInt(pick(row, ['enrollment', 'enrollmentid']), 10);
  const leadSourceId = parseInt(pick(row, ['leadsource_code', 'leadsourceid', 'leadsource']), 10);
  const payoutAmount = parseAmount(pick(row, ['payout', 'payoutamount', 'pay out']));

  if (!enrollmentId || !leadSourceId || payoutAmount <= 0) {
    skipped++;
    continue;
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  const leadSource = await prisma.leadSource.findUnique({ where: { id: leadSourceId } });
  if (!enrollment || !leadSource) {
    skipped++;
    continue;
  }

  await prisma.leadSourcePayout.create({
    data: {
      enrollmentId,
      leadSourceId,
      commissionPct: parsePct(pick(row, ['commission', 'commissionpct', 'commission %'])),
      payoutAmount,
      invoiceNo: pick(row, ['invoiceno', 'invoice no', 'invoice']) || null,
      month: pick(row, ['month']) || null,
      status: pick(row, ['status']) || null,
    },
  });
  inserted++;
}

await prisma.$executeRawUnsafe(`DELETE FROM LeadSourcePayoutSummary`);
await prisma.$executeRawUnsafe(`
  INSERT INTO LeadSourcePayoutSummary (enrollmentId, leadSourceId, payoutPaid, createdAt, updatedAt)
  SELECT enrollmentId, leadSourceId, COALESCE(SUM(payoutAmount), 0), NOW(), NOW()
  FROM LeadSourcePayout
  GROUP BY enrollmentId, leadSourceId
`);

console.log(`Inserted: ${inserted}, Skipped: ${skipped}`);
await prisma.$disconnect();
