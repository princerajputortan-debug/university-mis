import { PrismaClient } from '../src/generated/prisma/index.js';
const prisma = new PrismaClient();

const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM StudentFeeStructure');
const names = new Set(cols.map((c) => c.Field));
if (!names.has('couponName3')) {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE StudentFeeStructure ADD COLUMN couponName3 VARCHAR(191) NULL AFTER couponName2`
  );
  console.log('Added StudentFeeStructure.couponName3');
} else {
  console.log('StudentFeeStructure.couponName3 already exists');
}

await prisma.$disconnect();
