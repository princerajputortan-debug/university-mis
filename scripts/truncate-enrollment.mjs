/**
 * Truncate Enrollment table after clearing dependent links.
 * - Nulls enrollmentId on admission forms and payment tables
 * - Deletes student fee structures (required enrollment FK)
 * - Truncates Enrollment and resets auto-increment
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const before = await prisma.enrollment.count();
console.log('Enrollment rows before:', before);

const paymentTables = [
  'ConsolidatedPayment',
  'RazorpayPayment',
  'JodoPayment',
  'EarlyPayment',
  'OfflinePayment',
  'BankPayment',
  'PropelldPayment',
  'OthersPayment',
];

const studentFeesDeleted = await prisma.studentFeeStructure.deleteMany();

const paymentCleared = {};
for (const table of paymentTables) {
  const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\``);
  const hasEnrollmentId = cols.some((c) => c.Field === 'enrollmentId');
  if (!hasEnrollmentId) {
    paymentCleared[table] = 0;
    continue;
  }
  const result = await prisma.$executeRawUnsafe(
    `UPDATE \`${table}\` SET enrollmentId = NULL WHERE enrollmentId IS NOT NULL`
  );
  paymentCleared[table] = Number(result);
}

await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
await prisma.$executeRawUnsafe('TRUNCATE TABLE Enrollment');
await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');

const after = await prisma.enrollment.count();

console.log('Student fee structures deleted:', studentFeesDeleted.count);
console.log('Payment rows unlinked:', paymentCleared);
console.log('Enrollment rows after:', after);

await prisma.$disconnect();
