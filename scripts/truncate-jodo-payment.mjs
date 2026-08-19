/**
 * Truncate JodoPayment and remove Jodo rows from ConsolidatedPayment.
 * Usage: node scripts/truncate-jodo-payment.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const [{ c: beforeJodo }] = await prisma.$queryRawUnsafe(
  `SELECT COUNT(*) AS c FROM JodoPayment`
);
const [{ c: beforeConsolidated }] = await prisma.$queryRawUnsafe(
  `SELECT COUNT(*) AS c FROM ConsolidatedPayment WHERE sourceName = 'Jodo'`
);

console.log(`Before: JodoPayment=${Number(beforeJodo)}, Consolidated Jodo=${Number(beforeConsolidated)}`);

await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
await prisma.$executeRawUnsafe('TRUNCATE TABLE JodoPayment');
await prisma.$executeRawUnsafe(`DELETE FROM ConsolidatedPayment WHERE sourceName = 'Jodo'`);
await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');

const [{ c: afterJodo }] = await prisma.$queryRawUnsafe(
  `SELECT COUNT(*) AS c FROM JodoPayment`
);
const [{ c: afterConsolidated }] = await prisma.$queryRawUnsafe(
  `SELECT COUNT(*) AS c FROM ConsolidatedPayment WHERE sourceName = 'Jodo'`
);

console.log(`After: JodoPayment=${Number(afterJodo)}, Consolidated Jodo=${Number(afterConsolidated)}`);
console.log('Done. Jodo payment schema truncated.');

await prisma.$disconnect();
