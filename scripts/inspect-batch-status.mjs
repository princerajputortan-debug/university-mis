import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const statuses = await prisma.$queryRawUnsafe(`SELECT * FROM AdmissionStatus ORDER BY id`);
const batches = await prisma.$queryRawUnsafe(`SELECT * FROM Batch ORDER BY id`);
const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM AdmissionForm`);
const maxBatch = await prisma.$queryRawUnsafe(`
  SELECT MAX(batch) AS maxBatch FROM AdmissionForm
`);
const counts = await prisma.$queryRawUnsafe(`
  SELECT batch, type, status, COUNT(*) AS cnt
  FROM AdmissionForm
  GROUP BY batch, type, status
  ORDER BY batch, type, status
  LIMIT 50
`);

console.log('statuses', statuses);
console.log('batches', batches);
console.log('AdmissionForm columns', cols.map((c) => c.Field));
console.log('maxBatch', maxBatch);
console.log('counts sample', counts);

await prisma.$disconnect();
