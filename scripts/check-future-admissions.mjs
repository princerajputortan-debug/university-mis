import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const today = new Date().toISOString().slice(0, 10);

const future = await prisma.$queryRawUnsafe(`
  SELECT date_of_admission, COUNT(*) AS cnt
  FROM AdmissionForm
  WHERE date_of_admission > '${today}'
  GROUP BY date_of_admission
  ORDER BY date_of_admission
  LIMIT 20
`);

const totalFuture = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS cnt FROM AdmissionForm WHERE date_of_admission > '${today}'
`);

console.log('Today:', today);
console.log('Future-dated admissions:', Number(totalFuture[0].cnt));
console.log(
  'Sample:',
  future.map((r) => `${r.date_of_admission}: ${Number(r.cnt)}`).join(', ')
);

await prisma.$disconnect();
