import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const TX = 'settlement_utr_/_transaction_id';

const overlap = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM PropelldPayment p
  INNER JOIN RazorpayPayment r ON r.\`${TX}\` = p.\`${TX}\`
  WHERE p.\`${TX}\` IS NOT NULL AND p.\`${TX}\` != ''
`);
console.log('Propelld rows matching Razorpay tx:', Number(overlap[0].c));

const propelldOnly = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM PropelldPayment p
  LEFT JOIN RazorpayPayment r ON r.\`${TX}\` = p.\`${TX}\`
  WHERE r.id IS NULL AND p.\`${TX}\` IS NOT NULL AND p.\`${TX}\` != ''
`);
console.log('Propelld-only (not in Razorpay):', Number(propelldOnly[0].c));

const nullTx = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM PropelldPayment WHERE \`${TX}\` IS NULL OR \`${TX}\` = ''
`);
console.log('Propelld null/empty tx:', Number(nullTx[0].c));

const consolidated = await prisma.$queryRawUnsafe(`
  SELECT sourceName, COUNT(*) AS c FROM ConsolidatedPayment GROUP BY sourceName ORDER BY c DESC
`);
console.log('Consolidated by source:', consolidated.map((r) => ({ source: r.sourceName, count: Number(r.c) })));

const samplePropelldOnly = await prisma.$queryRawUnsafe(`
  SELECT p.\`${TX}\` AS tx, p.enrollment_id, p.\`date\`
  FROM PropelldPayment p
  LEFT JOIN RazorpayPayment r ON r.\`${TX}\` = p.\`${TX}\`
  WHERE r.id IS NULL AND p.\`${TX}\` IS NOT NULL AND p.\`${TX}\` != ''
  LIMIT 5
`);
console.log('Sample Propelld-only rows:', samplePropelldOnly);

console.log('\nValid vs empty transaction IDs:');
for (const table of ['RazorpayPayment', 'JodoPayment', 'EarlyPayment', 'PropelldPayment']) {
  const empty = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS c FROM \`${table}\` WHERE \`${TX}\` IS NULL OR \`${TX}\` = ''
  `);
  const valid = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS c FROM \`${table}\` WHERE \`${TX}\` IS NOT NULL AND \`${TX}\` != ''
  `);
  console.log(`${table}: valid=${Number(valid[0].c)} empty=${Number(empty[0].c)}`);
}

await prisma.$disconnect();
