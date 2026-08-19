import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const admissionCols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM AdmissionForm');
const enrollmentCols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM Enrollment');
const enrollmentCount = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM Enrollment');

console.log('AdmissionForm columns:', admissionCols.map((c) => c.Field));
console.log('Enrollment columns:', enrollmentCols.map((c) => c.Field));
console.log('Enrollment count:', enrollmentCount[0].c);

const fks = await prisma.$queryRawUnsafe(`
  SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND REFERENCED_TABLE_NAME = 'Enrollment'
`);

console.log('Tables referencing Enrollment:', fks);

await prisma.$disconnect();
