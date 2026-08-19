import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

for (const table of ['OthersPayment', 'OfflinePayment', 'BankPayment']) {
  try {
    const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\``);
    const cnt = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${table}\``);
    console.log(`\n${table}: ${Number(cnt[0].c)} rows`);
    console.log('  cols:', cols.map((c) => c.Field).join(', '));
    try {
      await prisma[table.charAt(0).toLowerCase() + table.slice(1)].findMany({ take: 1 });
      console.log('  Prisma findMany: OK');
    } catch (e) {
      console.log('  Prisma findMany:', e.message.split('\n')[0]);
    }
  } catch (e) {
    console.log(`${table}: ERROR`, e.message);
  }
}

await prisma.$disconnect();
