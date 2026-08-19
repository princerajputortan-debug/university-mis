/**
 * Re-import base fee structure using numeric FK ids from CSV,
 * then backfill AdmissionForm fee fields from FeeStructure.
 *
 * Usage: node scripts/reimport-fee-structure.mjs [path-to-csv]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '../src/generated/prisma/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function resolveFkOrLabel(value, findById, ensureByLabel) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const id = parseInt(raw, 10);
    const row = await findById(id);
    if (row) return id;
  }
  return ensureByLabel(raw);
}

async function resolveBatchFk(value) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.batch.findUnique({ where: { id } }),
    async (label) => {
      const row = await prisma.batch.findFirst({ where: { batch: label } });
      return row?.id ?? null;
    }
  );
}

async function resolvePaymentOptionFk(value) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.paymentOption.findUnique({ where: { id } }),
    async (label) => {
      const row = await prisma.paymentOption.findFirst({ where: { paymentOption: label } });
      return row?.id ?? null;
    }
  );
}

async function resolveProgramFk(value) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.program.findUnique({ where: { id } }),
    async (label) => {
      const row = await prisma.program.findFirst({ where: { program: label } });
      return row?.id ?? null;
    }
  );
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? '').trim();
    });
    return row;
  });
}

const defaultCsv = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'fee_template_2026-06-08.csv'
);
const csvPath = process.argv[2] || defaultCsv;

if (!fs.existsSync(csvPath)) {
  console.error('CSV not found:', csvPath);
  process.exit(1);
}

console.log('Reading', csvPath);
const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
console.log('Rows:', rows.length);

const deleted = await prisma.feeStructure.deleteMany();
console.log('Cleared FeeStructure rows:', deleted.count);

let imported = 0;
let skipped = 0;

for (const row of rows) {
  const batch = row.batch;
  const paymentOption = row.payment_option;
  const program = row.program;
  const semFee = parseFloat(row.sem_fee);
  if (!batch || !paymentOption || !program || Number.isNaN(semFee)) {
    skipped++;
    continue;
  }

  const [batchId, paymentOptionId, programId] = await Promise.all([
    resolveBatchFk(batch),
    resolvePaymentOptionFk(paymentOption),
    resolveProgramFk(program),
  ]);

  if (!batchId || !paymentOptionId || !programId) {
    console.warn('Skip — unresolved FK:', row);
    skipped++;
    continue;
  }

  await prisma.feeStructure.upsert({
    where: {
      batchId_paymentOptionId_programId: { batchId, paymentOptionId, programId },
    },
    update: { semFee },
    create: { batchId, paymentOptionId, programId, semFee },
  });
  imported++;
}

console.log('Imported:', imported, 'Skipped:', skipped);
console.log('FeeStructure count:', await prisma.feeStructure.count());

const backfill = await prisma.$executeRawUnsafe(`
  UPDATE AdmissionForm af
  INNER JOIN FeeStructure fs
    ON af.batchId = fs.batchId
   AND af.programId = fs.programId
   AND af.paymentOptionId = fs.paymentOptionId
  SET
    af.feeAsPerStructure = fs.semFee,
    af.totalFee = fs.semFee * COALESCE(af.currentSem, 0),
    af.scholarship = fs.semFee - COALESCE(af.semFeeAfterDisc, 0),
    af.pendingFee = GREATEST(0, (fs.semFee * COALESCE(af.currentSem, 0)) - COALESCE(af.recdFee, 0))
  WHERE af.batchId IS NOT NULL
    AND af.programId IS NOT NULL
    AND af.paymentOptionId IS NOT NULL
`);

console.log('Backfilled admission forms:', backfill);

const sample = await prisma.admissionForm.findFirst({
  where: { batchId: { not: null }, programId: { not: null }, paymentOptionId: { not: null } },
  include: { batch: true, program: true, paymentOption: true },
});
if (sample) {
  const fs = await prisma.feeStructure.findFirst({
    where: {
      batchId: sample.batchId,
      programId: sample.programId,
      paymentOptionId: sample.paymentOptionId,
    },
  });
  console.log('Sample after backfill:', {
    batch: sample.batch?.batch,
    program: sample.program?.program,
    paymentOption: sample.paymentOption?.paymentOption,
    feeAsPerStructure: sample.feeAsPerStructure,
    totalFee: sample.totalFee,
    structureSemFee: fs?.semFee,
  });
}

const stillZero = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS cnt FROM AdmissionForm
  WHERE (feeAsPerStructure IS NULL OR feeAsPerStructure = 0)
    AND batchId IS NOT NULL AND programId IS NOT NULL AND paymentOptionId IS NOT NULL
`);
console.log('Forms still missing fee after backfill:', Number(stillZero[0].cnt));

await prisma.$disconnect();
