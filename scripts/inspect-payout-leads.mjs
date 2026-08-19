import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

try {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT ls.lead AS lead
    FROM consolidated_payout cp
    INNER JOIN LeadSource ls ON ls.id = cp.lead_source_code
    WHERE cp.lead_source_code IS NOT NULL
      AND ls.lead IS NOT NULL
      AND TRIM(ls.lead) <> ''
    ORDER BY ls.lead
    LIMIT 20
  `);
  console.log('ok', rows.length, rows.slice(0, 5));
} catch (e) {
  console.error('query failed:', e.message);
  try {
    const sample = await prisma.$queryRawUnsafe(`
      SELECT lead_source_code, COUNT(*) AS c
      FROM consolidated_payout
      WHERE lead_source_code IS NOT NULL
      GROUP BY lead_source_code
      ORDER BY c DESC
      LIMIT 10
    `);
    console.log('codes sample', sample);
    const tables = await prisma.$queryRawUnsafe(`SHOW TABLES LIKE '%lead%'`);
    console.log('lead tables', tables);
  } catch (e2) {
    console.error(e2.message);
  }
}

await prisma.$disconnect();
