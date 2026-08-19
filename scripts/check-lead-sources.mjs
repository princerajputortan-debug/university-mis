import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const count = await prisma.leadSource.count();
const max = await prisma.leadSource.aggregate({ _max: { id: true } });
const referenced = await prisma.$queryRawUnsafe(`
  SELECT DISTINCT leadSourceId AS id
  FROM AdmissionForm
  WHERE leadSourceId IS NOT NULL
  ORDER BY id
`);
const commissionRefs = await prisma.$queryRawUnsafe(`
  SELECT DISTINCT leadSourceId AS id
  FROM comission_table_rr
  ORDER BY id
`);

console.log('LeadSource count:', count);
console.log('Max id:', max._max.id);
console.log('Referenced in AdmissionForm:', referenced.length);
console.log('Referenced in comission_table_rr:', commissionRefs.length);

await prisma.$disconnect();
