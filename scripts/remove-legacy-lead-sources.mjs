import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const legacyIds = [373, 374, 375, 376, 377, 378];

const cleared = await prisma.admissionForm.updateMany({
  where: { leadSourceId: { in: legacyIds } },
  data: { leadSourceId: null },
});

const deleted = await prisma.leadSource.deleteMany({
  where: { id: { in: legacyIds } },
});

const remaining = await prisma.leadSource.count();
const broken = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS cnt
  FROM AdmissionForm af
  LEFT JOIN LeadSource ls ON af.leadSourceId = ls.id
  WHERE af.leadSourceId IS NOT NULL AND ls.id IS NULL
`);

console.log('Cleared admission form links:', cleared.count);
console.log('Deleted legacy lead sources:', deleted.count);
console.log('Lead sources remaining:', remaining);
console.log('Broken admission links:', Number(broken[0].cnt));

await prisma.$disconnect();
