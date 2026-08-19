import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const total = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM OthersPayment`);
const valid = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM OthersPayment
  WHERE transactionid IS NOT NULL AND transactionid != ''
`);
const consolidated = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM ConsolidatedPayment WHERE sourceName = 'Others'
`);
const missing = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM OthersPayment o
  LEFT JOIN ConsolidatedPayment c ON c.transactionId = o.transactionid
  WHERE o.transactionid IS NOT NULL AND o.transactionid != '' AND c.id IS NULL
`);

console.log({
  othersTotal: Number(total[0].c),
  othersValidTx: Number(valid[0].c),
  consolidatedOthers: Number(consolidated[0].c),
  missingFromConsolidated: Number(missing[0].c),
});

await prisma.$disconnect();
