import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const TX_COL = 'settlement_utr_/_transaction_id';
const AMOUNT = 5000;

// Unique-prefix OCR resolutions from the screenshot IDs
const RESOLVED = [
  'pay_Sq0EbalJ7O9xHa',
  'pay_TAYpqV4O4dKH0O',
  'pay_TBNx6QAnv69m0j',
  'pay_TBhkcLY5A9T5ee',
  'pay_TBjnUuqwgRDB1z',
  'pay_TDIWc1YZ77VY4h',
  'pay_TE77vqQoIJrC9j',
  'pay_TE8SLYDTNVXpRP',
  'pay_TEDSXQCdiaVY6V',
  'pay_TEYs4SotJYGEnd',
  'pay_TG7vLWfNxbZ9dk',
];

function sqlStr(v) {
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function main() {
  const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM RazorpayPayment');
  const amountCol = cols.find((c) => String(c.Field).toLowerCase().startsWith('transaction_amount')).Field;
  const inList = RESOLVED.map(sqlStr).join(',');

  const before = await prisma.$queryRawUnsafe(`
    SELECT \`${TX_COL}\` AS tx, \`${amountCol}\` AS amt
    FROM RazorpayPayment WHERE \`${TX_COL}\` IN (${inList})
  `);
  console.log('Before:', before.map((r) => ({ tx: r.tx, amt: Number(r.amt) })));

  const rzp = await prisma.$executeRawUnsafe(`
    UPDATE RazorpayPayment SET \`${amountCol}\` = ${AMOUNT}
    WHERE \`${TX_COL}\` IN (${inList})
  `);
  const cp = await prisma.$executeRawUnsafe(`
    UPDATE ConsolidatedPayment SET amount = ${AMOUNT}, updatedAt = NOW(3)
    WHERE transactionId IN (${inList}) AND sourceName = 'Razorpay'
  `);

  console.log({ razorpayUpdated: rzp, consolidatedUpdated: cp });
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
