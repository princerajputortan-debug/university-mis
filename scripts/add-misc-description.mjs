import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM MiscPayment`);
const names = new Set(cols.map((c) => c.Field));
if (!names.has('description')) {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE MiscPayment ADD COLUMN description VARCHAR(500) NULL`
  );
  console.log('Added MiscPayment.description');
} else {
  console.log('MiscPayment.description already exists');
}

await prisma.$disconnect();
