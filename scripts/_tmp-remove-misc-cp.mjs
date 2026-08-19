import { PrismaClient } from '../src/generated/prisma/index.js';
const prisma = new PrismaClient();

const deleted = await prisma.consolidatedPayment.deleteMany({ where: { sourceName: 'Misc' } });
const remaining = await prisma.consolidatedPayment.count({ where: { sourceName: 'Misc' } });
const misc = await prisma.miscPayment.count();
const reco = await prisma.consolidatedPayment.count({
  where: { enrollmentId: null, NOT: { sourceName: 'Misc' } },
});

console.log({
  deletedMiscFromCP: deleted.count,
  remainingCPMisc: remaining,
  miscPaymentRows: misc,
  pendingRecoExcludingMisc: reco,
});

await prisma.$disconnect();
