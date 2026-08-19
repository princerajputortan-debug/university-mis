import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const TX = 'settlement_utr_/_transaction_id';

const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM OthersPayment`);
console.log('Columns:', cols.map((c) => c.Field).join(', '));

const total = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM OthersPayment`);
console.log('Total rows:', Number(total[0].c));

const hasLegacy = cols.some((c) => c.Field === TX);
const hasTx = cols.some((c) => c.Field === 'transactionId');
console.log('legacyTx:', hasLegacy, 'transactionId:', hasTx);

if (hasLegacy) {
  const valid = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS c FROM OthersPayment
    WHERE \`${TX}\` IS NOT NULL AND \`${TX}\` != ''
  `);
  console.log('Valid tx rows:', Number(valid[0].c));
}

const consolidated = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM ConsolidatedPayment WHERE sourceName = 'Others'
`);
console.log('Consolidated Others:', Number(consolidated[0].c));

await prisma.$disconnect();
