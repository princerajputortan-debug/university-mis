import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const rows = await prisma.$queryRawUnsafe(`
  SELECT pr.program AS name, COUNT(*) AS cnt
  FROM AdmissionForm af
  JOIN Program pr ON af.program = pr.id
  WHERE af.program IS NOT NULL
  GROUP BY pr.program
  ORDER BY cnt DESC
  LIMIT 6
`);
const total = rows.reduce((s, r) => s + Number(r.cnt), 0);
for (const row of rows) {
  const pct = Math.round((Number(row.cnt) / total) * 100);
  console.log(`${row.name}: ${Number(row.cnt)} (${pct}%)`);
}
await prisma.$disconnect();
