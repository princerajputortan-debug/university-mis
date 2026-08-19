/**
 * Fix payment dates stored as DD-MM-YYYY strings and sync to ConsolidatedPayment.
 * Usage: node scripts/sync-payment-dates.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const SOURCES = [
  { table: 'RazorpayPayment', label: 'Razorpay' },
  { table: 'JodoPayment', label: 'Jodo' },
  { table: 'EarlyPayment', label: 'Early' },
  { table: 'PropelldPayment', label: 'Propelld' },
];

async function main() {
  const before = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total
    FROM ConsolidatedPayment WHERE date IS NULL
  `);
  console.log('Before — consolidated NULL dates:', before[0]);

  for (const { table, label } of SOURCES) {
    const [{ cnt: varcharDates }] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS cnt FROM \`${table}\`
      WHERE \`date\` IS NOT NULL AND CAST(\`date\` AS CHAR) REGEXP '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}$'
    `);
    if (Number(varcharDates) > 0) {
      await prisma.$executeRawUnsafe(`
        UPDATE \`${table}\`
        SET \`date\` = STR_TO_DATE(CAST(\`date\` AS CHAR), '%d-%m-%Y')
        WHERE \`date\` IS NOT NULL AND CAST(\`date\` AS CHAR) REGEXP '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}$'
      `);
      console.log(`${table}: converted ${Number(varcharDates)} DD-MM-YYYY dates`);
    }

    const result = await prisma.$executeRawUnsafe(`
      UPDATE ConsolidatedPayment c
      INNER JOIN \`${table}\` p
        ON c.transactionId COLLATE utf8mb4_unicode_ci = p.transactionId COLLATE utf8mb4_unicode_ci
      SET c.\`date\` = p.\`date\`
      WHERE c.sourceName = '${label}' AND c.\`date\` IS NULL AND p.\`date\` IS NOT NULL
    `);
    console.log(`${table} → ConsolidatedPayment: synced ${result} rows`);
  }

  const [all, withDate, noDate] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt FROM ConsolidatedPayment`),
    prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt FROM ConsolidatedPayment WHERE date IS NOT NULL`),
    prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt FROM ConsolidatedPayment WHERE date IS NULL`),
  ]);

  const fmt = n => `${(Number(n) / 1e7).toFixed(2)} Cr`;
  console.log('After — ALL:', fmt(all[0].total), Number(all[0].cnt));
  console.log('After — dated:', fmt(withDate[0].total), Number(withDate[0].cnt));
  console.log('After — null:', fmt(noDate[0].total), Number(noDate[0].cnt));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
