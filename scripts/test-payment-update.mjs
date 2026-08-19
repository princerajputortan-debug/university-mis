import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM RazorpayPayment');
console.log('columns', cols.map((c) => c.Field));

try {
  const r1 = await prisma.$executeRawUnsafe(`
    UPDATE RazorpayPayment
    SET enrollmentId = CAST(enrollment_id AS UNSIGNED)
    WHERE id BETWEEN 1 AND 5 AND enrollment_id REGEXP '^[0-9]+$'
  `);
  console.log('simple update ok', r1);
} catch (e) {
  console.error('simple update failed', e.message);
}

try {
  const r2 = await prisma.$executeRawUnsafe(`
    UPDATE RazorpayPayment p
    INNER JOIN AdmissionForm af ON af.enrollment_no = CAST(p.enrollment_id AS UNSIGNED)
    SET p.batchId = af.batch
    WHERE p.id BETWEEN 1 AND 5
  `);
  console.log('batch update ok', r2);
} catch (e) {
  console.error('batch update failed', e.message);
}

const sample = await prisma.$queryRawUnsafe(
  'SELECT id, enrollment_id, enrollmentId, batchId FROM RazorpayPayment WHERE id <= 5'
);
console.log(sample);

await prisma.$disconnect();
