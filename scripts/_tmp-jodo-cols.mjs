import { PrismaClient } from '../src/generated/prisma/index.js';
const prisma = new PrismaClient();
const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM JodoPayment');
console.log('JodoPayment columns:');
for (const c of cols) console.log(`  ${c.Field} | ${c.Type}`);
const [{ c }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM JodoPayment');
const [{ cp }] = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS cp FROM ConsolidatedPayment WHERE sourceName='Jodo'");
console.log('JodoPayment rows:', Number(c), '| ConsolidatedPayment Jodo:', Number(cp));
await prisma.$disconnect();
