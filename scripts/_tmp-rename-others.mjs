import { PrismaClient } from '../src/generated/prisma/index.js';
const prisma = new PrismaClient();

const before = await prisma.consolidatedPayment.count({ where: { sourceName: 'Others' } });
const result = await prisma.consolidatedPayment.updateMany({
  where: { sourceName: 'Others' },
  data: { sourceName: 'Corp Inst' },
});
const after = await prisma.consolidatedPayment.count({ where: { sourceName: 'Corp Inst' } });
console.log({ beforeOthers: before, updated: result.count, afterCorpInst: after });

await prisma.$disconnect();
