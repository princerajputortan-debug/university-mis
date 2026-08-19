/**
 * Rebuild Prisma Enrollment table from legacy enrollment_id (id + enrollment only).
 * Usage: node scripts/sync-enrollment-from-enrollment-id.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const CHUNK = 2000;

function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function main() {
  const [{ c: sourceCount }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS c FROM enrollment_id WHERE id IS NOT NULL'
  );
  const [{ c: beforeCount }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM Enrollment');
  console.log(`enrollment_id: ${Number(sourceCount)}`);
  console.log(`Enrollment before: ${Number(beforeCount)}`);

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE Enrollment');

  const sourceRows = await prisma.$queryRawUnsafe(`
    SELECT id, TRIM(enrollment) AS enrollment
    FROM enrollment_id
    WHERE id IS NOT NULL AND TRIM(enrollment) != ''
    ORDER BY id ASC
  `);

  const seenLabels = new Set();
  const prepared = [];
  for (const row of sourceRows) {
    let label = String(row.enrollment).slice(0, 191);
    const norm = label.toLowerCase();
    if (seenLabels.has(norm)) {
      label = `${label} (#${row.id})`.slice(0, 191);
    } else {
      seenLabels.add(norm);
    }
    prepared.push({ id: Number(row.id), label });
  }

  for (let i = 0; i < prepared.length; i += CHUNK) {
    const chunk = prepared.slice(i, i + CHUNK);
    const values = chunk.map((r) => `(${r.id}, ${sqlStr(r.label)})`).join(',');
    await prisma.$executeRawUnsafe(`INSERT INTO Enrollment (id, enrollment) VALUES ${values}`);
    console.log(`  Inserted ${Math.min(i + CHUNK, prepared.length)} / ${prepared.length}`);
  }

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');

  const [{ c: afterCount }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM Enrollment');
  const [{ m: maxId }] = await prisma.$queryRawUnsafe('SELECT MAX(id) AS m FROM Enrollment');
  console.log(`Enrollment after: ${Number(afterCount)} (max id ${Number(maxId)})`);
  console.log(
    Number(afterCount) === Number(sourceCount)
      ? 'OK: Enrollment matches enrollment_id count'
      : `WARN: count mismatch (source ${Number(sourceCount)} vs Enrollment ${Number(afterCount)})`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
