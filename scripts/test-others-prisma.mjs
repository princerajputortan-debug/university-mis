import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

try {
  const count = await prisma.othersPayment.count();
  console.log('Prisma count:', count);
} catch (e) {
  console.log('Prisma count ERROR:', e.message);
}

try {
  const rows = await prisma.othersPayment.findMany({ take: 2, orderBy: { id: 'desc' } });
  console.log('Prisma sample:', rows);
} catch (e) {
  console.log('Prisma findMany ERROR:', e.message);
}

const sample = await prisma.$queryRawUnsafe(`
  SELECT id, date, transactionid, enrollmentid, amount, mode, batchid
  FROM OthersPayment ORDER BY id DESC LIMIT 3
`);
console.log('Raw sample:', sample);

await prisma.$disconnect();
