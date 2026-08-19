import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

try {
  const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM RazorpayPayment');
  console.log('columns:', cols.map((c) => c.Field).join(', '));

  const rows = await prisma.$queryRawUnsafe(`
    SELECT p.id, p.\`settlement_utr_/_transaction_id\` AS tx, e.enrollment
    FROM RazorpayPayment p
    LEFT JOIN enrollment_id e ON e.id = CAST(p.enrollment_id AS UNSIGNED)
    ORDER BY p.id DESC
    LIMIT 3
  `);
  console.log('sample:', rows);
} catch (error) {
  console.error('FAIL:', error.message);
}

await prisma.$disconnect();
