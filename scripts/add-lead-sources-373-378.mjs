/**
 * Add lead sources (ids 373–381) to LeadSource lookup table.
 * Usage: node scripts/add-lead-sources-373-378.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const NEW_LEAD_SOURCES = [
  { id: 373, lead: 'CEC' },
  { id: 374, lead: 'D_T_E' },
  { id: 375, lead: 'VIPS_Foundation_DITE' },
  { id: 376, lead: 'WebChatBOT' },
  { id: 377, lead: 'AiSensy' },
  { id: 378, lead: 'ecampus' },
  { id: 379, lead: 'smart_educator' },
  { id: 380, lead: 'Dnotes' },
  { id: 381, lead: 'Expertuni' },
];

async function main() {
  const before = await prisma.leadSource.count();
  console.log('LeadSource rows before:', before);

  for (const row of NEW_LEAD_SOURCES) {
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
  }

  const after = await prisma.leadSource.count();
  console.log(`\nDone. LeadSource rows after: ${after}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
