/**
 * Map enrollmentId + batchId on legacy payment source tables only.
 * Run when dev server is stopped to avoid table locks.
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const TABLES = ['RazorpayPayment', 'JodoPayment', 'EarlyPayment', 'PropelldPayment'];
const step = 2000;

async function columnNames(table) {
  const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\``);
  return new Set(cols.map((c) => c.Field));
}

for (const table of TABLES) {
  const cols = await columnNames(table);
  if (!cols.has('batchId')) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN batchId INT NULL`);
  }
  if (!cols.has('enrollmentId')) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN enrollmentId INT NULL`);
  }

  const [{ maxId }] = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(MAX(id), 0) AS maxId FROM \`${table}\``
  );

  for (let start = 1; start <= Number(maxId); start += step) {
    const end = start + step - 1;
    await prisma.$executeRawUnsafe(`
      UPDATE \`${table}\` p
      INNER JOIN \`enrollment_id\` e ON e.id = CAST(p.enrollment_id AS UNSIGNED)
      LEFT JOIN AdmissionForm af ON af.enrollment_no = e.id
      SET p.enrollmentId = e.id, p.batchId = af.batch
      WHERE p.id BETWEEN ${start} AND ${end}
        AND p.enrollment_id REGEXP '^[0-9]+$'
    `);
  }

  const stats = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS total,
      SUM(enrollmentId IS NOT NULL) AS withEnrollment,
      SUM(batchId IS NOT NULL) AS withBatch
    FROM \`${table}\`
  `);
  console.log(table, {
    total: Number(stats[0].total),
    withEnrollment: Number(stats[0].withEnrollment),
    withBatch: Number(stats[0].withBatch),
  });
}

await prisma.$disconnect();
