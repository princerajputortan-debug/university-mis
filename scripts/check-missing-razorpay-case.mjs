import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const TX_COL = 'settlement_utr_/_transaction_id';

const MISSING = [
  'pay_Sq0EbaU7O9xHa',
  'pay_SqUlHhUf87cIzm',
  'pay_SqiaAx72a6wgxdi',
  'pay_SrB1gfcbFP88Ki',
  'pay_TAfizD3LNpljrN',
  'pay_TAYPqV4O4dKHD0',
  'pay_TAslqSIjckG0rI',
  'pay_TAtR8s7XUR160y',
  'pay_TAwkSDrHQMIbQC',
  'pay_TAy4InMRXNIXYM',
  'pay_TBHPPDSfbKANRg',
  'pay_TBNbuEJSf45Fb5',
  'pay_TBNX6QAm69m0j',
  'pay_TBR5IWawtYvci0',
  'pay_TBhkcLY5A9T5cc',
  'pay_TBjnUuqwRDB1z',
  'pay_TC7jIlQ51fGyTq',
  'pay_TCrd9v0mQXffTs',
  'pay_TCxRLj3llYmzLq',
  'pay_TDIWc1YZ77VY4h',
  'pay_TDIqhocI12vbLC',
  'pay_TE77vqQoJRc9j',
  'pay_TE8SLYDTVNxPRP',
  'pay_TE9wV8TQAnaG1h',
  'pay_TEDSXQCdjaVY6V',
  'pay_TEVfXcG8qPhNP',
  'pay_TEVIqCqwqWIIh8',
  'pay_TEYs4SoUYGEnd',
  'pay_TFwpFjs6DI8wD0',
  'pay_TFdeqfCBHwgOGu',
  'pay_TFdIpYhdoiHYS2',
  'pay_TFIIIce5834NO2',
  'pay_TG6TPUO72Lvlrb',
  'pay_TG7vLWINxbZ9dk',
];

async function getAmountColumn() {
  const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM RazorpayPayment');
  return cols.find((c) => String(c.Field).toLowerCase().startsWith('transaction_amount')).Field;
}

async function main() {
  const amountCol = await getAmountColumn();
  const already = [];
  const stillMissing = [];

  for (const id of MISSING) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT \`${TX_COL}\` AS tx, \`${amountCol}\` AS amt FROM RazorpayPayment WHERE LOWER(\`${TX_COL}\`) = LOWER(?)`,
      id
    );
    if (rows.length) {
      already.push({ want: id, got: rows[0].tx, amt: Number(rows[0].amt) });
    } else {
      // try prefix search (first 10 chars)
      const prefix = id.slice(0, 10);
      const likes = await prisma.$queryRawUnsafe(
        `SELECT \`${TX_COL}\` AS tx, \`${amountCol}\` AS amt FROM RazorpayPayment WHERE \`${TX_COL}\` LIKE ? LIMIT 5`,
        `${prefix}%`
      );
      stillMissing.push({
        want: id,
        likes: likes.map((r) => ({ tx: r.tx, amt: Number(r.amt) })),
      });
    }
  }

  console.log('Case-insensitive already in DB:', already.length);
  for (const r of already) console.log(`  ${r.want} -> ${r.got} amt=${r.amt}`);
  console.log('\nTruly missing / ambiguous:', stillMissing.length);
  for (const r of stillMissing) console.log(`  ${r.want}`, r.likes);
}

main().catch(console.error).finally(() => prisma.$disconnect());
