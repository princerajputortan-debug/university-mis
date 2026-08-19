/**
 * Find ConsolidatedPayment rows with future dates.
 * Usage: node scripts/future-collection-dates.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  console.log('Today:', todayStr);

  const summary = await prisma.$queryRawUnsafe(`
    SELECT
      sourceName,
      YEAR(date) AS yr,
      MONTH(date) AS mo,
      COUNT(*) AS cnt,
      COALESCE(SUM(amount), 0) AS total
    FROM ConsolidatedPayment
    WHERE date IS NOT NULL AND DATE(date) > CURDATE()
    GROUP BY sourceName, YEAR(date), MONTH(date)
    ORDER BY yr, mo, sourceName
  `);

  const byMonth = await prisma.$queryRawUnsafe(`
    SELECT
      YEAR(date) AS yr,
      MONTH(date) AS mo,
      COUNT(*) AS cnt,
      COALESCE(SUM(amount), 0) AS total
    FROM ConsolidatedPayment
    WHERE date IS NOT NULL AND DATE(date) > CURDATE()
    GROUP BY YEAR(date), MONTH(date)
    ORDER BY yr, mo
  `);

  const totals = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) AS cnt,
      COALESCE(SUM(amount), 0) AS total
    FROM ConsolidatedPayment
    WHERE date IS NOT NULL AND DATE(date) > CURDATE()
  `);

  const samples = await prisma.$queryRawUnsafe(`
    SELECT transactionId, sourceName, date, amount, enrollmentId
    FROM ConsolidatedPayment
    WHERE date IS NOT NULL AND DATE(date) > CURDATE()
    ORDER BY date DESC
    LIMIT 30
  `);

  const fmt = n => {
    const v = Number(n);
    if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
    if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
    return `₹${v.toLocaleString('en-IN')}`;
  };

  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  console.log('\n=== Future-dated collections summary ===');
  console.log('Total rows:', Number(totals[0].cnt));
  console.log('Total amount:', fmt(totals[0].total));

  console.log('\nBy month (matches Collection Count table):');
  for (const r of byMonth) {
    console.log(
      `  ${months[Number(r.mo)]} ${Number(r.yr)}: ${Number(r.cnt)} payments, ${fmt(r.total)}`
    );
  }

  console.log('\nBy source × month:');
  for (const r of summary) {
    console.log(
      `  ${r.sourceName} | ${months[Number(r.mo)]} ${Number(r.yr)} | ${Number(r.cnt)} | ${fmt(r.total)}`
    );
  }

  console.log('\nSample records (up to 30):');
  for (const r of samples) {
    const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
    console.log(`  ${d} | ${r.sourceName} | ${r.transactionId} | ${fmt(r.amount)} | enroll=${r.enrollmentId ?? 'null'}`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
