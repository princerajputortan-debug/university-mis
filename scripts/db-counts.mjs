import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const counts = {
  users: await p.user.count(),
  programs: await p.program.count(),
  batches: await p.batch.count(),
  enrollments: await p.enrollment.count(),
  admissionForms: await p.admissionForm.count(),
  payments: await p.consolidatedPayment.count(),
};
console.log(counts);
await p.$disconnect();
