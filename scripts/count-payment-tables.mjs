import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const tables = ['RazorpayPayment', 'JodoPayment', 'EarlyPayment', 'PropelldPayment'];

for (const table of tables) {
  try {
    const [{ c }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${table}\``);
    const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\``);
    const hasTx = cols.some((c) => c.Field === 'transactionId');
    const hasLegacy = cols.some((c) => c.Field === 'settlement_utr_/_transaction_id');
    console.log(`${table}: ${Number(c)} rows | transactionId=${hasTx} legacyTx=${hasLegacy}`);
  } catch (e) {
    console.log(`${table}: ERROR ${e.message}`);
  }
}

await prisma.$disconnect();
