import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

try {
  await prisma.$queryRawUnsafe('SELECT 1');
  const [{ c }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM ConsolidatedPayment');
  console.log('DB OK');
  console.log('ConsolidatedPayment rows:', Number(c));

  const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM AdmissionForm');
  console.log('AdmissionForm columns:', cols.map((col) => col.Field).join(', '));
} catch (error) {
  console.error('DB FAIL:', error.code, error.message);
}

await prisma.$disconnect();
