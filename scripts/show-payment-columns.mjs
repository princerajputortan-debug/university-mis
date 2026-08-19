import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
for (const table of ['RazorpayPayment', 'JodoPayment', 'EarlyPayment', 'PropelldPayment']) {
  const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\``);
  console.log(`\n${table}:`, cols.map((c) => c.Field).join(', '));
}
await prisma.$disconnect();
