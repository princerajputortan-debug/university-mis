/**
 * Backfill consolidated_payout.commission_pct from comission_table_rr
 * when payout rows exist but commission is null.
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const before = await prisma.$queryRawUnsafe(`
  SELECT
    SUM(CASE WHEN commission_pct IS NULL THEN 1 ELSE 0 END) AS nullPct,
    SUM(CASE WHEN commission_pct IS NOT NULL THEN 1 ELSE 0 END) AS hasPct
  FROM consolidated_payout
`);
console.log('Before:', before);

const updated = await prisma.$executeRawUnsafe(`
  UPDATE consolidated_payout cp
  INNER JOIN AdmissionForm af ON af.enrollment_no = cp.enrollment_id
  INNER JOIN comission_table_rr ctr
    ON ctr.leadSourceId = af.lead_source
   AND ctr.batchId = af.batch
  SET cp.commission_pct = CASE
    WHEN ctr.commissionPct > 0 AND ctr.commissionPct <= 1 THEN ctr.commissionPct * 100
    ELSE ctr.commissionPct
  END
  WHERE cp.commission_pct IS NULL
    AND ctr.commissionPct IS NOT NULL
`);

console.log('Rows updated:', updated);

const after = await prisma.$queryRawUnsafe(`
  SELECT
    SUM(CASE WHEN commission_pct IS NULL THEN 1 ELSE 0 END) AS nullPct,
    SUM(CASE WHEN commission_pct IS NOT NULL THEN 1 ELSE 0 END) AS hasPct
  FROM consolidated_payout
`);
console.log('After:', after);

const sample = await prisma.$queryRawUnsafe(`
  SELECT id, enrollment_id, lead_source_code, commission_pct
  FROM consolidated_payout
  WHERE enrollment_id = 9867
`);
console.log('PGO25491027 / 9867:', sample);

await prisma.$disconnect();
