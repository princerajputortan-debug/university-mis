import { PrismaClient } from '../src/generated/prisma/index.js';
const prisma = new PrismaClient();
const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM PropelldPayment');
console.log('PropelldPayment columns:');
for (const c of cols) console.log(`  ${c.Field} | ${c.Type}`);
const [{ c }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM PropelldPayment');
const [{ cp }] = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS cp FROM ConsolidatedPayment WHERE sourceName='Propelld'");
console.log('PropelldPayment rows:', Number(c), '| ConsolidatedPayment Propelld:', Number(cp));
await prisma.$disconnect();
