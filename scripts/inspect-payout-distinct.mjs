import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM consolidated_payout');
console.log('cols:', cols.map((c) => c.Field).join(', '));

const sample = await prisma.$queryRawUnsafe(`
  SELECT af.batch AS batchId, COUNT(DISTINCT cp.enrollment_id) AS c
  FROM consolidated_payout cp
  INNER JOIN AdmissionForm af ON af.enrollment_no = cp.enrollment_id
  WHERE cp.enrollment_id IS NOT NULL
    AND af.batch BETWEEN 3 AND 6
  GROUP BY af.batch
  ORDER BY af.batch
`);
console.log('distinct by batch:', sample);

await prisma.$disconnect();
