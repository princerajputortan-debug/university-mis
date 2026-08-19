import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const TX_LEGACY = 'settlement_utr_/_transaction_id';

async function countLegacy(table) {
  const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
  return Number(rows[0].cnt);
}

for (const table of ['RazorpayPayment', 'JodoPayment', 'PropelldPayment']) {
  const cnt = await countLegacy(table);
  console.log(`${table}: ${cnt}`);
}

await prisma.$disconnect();
