/**
 * Clean up the damage from a student-fee CSV that was uploaded with numeric
 * lookup ids while the resolver treated them as text labels. That run:
 *   - created 6,707 StudentFeeStructure rows linked to non-existent enrollments
 *     (enrollmentId 16889..23595, later removed by an Enrollment resync), and
 *   - created garbage lookup rows whose text value is purely numeric
 *     (Program "1".."10", PaymentOption "1".."8", Batch "1".."8", Type "1"/"2").
 *
 * Safe to run repeatedly. Usage: node scripts/cleanup-bad-student-fee-upload.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

// 1) Remove orphaned student fee rows (enrollmentId not present in Enrollment).
const orphanDeleted = await prisma.$executeRawUnsafe(
  `DELETE sfs FROM StudentFeeStructure sfs
   LEFT JOIN Enrollment e ON e.id = sfs.enrollmentId
   WHERE e.id IS NULL`
);
console.log(`Deleted orphaned StudentFeeStructure rows: ${orphanDeleted}`);

// 2) Remove garbage lookup rows (purely-numeric text values) that are no longer
//    referenced by any StudentFeeStructure row.
async function cleanupLookup(table, field, refColumn) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id FROM \`${table}\` WHERE \`${field}\` REGEXP '^[0-9]+$'`
  );
  let deleted = 0;
  for (const { id } of rows) {
    const [{ c }] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM StudentFeeStructure WHERE \`${refColumn}\` = ?`,
      Number(id)
    );
    if (Number(c) > 0) {
      console.log(`  ${table} id ${Number(id)} still referenced (${Number(c)}), skipping`);
      continue;
    }
    await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\` WHERE id = ?`, Number(id));
    deleted += 1;
  }
  console.log(`${table}: deleted ${deleted} garbage rows`);
}

await cleanupLookup('Program', 'program', 'programId');
await cleanupLookup('PaymentOption', 'paymentOption', 'paymentOptionId');
await cleanupLookup('Batch', 'batch', 'batchId');
await cleanupLookup('AdmissionType', 'type', 'typeId');

const [{ c }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM StudentFeeStructure');
console.log(`\nStudentFeeStructure rows remaining: ${Number(c)}`);

await prisma.$disconnect();
