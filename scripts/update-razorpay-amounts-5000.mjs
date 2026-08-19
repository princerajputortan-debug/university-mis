import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const AMOUNT = 5000;
const TX_COL = 'settlement_utr_/_transaction_id';

const TX_IDS = [
  'pay_Spy7XutTgguupY',
  'pay_SpyGkhHUC2ODCE',
  'pay_Sq0EbaU7O9xHa',
  'pay_SqUlHhUf87cIzm',
  'pay_SqiaAx72a6wgxdi',
  'pay_SqmVtOX1cZQE6W',
  'pay_SrB1gfcbFP88Ki',
  'pay_SrCVNDMWITND9j',
  'pay_SrGLHBxOI41GJN',
  'pay_TA9WaLkJCKfGgQ',
  'pay_TA9blgYwm2kiSi',
  'pay_TAAaFGWI68oOQT',
  'pay_TACTwTTAemjl7B',
  'pay_TAfizD3LNpljrN',
  'pay_TAYPqV4O4dKHD0',
  'pay_TAZ6YKBh3Fh8Vv',
  'pay_TAZqEMNsktCkEg',
  'pay_TAslqSIjckG0rI',
  'pay_TAszW442PgKMOH',
  'pay_TAtR8s7XUR160y',
  'pay_TAu5LDVslCJPuu',
  'pay_TAwkSDrHQMIbQC',
  'pay_TAx6EZ6HRv3gf2',
  'pay_TAy4InMRXNIXYM',
  'pay_TAyzcFOW38jvHu',
  'pay_TB0Zf2vaDk2S7h',
  'pay_TB0opXM9X2UnUy',
  'pay_TBH1NoQhxU1vOk',
  'pay_TBHPPDSfbKANRg',
  'pay_TBJ97OcjRIJNT6',
  'pay_TBLWeGhLHbVQ1X',
  'pay_TBLoxqaR2WbJrT',
  'pay_TBNbuEJSf45Fb5',
  'pay_TBNX6QAm69m0j',
  'pay_TBOAck8sWXgf3Q',
  'pay_TBR5IWawtYvci0',
  'pay_TBhkcLY5A9T5cc',
  'pay_TBjnUuqwRDB1z',
  'pay_TBltKNNVqtgG3w',
  'pay_TC7jIlQ51fGyTq',
  'pay_TCqrqL5u5RG3AJ',
  'pay_TCrd9v0mQXffTs',
  'pay_TCuA1OktMdUYYA',
  'pay_TCxRLj3llYmzLq',
  'pay_TDHgyuOYtVeXba',
  'pay_TDHzVagwKXBbKq',
  'pay_TDIWc1YZ77VY4h',
  'pay_TDKrKKcma51Bus',
  'pay_TDdhe1O7QXkKTJ',
  'pay_TDgh02Xb7k85KP',
  'pay_TDghjDIHNClzs0',
  'pay_TDIqhocI12vbLC',
  'pay_TDocgbtqNPWNKp',
  'pay_TE77vqQoJRc9j',
  'pay_TE8SLYDTVNxPRP',
  'pay_TE9wV8TQAnaG1h',
  'pay_TEC6fHppvaffYF',
  'pay_TEDSXQCdjaVY6V',
  'pay_TERZcGdpotSxUv',
  'pay_TETGJdu7JYnByH',
  'pay_TEVfXcG8qPhNP',
  'pay_TEVIqCqwqWIIh8',
  'pay_TEXRC50aY6EcOz',
  'pay_TEYs4SoUYGEnd',
  'pay_TEbKeBq4jw4RVE',
  'pay_TErH31fyFRgDTI',
  'pay_TFwpFjs6DI8wD0',
  'pay_TFGWPADuOGkuFm',
  'pay_TFdepFF4TvNajR',
  'pay_TFdeqfCBHwgOGu',
  'pay_TFdIpYhdoiHYS2',
  'pay_TFecQ6DZHa0ugM',
  'pay_TFedB4HoxEseAp',
  'pay_TFh7AfLfNiLcii',
  'pay_TFIIIce5834NO2',
  'pay_TG4EuJRrpBpORM',
  'pay_TG6TPUO72Lvlrb',
  'pay_TG7vLWINxbZ9dk',
  'pay_TGCEHb0xAkDBwn',
];

function sqlStr(v) {
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function getAmountColumn() {
  const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM RazorpayPayment');
  const col = cols.find((c) => String(c.Field).toLowerCase().startsWith('transaction_amount'));
  if (!col) throw new Error('No amount column on RazorpayPayment');
  return col.Field;
}

async function main() {
  const amountCol = await getAmountColumn();
  const inList = TX_IDS.map(sqlStr).join(',');

  // Snapshot before
  const before = await prisma.$queryRawUnsafe(`
    SELECT \`${TX_COL}\` AS tx, \`${amountCol}\` AS amt
    FROM RazorpayPayment
    WHERE \`${TX_COL}\` IN (${inList})
  `);
  console.log(`Found in RazorpayPayment: ${before.length} / ${TX_IDS.length}`);
  const sample = before.slice(0, 5).map((r) => ({ tx: r.tx, amt: Number(r.amt) }));
  console.log('Sample before:', sample);

  const missing = TX_IDS.filter((id) => !before.some((r) => String(r.tx) === id));
  if (missing.length) console.log('Missing from RazorpayPayment:', missing);

  const rzpUpdated = await prisma.$executeRawUnsafe(`
    UPDATE RazorpayPayment
    SET \`${amountCol}\` = ${AMOUNT}
    WHERE \`${TX_COL}\` IN (${inList})
  `);

  const cpUpdated = await prisma.$executeRawUnsafe(`
    UPDATE ConsolidatedPayment
    SET amount = ${AMOUNT}, updatedAt = NOW(3)
    WHERE transactionId IN (${inList}) AND sourceName = 'Razorpay'
  `);

  const afterCp = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS c, SUM(amount) AS s
    FROM ConsolidatedPayment
    WHERE transactionId IN (${inList}) AND sourceName = 'Razorpay'
  `);

  console.log({
    razorpayRowsUpdated: rzpUpdated,
    consolidatedRowsUpdated: cpUpdated,
    consolidatedCount: Number(afterCp[0].c),
    consolidatedSum: Number(afterCp[0].s),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
