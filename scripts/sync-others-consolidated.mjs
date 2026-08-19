/**
 * Sync OthersPayment rows into ConsolidatedPayment.
 * Usage: node scripts/sync-others-consolidated.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const CHUNK = 2000;

function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function sqlNum(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return String(v);
}

function sqlDate(v) {
  if (!v) return 'NULL';
  const raw = String(v).trim().split(/[ T]/)[0];
  return sqlStr(`${raw} 12:00:00`);
}

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      transactionid AS transactionId,
      \`date\`,
      enrollmentid AS enrollmentId,
      amount,
      mode,
      batchid AS batchId,
      discountedcoursefee AS discountedCourseFee,
      firstemi AS firstEmi,
      tenure
    FROM OthersPayment
    WHERE transactionid IS NOT NULL AND transactionid != ''
  `);
  console.log(`OthersPayment rows to sync: ${rows.length}`);

  const removed = await prisma.$executeRawUnsafe(`
    DELETE cp FROM ConsolidatedPayment cp
    LEFT JOIN OthersPayment o
      ON o.transactionid COLLATE utf8mb4_unicode_ci = cp.transactionId COLLATE utf8mb4_unicode_ci
    WHERE cp.sourceName = 'Others' AND o.id IS NULL
  `);
  console.log(`Removed stale Consolidated Others rows: ${removed}`);

  const cols = `(transactionId, \`date\`, enrollmentId, amount, mode, batchId, discountedCourseFee, firstEmi, tenure, sourceName, createdAt, updatedAt)`;
  const updates = `\`date\`=VALUES(\`date\`), enrollmentId=VALUES(enrollmentId), amount=VALUES(amount), mode=VALUES(mode), batchId=VALUES(batchId), discountedCourseFee=VALUES(discountedCourseFee), firstEmi=VALUES(firstEmi), tenure=VALUES(tenure), sourceName=VALUES(sourceName), updatedAt=NOW()`;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk
      .map(
        (r) =>
          `(${sqlStr(r.transactionId)}, ${sqlDate(r.date)}, ${sqlNum(r.enrollmentId)}, ${sqlNum(r.amount)}, ${r.mode ? sqlStr(r.mode) : 'NULL'}, ${sqlNum(r.batchId)}, ${sqlNum(r.discountedCourseFee)}, ${sqlNum(r.firstEmi)}, ${sqlNum(r.tenure)}, 'Others', NOW(), NOW())`
      )
      .join(',\n');
    await prisma.$executeRawUnsafe(
      `INSERT INTO ConsolidatedPayment ${cols} VALUES ${values} ON DUPLICATE KEY UPDATE ${updates}`
    );
    console.log(`  Synced ${Math.min(i + CHUNK, rows.length)} / ${rows.length}`);
  }

  const [{ c }] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS c FROM ConsolidatedPayment WHERE sourceName = 'Others'
  `);
  console.log('Consolidated Others count:', Number(c));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
