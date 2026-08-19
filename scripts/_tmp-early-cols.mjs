import { PrismaClient } from '../src/generated/prisma/index.js';
const prisma = new PrismaClient();
const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM EarlyPayment');
console.log('EarlyPayment columns:');
for (const c of cols) console.log(`  ${c.Field} | ${c.Type} | Key=${c.Key}`);
const [{ c }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM EarlyPayment');
const [{ cp }] = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS cp FROM ConsolidatedPayment WHERE sourceName='Early'");
console.log('EarlyPayment rows:', Number(c), '| ConsolidatedPayment Early:', Number(cp));
await prisma.$disconnect();
