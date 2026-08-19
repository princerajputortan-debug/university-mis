/**
 * Repairs the 1-row gap: enrollment 6816 (PGO25156879) missing AdmissionForm
 * because LeadSource id 237 was skipped during seed (duplicate label "Direct selling").
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.leadSource.upsert({
    where: { id: 237 },
    update: { lead: 'Direct selling (#237)' },
    create: { id: 237, lead: 'Direct selling (#237)' },
  });

  await prisma.admissionForm.upsert({
    where: { enrollmentId: 6816 },
    update: {},
    create: {
      enrollmentId: 6816,
      sno: 6816,
      doa: new Date('2025-10-14'),
      name: 'Ganesh  Mahto',
      batchId: 7,
      paymentOptionId: 4,
      typeId: 1,
      statusId: 2,
      placedStatusId: 4,
      programId: 5,
      leadSourceId: 237,
      teamId: 9,
      bifurcationId: 7,
      locationId: 4,
      nationalityId: 1,
      ugcStatusId: 1,
    },
  });

  const [enrollmentCount, formCount] = await Promise.all([
    prisma.enrollment.count(),
    prisma.admissionForm.count(),
  ]);

  console.log('Fixed. Counts:', { enrollmentCount, formCount, gap: enrollmentCount - formCount });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
