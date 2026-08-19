import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const TX_COL = 'settlement_utr_/_transaction_id';
const AMOUNT = 5000;

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

function sqlStr(v) {
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function score(a, b) {
  const A = a.toLowerCase();
  const B = b.toLowerCase();
  if (A === B) return 100;
  // prefix match length
  let i = 0;
  while (i < A.length && i < B.length && A[i] === B[i]) i++;
  // also check if one contains the other
  if (A.includes(B) || B.includes(A)) return 80 + Math.min(A.length, B.length);
  return i;
}

async function getAmountColumn() {
  const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM RazorpayPayment');
  const col = cols.find((c) => String(c.Field).toLowerCase().startsWith('transaction_amount'));
  return col.Field;
}

async function main() {
  const amountCol = await getAmountColumn();

  // Load candidate txs that still look like the same family (pay_S / pay_T) and amount 5500
  const candidates = await prisma.$queryRawUnsafe(`
    SELECT \`${TX_COL}\` AS tx, \`${amountCol}\` AS amt
    FROM RazorpayPayment
    WHERE \`${TX_COL}\` LIKE 'pay\\_%'
      AND (\`${TX_COL}\` LIKE 'pay\\_S%' OR \`${TX_COL}\` LIKE 'pay\\_T%')
  `);
  console.log('Candidate Razorpay txs:', candidates.length);

  const resolved = [];
  const unresolved = [];

  for (const want of MISSING) {
    let best = null;
    let bestScore = 0;
    for (const c of candidates) {
      const s = score(want, String(c.tx));
      if (s > bestScore) {
        bestScore = s;
        best = String(c.tx);
      }
    }
    // Require strong match: case-insensitive exact, or prefix >= 12 chars after pay_
    const wantLower = want.toLowerCase();
    const exact = candidates.find((c) => String(c.tx).toLowerCase() === wantLower);
    if (exact) {
      resolved.push({ want, got: String(exact.tx), amt: Number(exact.amt), how: 'case-insensitive' });
      continue;
    }
    // Try LIKE with first 12 chars
    const prefix = want.slice(0, 12);
    const likeHits = candidates.filter((c) => String(c.tx).startsWith(prefix) || String(c.tx).toLowerCase().startsWith(prefix.toLowerCase()));
    if (likeHits.length === 1) {
      resolved.push({ want, got: String(likeHits[0].tx), amt: Number(likeHits[0].amt), how: 'unique-prefix' });
      continue;
    }
    if (best && bestScore >= 14) {
      resolved.push({ want, got: best, amt: Number(candidates.find((c) => String(c.tx) === best).amt), how: `fuzzy(${bestScore})` });
      continue;
    }
    unresolved.push({ want, best, bestScore, likeHits: likeHits.map((h) => h.tx) });
  }

  console.log('\nResolved:');
  for (const r of resolved) console.log(`  ${r.want} -> ${r.got} (was ${r.amt}, ${r.how})`);
  console.log('\nUnresolved:');
  for (const u of unresolved) console.log(`  ${u.want} best=${u.best} score=${u.bestScore} likes=${JSON.stringify(u.likeHits)}`);

  const toUpdate = [...new Set(resolved.map((r) => r.got))];
  if (!toUpdate.length) {
    console.log('Nothing more to update');
    return;
  }

  const inList = toUpdate.map(sqlStr).join(',');
  const rzp = await prisma.$executeRawUnsafe(`
    UPDATE RazorpayPayment SET \`${amountCol}\` = ${AMOUNT}
    WHERE \`${TX_COL}\` IN (${inList})
  `);
  const cp = await prisma.$executeRawUnsafe(`
    UPDATE ConsolidatedPayment SET amount = ${AMOUNT}, updatedAt = NOW(3)
    WHERE transactionId IN (${inList}) AND sourceName = 'Razorpay'
  `);
  console.log({ extraRazorpayUpdated: rzp, extraConsolidatedUpdated: cp, ids: toUpdate.length });
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
