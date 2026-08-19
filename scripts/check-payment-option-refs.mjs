import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

for (const table of [
  ['AdmissionForm', 'payment_option'],
  ['FeeStructure', 'paymentOptionId'],
  ['StudentFeeStructure', 'paymentOptionId'],
]) {
  const [name, col] = table;
  const rows = await prisma.$queryRawUnsafe(`
    SELECT ${col} AS id, COUNT(*) AS cnt
    FROM ${name}
    WHERE ${col} IS NOT NULL
    GROUP BY ${col}
    ORDER BY ${col}
  `).catch(() => []);
  console.log(`\n${name}.${col}:`);
  for (const row of rows) {
    console.log(`  ${row.id}: ${Number(row.cnt)}`);
  }
}

await prisma.$disconnect();
