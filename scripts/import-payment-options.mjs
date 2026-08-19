/**
 * Sync PaymentOption lookup table to the canonical 8 rows.
 * Usage: node scripts/import-payment-options.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const PAYMENT_OPTIONS = [
  { id: 1, paymentOption: 'Opt Out' },
  { id: 2, paymentOption: 'Pay After Placement' },
  { id: 3, paymentOption: 'Corporate' },
  { id: 4, paymentOption: 'Direct Selling' },
  { id: 5, paymentOption: 'Power Program' },
  { id: 6, paymentOption: 'Executive MBA Online' },
  { id: 7, paymentOption: 'Corporate-M' },
  { id: 8, paymentOption: 'Corporate-J' },
];

async function main() {
  const before = await prisma.paymentOption.count();
  console.log('PaymentOption rows before:', before);

  for (const row of PAYMENT_OPTIONS) {
    await prisma.paymentOption.upsert({
      where: { id: row.id },
      update: { paymentOption: `__import_${row.id}__` },
      create: { id: row.id, paymentOption: `__import_${row.id}__` },
    });
  }

  for (const row of PAYMENT_OPTIONS) {
    await prisma.paymentOption.update({
      where: { id: row.id },
      data: { paymentOption: row.paymentOption },
    });
    console.log(`${row.id}: ${row.paymentOption}`);
  }

  const canonicalIds = new Set(PAYMENT_OPTIONS.map((row) => row.id));
  const extras = await prisma.paymentOption.findMany({
    where: { id: { notIn: [...canonicalIds] } },
    select: { id: true, paymentOption: true },
    orderBy: { id: 'asc' },
  });

  let deleted = 0;
  for (const row of extras) {
    const refs = await prisma.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*) FROM AdmissionForm WHERE payment_option = ${row.id}) +
        (SELECT COUNT(*) FROM FeeStructure WHERE paymentOptionId = ${row.id}) +
        (SELECT COUNT(*) FROM StudentFeeStructure WHERE paymentOptionId = ${row.id})
      AS cnt
    `);
    const count = Number(refs[0]?.cnt ?? 0);
    if (Number.isNaN(count)) continue;
    if (count > 0) {
      console.log(`Skip delete id ${row.id} (${row.paymentOption}) — ${count} references`);
      continue;
    }
    await prisma.paymentOption.delete({ where: { id: row.id } });
    console.log(`Deleted extra id ${row.id} (${row.paymentOption})`);
    deleted++;
  }

  const after = await prisma.paymentOption.count();
  console.log(`\nDone. Rows after: ${after}, deleted extras: ${deleted}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
