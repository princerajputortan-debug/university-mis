import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

// Simulate count query used by app
const count = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS cnt FROM OthersPayment p
  WHERE p.transactionid IS NOT NULL AND p.transactionid != ''
`);
console.log('Normalized count:', Number(count[0].cnt));

const rows = await prisma.$queryRawUnsafe(`
  SELECT p.id, p.transactionid AS transactionId, p.enrollmentid, p.amount, e.enrollment
  FROM OthersPayment p
  LEFT JOIN enrollment_id e ON e.id = p.enrollmentid
  ORDER BY p.id DESC LIMIT 2
`);
console.log('Sample rows:', rows);

await prisma.$disconnect();
