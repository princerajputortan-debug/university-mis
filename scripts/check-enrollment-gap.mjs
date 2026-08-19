import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [enrollmentCount, formCount] = await Promise.all([
    prisma.enrollment.count(),
    prisma.admissionForm.count(),
  ]);

  const orphanEnrollments = await prisma.enrollment.findMany({
    where: { forms: { none: {} } },
    select: { id: true, enrollment: true },
    orderBy: { id: 'asc' },
  });

  const formsNullEnrollment = await prisma.admissionForm.count({
    where: { enrollmentId: null },
  });

  const duplicateForms = await prisma.$queryRaw`
    SELECT enrollmentId, COUNT(*) as c
    FROM AdmissionForm
    WHERE enrollmentId IS NOT NULL
    GROUP BY enrollmentId
    HAVING c > 1
  `;

  console.log({
    enrollmentCount,
    formCount,
    gap: enrollmentCount - formCount,
    orphanEnrollments: orphanEnrollments.length,
    orphanDetails: orphanEnrollments,
    formsNullEnrollment,
    duplicateForms,
  });

  // Row 6816 FK check (from main_data_base)
  const fks = {
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
  };
  for (const [key, id] of Object.entries(fks)) {
    const model = {
      batchId: 'batch',
      paymentOptionId: 'paymentOption',
      typeId: 'admissionType',
      statusId: 'admissionStatus',
      placedStatusId: 'placementStatus',
      programId: 'program',
      leadSourceId: 'leadSource',
      teamId: 'team',
      bifurcationId: 'bifurcation',
      locationId: 'location',
      nationalityId: 'nationality',
      ugcStatusId: 'ugcStatus',
    }[key];
    const row = await prisma[model].findUnique({ where: { id } });
    console.log(key, id, row ? 'OK' : 'MISSING');
  }

  const lead237 = await prisma.leadSource.findUnique({ where: { id: 237 } });
  const lead167 = await prisma.leadSource.findUnique({ where: { id: 167 } });
  console.log('leadSource 237:', lead237);
  console.log('leadSource 167:', lead167);
}

main()
  .finally(() => prisma.$disconnect());
