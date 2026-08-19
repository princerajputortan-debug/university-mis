import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

try {
  const [batchRows, bifRows, teamRows, leadRows] = await Promise.all([
    prisma.batch.findMany({
      where: { id: { gte: 1, lte: 20 } },
      select: { id: true, batch: true },
      orderBy: { id: 'asc' },
    }),
    prisma.bifurcation.findMany({ select: { bifurcation: true }, take: 3 }),
    prisma.team.findMany({ select: { team: true }, take: 3 }),
    prisma.leadSource.findMany({ select: { lead: true }, take: 3 }),
  ]);
  console.log('lookups ok', {
    batches: batchRows.length,
    bif: bifRows.length,
    team: teamRows.length,
    lead: leadRows.length,
  });

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      af.batch AS batchId,
      b.batch AS batchLabel,
      at.type AS typeLabel,
      COUNT(*) AS count
    FROM AdmissionForm af
    LEFT JOIN Batch b ON b.id = af.batch
    LEFT JOIN Bifurcation bif ON bif.id = af.bifurcation
    LEFT JOIN Team tm ON tm.id = af.team
    LEFT JOIN LeadSource ls ON ls.id = af.lead_source
    LEFT JOIN Program pr ON pr.id = af.program
    LEFT JOIN AdmissionType at ON at.id = af.type
    LEFT JOIN AdmissionStatus ast ON ast.id = af.status
    WHERE af.batch IS NOT NULL
    GROUP BY af.batch, b.batch, at.type
    ORDER BY af.batch, at.type
  `);
  console.log('rows', rows.length, 'sample', rows.slice(0, 3));
} catch (e) {
  console.error('FAIL', e.message || e);
} finally {
  await prisma.$disconnect();
}
