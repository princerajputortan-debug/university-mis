import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const tables = await prisma.$queryRawUnsafe(`
  SELECT TABLE_NAME
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME LIKE '%nroll%'
  ORDER BY TABLE_NAME
`);
console.log('Enrollment-related tables:', tables);

const all = await prisma.$queryRawUnsafe(`
  SELECT TABLE_NAME FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
  ORDER BY TABLE_NAME
`);
console.log('All tables:', all.map((t) => t.TABLE_NAME));

await prisma.$disconnect();
