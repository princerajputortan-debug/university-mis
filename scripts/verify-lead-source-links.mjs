import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const broken = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS cnt
  FROM AdmissionForm af
  LEFT JOIN LeadSource ls ON af.leadSourceId = ls.id
  WHERE af.leadSourceId IS NOT NULL AND ls.id IS NULL
`);

const sample = await prisma.admissionForm.findMany({
  where: { leadSourceId: { not: null } },
  take: 5,
  include: { leadSource: true },
  orderBy: { id: 'asc' },
});

console.log('Broken admission links:', Number(broken[0].cnt));
console.log(
  'Sample linked forms:',
  sample.map((f) => ({
    formId: f.id,
    leadSourceId: f.leadSourceId,
    lead: f.leadSource?.lead,
  }))
);

await prisma.$disconnect();
