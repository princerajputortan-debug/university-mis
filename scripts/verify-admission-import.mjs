import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const sample = await prisma.$queryRawUnsafe(`
  SELECT af.id, af.date_of_admission, af.enrollment_no, e.enrollment, af.name,
         b.batch, po.paymentOption, pr.program
  FROM AdmissionForm af
  LEFT JOIN enrollment_id e ON e.id = af.enrollment_no
  LEFT JOIN Batch b ON b.id = af.batch
  LEFT JOIN PaymentOption po ON po.id = af.payment_option
  LEFT JOIN Program pr ON pr.id = af.program
  WHERE af.id >= 15670
  ORDER BY af.id
`);
for (const row of sample) {
  console.log(
    `${row.id} | ${row.date_of_admission} | ${row.enrollment} | ${row.name} | batch ${row.batch} | ${row.paymentOption} | ${row.program}`
  );
}
await prisma.$disconnect();
