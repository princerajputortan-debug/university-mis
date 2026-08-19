/**
 * Add lead sources (ids 399–402) to LeadSource lookup table.
 * Usage: node scripts/add-lead-sources-399-402.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const NEW_LEAD_SOURCES = [
  { id: 399, lead: 'DS_Buddy Referral' },
  { id: 400, lead: 'Neelam_Kumari' },
  { id: 401, lead: 'CAP_Educational_Services' },
  { id: 402, lead: 'Conext' },
];

async function main() {
  const before = await prisma.leadSource.count();
  const [{ maxId }] = await prisma.$queryRawUnsafe('SELECT COALESCE(MAX(id), 0) AS maxId FROM LeadSource');
  console.log('LeadSource rows before:', before, '| current max id:', Number(maxId));

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
