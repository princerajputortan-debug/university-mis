import { PrismaClient } from '../src/generated/prisma/index.js';
const prisma = new PrismaClient();

const counts = await prisma.$queryRawUnsafe(`
  SELECT
    COALESCE(sfs.batchId, af.batch) AS batch,
    COALESCE(sfs.typeId, af.type) AS type,
    sfs.currentSem,
    COUNT(*) AS cnt
  FROM StudentFeeStructure sfs
  LEFT JOIN AdmissionForm af ON af.enrollment_no = sfs.enrollmentId
  GROUP BY batch, type, sfs.currentSem
  ORDER BY batch, type, sfs.currentSem
`);
console.log(counts);
const total = await prisma.studentFeeStructure.count();
console.log('total SFS', total);
await prisma.$disconnect();
