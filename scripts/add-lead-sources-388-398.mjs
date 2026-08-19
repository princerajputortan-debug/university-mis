/**
 * Add lead sources (ids 388–398) to LeadSource lookup table.
 * Usage: node scripts/add-lead-sources-388-398.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const NEW_LEAD_SOURCES = [
  { id: 388, lead: 'Animesh' },
  { id: 389, lead: 'BCCS_solan' },
  { id: 390, lead: 'Dhakal_Academy' },
  { id: 391, lead: 'Surjeet' },
  { id: 392, lead: 'Sunita_Cyber_Cafe' },
  { id: 393, lead: 'CollegeKampus' },
  { id: 394, lead: 'DMCFS' },
  { id: 395, lead: 'Empire_Skill' },
  { id: 396, lead: 'saksham_relations' },
  { id: 397, lead: 'MU_digital_services' },
  { id: 398, lead: 'Alka_Rani' },
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
