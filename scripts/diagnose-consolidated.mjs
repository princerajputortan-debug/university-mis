/**
 * Diagnose gap between source payment tables and ConsolidatedPayment.
 * Usage: node scripts/diagnose-consolidated.mjs
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
  const counts = {};
  for (const s of SOURCES) {
    const [{ c }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${s.table}\``);
    counts[s.table] = Number(c);
  }
  const [{ c: consolidated }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM ConsolidatedPayment`
  );
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);

  console.log('Source counts:', counts);
  console.log('Sum of sources:', sum);
  console.log('ConsolidatedPayment:', Number(consolidated));
  console.log('Gap (sum - consolidated):', sum - Number(consolidated));

  for (const t of ['RazorpayPayment', 'JodoPayment', 'EarlyPayment', 'PropelldPayment', 'ConsolidatedPayment']) {
    const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${t}\``);
    console.log(`${t} columns:`, cols.map(c => c.Field).join(', '));
  }

  const TX = 'settlement_utr_/_transaction_id';
  const txExpr = (alias) => `${alias}.\`${TX}\``;

  for (const s of SOURCES) {
    const [{ missing }] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS missing
      FROM \`${s.table}\` src
      LEFT JOIN ConsolidatedPayment cp ON cp.transactionId COLLATE utf8mb4_unicode_ci = ${txExpr('src')} COLLATE utf8mb4_unicode_ci
      WHERE cp.id IS NULL AND ${txExpr('src')} IS NOT NULL AND ${txExpr('src')} != ''
    `);
    console.log(`Missing from consolidated (${s.label}):`, Number(missing));
  }

  const dupRows = await prisma.$queryRawUnsafe(`
    SELECT transactionId, COUNT(*) AS cnt FROM (
      SELECT ${txExpr('r')} AS transactionId FROM RazorpayPayment r
      UNION ALL SELECT ${txExpr('j')} FROM JodoPayment j
      UNION ALL SELECT ${txExpr('e')} FROM EarlyPayment e
      UNION ALL SELECT ${txExpr('p')} FROM PropelldPayment p
    ) t
    GROUP BY transactionId
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 10
  `);
  console.log('Duplicate transactionIds across sources (top 10):', dupRows);

  const [{ uniqueTx, totalRows }] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT transactionId) AS uniqueTx, COUNT(*) AS totalRows FROM (
      SELECT ${txExpr('r')} AS transactionId FROM RazorpayPayment r
      UNION ALL SELECT ${txExpr('j')} FROM JodoPayment j
      UNION ALL SELECT ${txExpr('e')} FROM EarlyPayment e
      UNION ALL SELECT ${txExpr('p')} FROM PropelldPayment p
    ) t
    WHERE transactionId IS NOT NULL AND transactionId != ''
  `);
  console.log('Total source rows (union all):', Number(totalRows));
  console.log('Unique transactionIds across all 4 sources:', Number(uniqueTx));
  console.log('Expected consolidated if fully synced:', Number(uniqueTx));

  const bySource = await prisma.$queryRawUnsafe(`
    SELECT sourceName, COUNT(*) AS c FROM ConsolidatedPayment
    WHERE sourceName IN ('Razorpay','Jodo','Early','Propelld')
    GROUP BY sourceName
  `);
  console.log('Consolidated by sourceName:', bySource);

  const sample = await prisma.razorpayPayment.findFirst({
    select: { transactionId: true, amount: true, batchId: true },
  });
  console.log('Prisma Razorpay sample:', sample);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
