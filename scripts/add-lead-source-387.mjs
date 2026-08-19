/**
 * Add lead source 387 (Edubh) to LeadSource lookup table.
 * Usage: node scripts/add-lead-source-387.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const row = { id: 387, lead: 'Edubh' };

const before = await prisma.leadSource.count();
console.log('LeadSource rows before:', before);

const existing = await prisma.leadSource.findUnique({ where: { id: row.id } });
await prisma.leadSource.upsert({
  where: { id: row.id },
  update: { lead: row.lead },
  create: { id: row.id, lead: row.lead },
});
console.log(
  `${existing ? 'Updated' : 'Added'} ${row.id}: ${row.lead}${
    existing && existing.lead !== row.lead ? ` (was: ${existing.lead})` : ''
  }`
);

const after = await prisma.leadSource.count();
console.log(`Done. LeadSource rows after: ${after}`);

await prisma.$disconnect();
