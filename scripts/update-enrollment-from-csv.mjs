/**
 * Incrementally add new enrollments from a CSV (columns: id, enrollment) into
 * the legacy `enrollment_id` table and the Prisma `Enrollment` table.
 *
 * - Existing ids are left untouched (no truncate → StudentFeeStructure links safe).
 * - New rows are inserted into both tables.
 * - For Enrollment (UNIQUE on `enrollment`), colliding text is suffixed " (#id)"
 *   to match the behaviour of sync-enrollment-payments.mjs.
 *
 * Usage: node scripts/update-enrollment-from-csv.mjs "<csv path>"
 */
import fs from 'fs';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const CHUNK = 2000;

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node scripts/update-enrollment-from-csv.mjs "<csv path>"');
  process.exit(1);
}

function sqlStr(v) {
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function main() {
  const parsed = Papa.parse(fs.readFileSync(csvPath, 'utf8').trim(), {
    header: true,
    skipEmptyLines: true,
  });

  // Clean CSV rows
  const rows = [];
  for (const r of parsed.data) {
    const idRaw = String(r.id ?? '').trim();
    const text = String(r.enrollment ?? '').trim();
    if (!/^\d+$/.test(idRaw) || !text) continue;
    rows.push({ id: parseInt(idRaw, 10), enrollment: text });
  }
  rows.sort((a, b) => a.id - b.id);
  console.log(`CSV usable rows: ${rows.length}`);

  // ---- enrollment_id (legacy) ----
  const legacyIds = new Set(
    (await prisma.$queryRawUnsafe('SELECT id FROM enrollment_id WHERE id IS NOT NULL')).map((r) => Number(r.id))
  );
  const newLegacy = rows.filter((r) => !legacyIds.has(r.id));
  console.log(`enrollment_id: ${legacyIds.size} existing, ${newLegacy.length} new to insert`);
  for (let i = 0; i < newLegacy.length; i += CHUNK) {
    const chunk = newLegacy.slice(i, i + CHUNK);
    const values = chunk.map((r) => `(${r.id}, ${sqlStr(r.enrollment)})`).join(',');
    await prisma.$executeRawUnsafe(`INSERT INTO enrollment_id (id, enrollment) VALUES ${values}`);
  }

  // ---- Enrollment (Prisma, UNIQUE enrollment) ----
  const existingEnr = await prisma.$queryRawUnsafe('SELECT id, enrollment FROM Enrollment');
  const enrIds = new Set(existingEnr.map((r) => Number(r.id)));
  const seenLabels = new Set(existingEnr.map((r) => String(r.enrollment).trim().toLowerCase()));

  const newEnr = rows.filter((r) => !enrIds.has(r.id));
  console.log(`Enrollment: ${enrIds.size} existing, ${newEnr.length} new to insert`);

  const prepared = [];
  const suffixed = [];
  for (const r of newEnr) {
    let label = r.enrollment.slice(0, 191);
    if (seenLabels.has(label.toLowerCase())) {
      label = `${label} (#${r.id})`.slice(0, 191);
      suffixed.push({ id: r.id, label });
    }
    seenLabels.add(label.toLowerCase());
    prepared.push({ id: r.id, label });
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (let i = 0; i < prepared.length; i += CHUNK) {
    const chunk = prepared.slice(i, i + CHUNK);
    const values = chunk.map((r) => `(${r.id}, ${sqlStr(r.label)})`).join(',');
    await prisma.$executeRawUnsafe(`INSERT INTO Enrollment (id, enrollment) VALUES ${values}`);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  if (suffixed.length) console.log('  De-duplicated (suffixed) labels:', suffixed);

  const [{ lc }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS lc FROM enrollment_id');
  const [{ ec }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS ec FROM Enrollment');
  console.log(`\nDone. enrollment_id=${Number(lc)} rows, Enrollment=${Number(ec)} rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
