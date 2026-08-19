import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const ENROLLMENT_NOS = [
  258, 449, 727, 746, 889, 1005, 5941, 6016, 6077, 6112, 6162, 6199, 6203,
  6251, 6267, 6273, 6296, 6321, 6330, 6361, 6362, 6395, 6420, 6425, 6426,
  6428, 6447, 6460, 6480, 6484,
];

const OPT_OUT_ID = 1;

async function main() {
  const ids = ENROLLMENT_NOS.join(',');

  const before = await prisma.$queryRawUnsafe(`
    SELECT af.enrollment_no, af.payment_option, e.enrollment
    FROM AdmissionForm af
    LEFT JOIN enrollment_id e ON e.id = af.enrollment_no
    WHERE af.enrollment_no IN (${ids})
    ORDER BY af.enrollment_no
  `);

  console.log(`Found ${before.length}/${ENROLLMENT_NOS.length} admission forms`);

  const result = await prisma.$executeRawUnsafe(`
    UPDATE AdmissionForm
    SET payment_option = ${OPT_OUT_ID}
    WHERE enrollment_no IN (${ids})
  `);

  const after = await prisma.$queryRawUnsafe(`
    SELECT af.enrollment_no, af.payment_option, po.paymentOption, e.enrollment
    FROM AdmissionForm af
    LEFT JOIN enrollment_id e ON e.id = af.enrollment_no
    LEFT JOIN PaymentOption po ON po.id = af.payment_option
    WHERE af.enrollment_no IN (${ids})
    ORDER BY af.enrollment_no
  `);

  const missing = ENROLLMENT_NOS.filter(
    (id) => !after.some((row) => Number(row.enrollment_no) === id)
  );

  console.log(`Updated rows: ${Number(result)}`);
  for (const row of after) {
    console.log(
      `${row.enrollment_no} (${row.enrollment ?? 'n/a'}): payment_option = ${row.payment_option} (${row.paymentOption})`
    );
  }

  if (missing.length) {
    console.log('\nNot found for enrollment_no:', missing.join(', '));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
