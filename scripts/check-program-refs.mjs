import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const refs = await prisma.$queryRawUnsafe(`
  SELECT program AS id, COUNT(*) AS cnt
  FROM AdmissionForm
  WHERE program IS NOT NULL
  GROUP BY program
  ORDER BY program
`);

console.log('AdmissionForm.program usage:');
for (const row of refs) {
  const prog = await prisma.program.findUnique({ where: { id: Number(row.id) } });
  console.log(`  ${row.id}: ${Number(row.cnt)} rows -> ${prog?.program ?? 'MISSING'}`);
}

await prisma.$disconnect();
