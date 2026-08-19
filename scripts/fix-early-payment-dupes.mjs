/**
 * Remove duplicate/null-id EarlyPayment rows left by broken bulk INSERT.
 * Usage: node scripts/fix-early-payment-dupes.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const TX_COL = 'settlement_utr_/_transaction_id';

async function main() {
  const [{ nullIds }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS nullIds FROM EarlyPayment WHERE id IS NULL`
  );
  console.log(`Null-id rows before cleanup: ${Number(nullIds)}`);

  const deleted = await prisma.$executeRawUnsafe(`DELETE FROM EarlyPayment WHERE id IS NULL`);
  console.log(`Deleted null-id rows: ${Number(deleted)}`);

  const dupes = await prisma.$queryRawUnsafe(`
    SELECT \`${TX_COL}\` AS tx, COUNT(*) AS c
    FROM EarlyPayment
    WHERE \`${TX_COL}\` IS NOT NULL AND \`${TX_COL}\` != ''
    GROUP BY \`${TX_COL}\`
    HAVING COUNT(*) > 1
  `);

  for (const { tx } of dupes) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id FROM EarlyPayment WHERE \`${TX_COL}\` = ? ORDER BY id DESC`,
      tx
    );
    const keepId = Number(rows[0].id);
    await prisma.$executeRawUnsafe(
      `DELETE FROM EarlyPayment WHERE \`${TX_COL}\` = ? AND id != ?`,
      tx,
      keepId
    );
  }

  const [{ total }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS total FROM EarlyPayment WHERE \`${TX_COL}\` IS NOT NULL AND \`${TX_COL}\` != ''`
  );
  console.log(`Valid EarlyPayment rows after cleanup: ${Number(total)}`);
  console.log(`Remaining duplicate tx groups: ${dupes.length}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
