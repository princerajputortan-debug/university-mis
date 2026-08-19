/**
 * Add lead sources (ids 382–386) to LeadSource lookup table.
 * Usage: node scripts/add-lead-sources-382-386.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const NEW_LEAD_SOURCES = [
  { id: 382, lead: 'LEARNFLU' },
  { id: 383, lead: 'Adani_Skill_Development' },
  { id: 384, lead: 'shyamlal' },
  { id: 385, lead: 'Tanish_Enterprises' },
  { id: 386, lead: 'khem_raj' },
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
