import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const [all, withDate, noDate] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(amount),0) AS total FROM ConsolidatedPayment`),
    prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(amount),0) AS total FROM ConsolidatedPayment WHERE date IS NOT NULL`),
    prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt FROM ConsolidatedPayment WHERE date IS NULL`),
  ]);

  const misSources = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(SUM(amount),0) AS total
    FROM ConsolidatedPayment
    WHERE sourceName IN ('Razorpay','Jodo','Early','Offline','Bank','Propelld','Others') AND date IS NOT NULL
  `);

  const bySource = await prisma.$queryRawUnsafe(`
    SELECT sourceName, COALESCE(SUM(amount),0) AS total
    FROM ConsolidatedPayment
    WHERE date IS NOT NULL
    GROUP BY sourceName
    ORDER BY total DESC
  `);

  const fmt = n => `${(Number(n) / 1e7).toFixed(2)} Cr`;
  console.log('Total Revenue card / ALL:', fmt(all[0].total));
  console.log('MIS dated total:', fmt(withDate[0].total));
  console.log('MIS source filter:', fmt(misSources[0].total));
  console.log('NULL date rows:', Number(noDate[0].cnt), fmt(noDate[0].total));
  console.log('By source:', bySource.map(r => ({ source: r.sourceName, total: fmt(r.total) })));
}

main().finally(() => prisma.$disconnect());
