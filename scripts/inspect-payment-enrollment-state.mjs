import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const enrollmentCount = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM Enrollment');
const enrollmentSample = await prisma.$queryRawUnsafe('SELECT * FROM Enrollment ORDER BY id ASC LIMIT 5');

const tables = [
  'RazorpayPayment',
  'JodoPayment',
  'EarlyPayment',
  'PropelldPayment',
  'ConsolidatedPayment',
];

for (const table of tables) {
  const total = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${table}\``);
  const withEnrollment = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM \`${table}\` WHERE enrollmentId IS NOT NULL`
  );
  const withBatch = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM \`${table}\` WHERE batchId IS NOT NULL`
  );
  const sample = await prisma.$queryRawUnsafe(
    `SELECT id, enrollmentId, batchId, amount FROM \`${table}\` ORDER BY id ASC LIMIT 3`
  );
  console.log(`\n${table}:`, {
    total: Number(total[0].c),
    withEnrollment: Number(withEnrollment[0].c),
    withBatch: Number(withBatch[0].c),
    sample,
  });
}

const admissionCols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM AdmissionForm');
console.log('\nAdmissionForm columns:', admissionCols.map((c) => c.Field));
const admissionCount = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM AdmissionForm');

console.log('\nEnrollment count:', Number(enrollmentCount[0].c));
console.log('Enrollment sample:', enrollmentSample);
console.log('AdmissionForm count:', Number(admissionCount[0].c));

await prisma.$disconnect();
