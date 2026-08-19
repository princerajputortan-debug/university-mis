import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const TX = 'settlement_utr_/_transaction_id';

try {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS cnt FROM OthersPayment p
    WHERE p.\`${TX}\` IS NOT NULL AND p.\`${TX}\` != ''
  `);
  console.log('Legacy count query:', Number(rows[0].cnt));
} catch (e) {
  console.log('Legacy count ERROR:', e.message.split('\n')[0]);
}

const prismaCount = await prisma.othersPayment.count();
console.log('Prisma count:', prismaCount);

await prisma.$disconnect();
