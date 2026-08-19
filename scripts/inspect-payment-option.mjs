import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const rows = await prisma.$queryRawUnsafe('SELECT id, paymentOption FROM PaymentOption ORDER BY id');
console.log('PaymentOption rows:', rows.length);
for (const row of rows) {
  console.log(`${row.id}: ${row.paymentOption}`);
}
await prisma.$disconnect();
