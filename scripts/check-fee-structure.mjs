import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const count = await prisma.feeStructure.count();
const samples = await prisma.feeStructure.findMany({
  take: 5,
  include: { batch: true, program: true, paymentOption: true },
});

const formsZeroFee = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS cnt FROM AdmissionForm WHERE feeAsPerStructure IS NULL OR feeAsPerStructure = 0
`);
const formsWithKeys = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS cnt FROM AdmissionForm
  WHERE batchId IS NOT NULL AND programId IS NOT NULL AND paymentOptionId IS NOT NULL
`);

console.log('FeeStructure count:', count);
console.log('Samples:', samples.map(r => ({
  id: r.id,
  idType: typeof r.id,
  batch: r.batch.batch,
  program: r.program.program,
  paymentOption: r.paymentOption.paymentOption,
  semFee: r.semFee,
})));
console.log('Admission forms with feeAsPerStructure 0/null:', Number(formsZeroFee[0].cnt));
console.log('Admission forms with batch+program+payment:', Number(formsWithKeys[0].cnt));

// Test lookup for one admission form
const form = await prisma.admissionForm.findFirst({
  where: { batchId: { not: null }, programId: { not: null }, paymentOptionId: { not: null } },
  include: { batch: true, program: true, paymentOption: true },
});
if (form) {
  const fs = await prisma.feeStructure.findFirst({
    where: {
      batchId: form.batchId,
      paymentOptionId: form.paymentOptionId,
      programId: form.programId,
    },
  });
  console.log('Sample form lookup:', {
    enrollment: form.enrollmentId,
    batch: form.batch?.batch,
    program: form.program?.program,
    paymentOption: form.paymentOption?.paymentOption,
    storedFee: form.feeAsPerStructure,
    feeStructureMatch: fs?.semFee ?? 'NOT FOUND',
  });
}

await prisma.$disconnect();
