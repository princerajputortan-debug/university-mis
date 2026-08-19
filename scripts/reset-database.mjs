/**
 * Drops all tables in the current MySQL database, then applies Prisma schema via db push.
 * Run: node scripts/reset-database.mjs
 */
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function dropAllTables() {
  const tables = await prisma.$queryRawUnsafe(`
    SELECT TABLE_NAME
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
  `);

  if (tables.length === 0) {
    console.log('No tables to drop.');
    return;
  }

  console.log(`Dropping ${tables.length} tables...`);
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const { TABLE_NAME } of tables) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${TABLE_NAME}\``);
    console.log(`  dropped ${TABLE_NAME}`);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
}

async function main() {
  await dropAllTables();
  await prisma.$disconnect();

  console.log('\nApplying Prisma schema (db push)...');
  execSync('npx prisma db push --accept-data-loss', {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
  console.log('\nDatabase reset and schema applied.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
