import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const sfsCols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM StudentFeeStructure`);
console.log(sfsCols.map((c) => c.Field));
const sample = await prisma.$queryRawUnsafe(`
  SELECT sfs.id, sfs.enrollmentId, sfs.batchId, sfs.typeId, sfs.currentSem, af.batch, af.type, af.status
  FROM StudentFeeStructure sfs
  LEFT JOIN AdmissionForm af ON af.enrollment_no = sfs.enrollmentId
  LIMIT 5
`);
console.log(sample);
await prisma.$disconnect();
