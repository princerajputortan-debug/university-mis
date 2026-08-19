import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const legacyIds = [373, 374, 375, 376, 377, 378];

const rows = await prisma.leadSource.findMany({
  where: { id: { in: legacyIds } },
  orderBy: { id: 'asc' },
});

const admissionCounts = await prisma.$queryRawUnsafe(`
  SELECT leadSourceId, COUNT(*) AS cnt
  FROM AdmissionForm
  WHERE leadSourceId IN (373,374,375,376,377,378)
  GROUP BY leadSourceId
  ORDER BY leadSourceId
`);

const commissionCounts = await prisma.$queryRawUnsafe(`
  SELECT leadSourceId, COUNT(*) AS cnt
  FROM comission_table_rr
  WHERE leadSourceId IN (373,374,375,376,377,378)
  GROUP BY leadSourceId
  ORDER BY leadSourceId
`);

console.log('Legacy rows:', rows);
console.log('AdmissionForm refs:', admissionCounts);
console.log('Commission refs:', commissionCounts);

await prisma.$disconnect();
