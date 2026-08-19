/**
 * Align legacy payment table columns with Prisma schema.
 * Run once: node scripts/migrate-payment-tables.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const TABLES = [
  'RazorpayPayment',
  'JodoPayment',
  'EarlyPayment',
  'PropelldPayment',
  'OfflinePayment',
  'BankPayment',
  'OthersPayment',
];

const TX_LEGACY = 'settlement_utr_/_transaction_id';

async function columnNames(table) {
  const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\``);
  return new Set(cols.map(c => c.Field));
}

async function migrateTable(table) {
  const cols = await columnNames(table);
  if (cols.has('transactionId')) {
    console.log(`${table}: already migrated`);
    return;
  }
  if (!cols.has(TX_LEGACY)) {
    console.log(`${table}: skip (no legacy columns)`);
    return;
  }

  const amountCol = [...cols].find(c => c.toLowerCase().startsWith('transaction_amount'));
  if (!amountCol) throw new Error(`${table}: amount column not found`);

  console.log(`Migrating ${table}...`);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE \`${table}\`
      CHANGE \`${TX_LEGACY}\` transactionId VARCHAR(191) NOT NULL,
      CHANGE enrollment_id enrollmentId INT NULL,
      CHANGE \`${amountCol}\` amount DOUBLE NOT NULL DEFAULT 0,
      CHANGE discounted_course_fee discountedCourseFee DOUBLE NULL,
      CHANGE \`1st_emi\` firstEmi DOUBLE NULL
  `);

  const after = await columnNames(table);
  if (!after.has('batchId')) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN batchId INT NULL`);
  }
  if (!after.has('createdAt')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${table}\` ADD COLUMN createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`
    );
  }
  if (!after.has('updatedAt')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${table}\` ADD COLUMN updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`
    );
  }

  // Backfill batchId from AdmissionForm
  await prisma.$executeRawUnsafe(`
    UPDATE \`${table}\` p
    INNER JOIN AdmissionForm af ON af.enrollmentId = p.enrollmentId
    SET p.batchId = af.batchId
    WHERE p.enrollmentId IS NOT NULL AND p.batchId IS NULL
  `);

  console.log(`${table}: done`);
}

async function main() {
  for (const table of TABLES) {
    await migrateTable(table);
  }
  console.log('All payment tables migrated.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
