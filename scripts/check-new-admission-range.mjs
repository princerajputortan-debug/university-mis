import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const enrollments = await prisma.$queryRawUnsafe(`
  SELECT id, enrollment FROM enrollment_id WHERE id >= 15673 ORDER BY id
`);
const afCount = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM AdmissionForm WHERE enrollment_no >= 15673
`);
const enrCount = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM Enrollment WHERE id >= 15673
`);

console.log('enrollment_id rows 15673+:', enrollments.length);
console.log('sample:', enrollments.slice(0, 2), enrollments.slice(-2));
console.log('AdmissionForm 15673+:', Number(afCount[0].c));
console.log('Enrollment 15673+:', Number(enrCount[0].c));

await prisma.$disconnect();
