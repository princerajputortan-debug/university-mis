import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

try {
  const rows = await prisma.enrollment.findMany({ take: 2, orderBy: { id: 'desc' } });
  console.log('Enrollment findMany OK:', rows);
} catch (e) {
  console.log('Enrollment findMany ERROR:', e.message);
}

try {
  const rows = await prisma.admissionForm.findMany({ take: 1 });
  console.log('AdmissionForm prisma ERROR expected:', rows);
} catch (e) {
  console.log('AdmissionForm prisma:', e.message.split('\n').slice(0, 2).join(' | '));
}

const mismatch = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM Enrollment e
  LEFT JOIN enrollment_id l ON l.id = e.id
  WHERE l.id IS NULL OR l.enrollment != e.enrollment
`);
console.log('Enrollment vs enrollment_id mismatches:', Number(mismatch[0].c));

await prisma.$disconnect();
