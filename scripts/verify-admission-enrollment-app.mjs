import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const af = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM AdmissionForm');
const enr = await prisma.enrollment.count();
const sample = await prisma.$queryRawUnsafe(`
  SELECT af.id, af.enrollment_no, e.enrollment
  FROM AdmissionForm af
  LEFT JOIN Enrollment e ON e.id = af.enrollment_no
  ORDER BY af.id DESC LIMIT 3
`);

console.log({
  admissionForms: Number(af[0].c),
  enrollment: enr,
  latestJoined: sample,
});

await prisma.$disconnect();
