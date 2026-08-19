/**
 * Convert AdmissionForm ugc_status from Bypass (5) to ERP (4).
 * Usage: node scripts/convert-ugc-bypass-to-erp.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const BYPASS = 5;
const ERP = 4;

const before = await prisma.$queryRawUnsafe(`
  SELECT ugc_status, COUNT(*) AS c
  FROM AdmissionForm
  WHERE ugc_status IN (${BYPASS}, ${ERP})
  GROUP BY ugc_status
  ORDER BY ugc_status
`);
console.log('Before:', before);

const [{ c: bypassCount }] = await prisma.$queryRawUnsafe(
  `SELECT COUNT(*) AS c FROM AdmissionForm WHERE ugc_status = ${BYPASS}`
);
console.log(`Bypass (5) rows to update: ${Number(bypassCount)}`);

const result = await prisma.$executeRawUnsafe(
  `UPDATE AdmissionForm SET ugc_status = ${ERP} WHERE ugc_status = ${BYPASS}`
);
console.log(`Updated rows: ${Number(result)}`);

const after = await prisma.$queryRawUnsafe(`
  SELECT ugc_status, COUNT(*) AS c
  FROM AdmissionForm
  WHERE ugc_status IN (${BYPASS}, ${ERP})
  GROUP BY ugc_status
  ORDER BY ugc_status
`);
console.log('After:', after);

const [{ c: remainingBypass }] = await prisma.$queryRawUnsafe(
  `SELECT COUNT(*) AS c FROM AdmissionForm WHERE ugc_status = ${BYPASS}`
);
console.log(`Remaining Bypass (5): ${Number(remainingBypass)}`);

await prisma.$disconnect();
