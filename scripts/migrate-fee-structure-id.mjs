/**
 * Migrate FeeStructure.id from cuid string to auto-increment integer.
 * Preserves batch/paymentOption/program/semFee rows.
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const rows = await prisma.$queryRawUnsafe(`
  SELECT batchId, paymentOptionId, programId, semFee
  FROM FeeStructure
`);

console.log('Backing up', rows.length, 'fee structure rows');

await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS FeeStructure`);

console.log('Dropped FeeStructure table — run: npx prisma db push');
console.log('Then run: npm run reimport:fee-structure');

await prisma.$disconnect();
