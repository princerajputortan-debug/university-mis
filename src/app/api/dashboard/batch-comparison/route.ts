import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type CountRow = {
  batchId: number;
  batchLabel: string | null;
  typeLabel: string | null;
  count: bigint | number;
};

function esc(value: string) {
  return value.replace(/'/g, "''");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bifurcation = (searchParams.get('bifurcation') || '').trim();
  const team = (searchParams.get('team') || '').trim();
  const leadSource = (searchParams.get('leadSource') || '').trim();
  const program = (searchParams.get('program') || '').trim();
  const type = (searchParams.get('type') || '').trim().toUpperCase();
  const status = (searchParams.get('status') || '').trim();
  const compareBy = (searchParams.get('compareBy') || 'total').trim().toLowerCase();
  const yearRaw = (searchParams.get('year') || '').trim();
  const monthRaw = (searchParams.get('month') || '').trim();
  const year = yearRaw ? Number(yearRaw) : NaN;
  const month = monthRaw ? Number(monthRaw) : NaN; // 1–12

  try {
    const [batchRows, bifRows, teamRows, leadRows, programRows, typeRows, statusRows, yearRows] =
      await Promise.all([
        prisma.batch.findMany({
          where: { id: { gte: 1, lte: 20 } },
          select: { id: true, batch: true },
          orderBy: { id: 'asc' },
        }),
        prisma.bifurcation.findMany({
          select: { bifurcation: true },
          orderBy: { bifurcation: 'asc' },
        }),
        prisma.team.findMany({
          select: { team: true },
          orderBy: { team: 'asc' },
        }),
        prisma.leadSource.findMany({
          select: { lead: true },
          orderBy: { lead: 'asc' },
        }),
        prisma.program.findMany({
          select: { program: true },
          orderBy: { program: 'asc' },
        }),
        prisma.admissionType.findMany({
          select: { type: true },
          orderBy: { id: 'asc' },
        }),
        prisma.admissionStatus.findMany({
          select: { status: true },
          orderBy: { id: 'asc' },
        }),
        prisma.$queryRawUnsafe<Array<{ year: number | bigint }>>(
          `SELECT DISTINCT YEAR(date_of_admission) AS year
           FROM AdmissionForm
           WHERE date_of_admission IS NOT NULL
           ORDER BY year`
        ),
      ]);

    const where: string[] = ['af.batch IS NOT NULL'];
    if (bifurcation) where.push(`bif.bifurcation = '${esc(bifurcation)}'`);
    if (team) where.push(`tm.team = '${esc(team)}'`);
    // Qualify reserved column name via table alias (avoid bare `lead`)
    if (leadSource) where.push(`ls.lead = '${esc(leadSource)}'`);
    if (program) where.push(`pr.program = '${esc(program)}'`);
    if (type === 'UG' || type === 'PG') where.push(`at.type = '${esc(type)}'`);
    if (status) where.push(`ast.status = '${esc(status)}'`);
    if (Number.isFinite(year) && year >= 2000 && year <= 2100) {
      where.push(`YEAR(af.date_of_admission) = ${year}`);
    }
    if (Number.isFinite(month) && month >= 1 && month <= 12) {
      where.push(`MONTH(af.date_of_admission) = ${month}`);
    }

    const rows = await prisma.$queryRawUnsafe<CountRow[]>(`
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
      WHERE ${where.join(' AND ')}
      GROUP BY af.batch, b.batch, at.type
      ORDER BY af.batch, at.type
    `);

    const maxBatchInData = rows.reduce((m, r) => Math.max(m, Number(r.batchId) || 0), 0);
    const batches = batchRows
      .filter((b) => b.id <= Math.max(maxBatchInData, 9))
      .map((b) => ({ id: b.id, label: b.batch }));

    const countMap = new Map<string, number>();
    for (const row of rows) {
      const batchId = Number(row.batchId);
      const typeLabel = (row.typeLabel || 'Unknown').trim().toUpperCase();
      countMap.set(`${batchId}:${typeLabel}`, Number(row.count) || 0);
    }

    const totalByBatch = batches.map((b) => {
      const ug = countMap.get(`${b.id}:UG`) || 0;
      const pg = countMap.get(`${b.id}:PG`) || 0;
      const unknown = countMap.get(`${b.id}:UNKNOWN`) || 0;
      return ug + pg + unknown;
    });
    const ugByBatch = batches.map((b) => countMap.get(`${b.id}:UG`) || 0);
    const pgByBatch = batches.map((b) => countMap.get(`${b.id}:PG`) || 0);

    const series =
      compareBy === 'type'
        ? [
            { key: 'UG', label: 'UG', data: ugByBatch },
            { key: 'PG', label: 'PG', data: pgByBatch },
          ]
        : [{ key: 'Total', label: 'Total', data: totalByBatch }];

    const years = yearRows
      .map((r) => Number(r.year))
      .filter((y) => Number.isFinite(y) && y > 0);

    return NextResponse.json({
      metric: 'Count of Enrollment',
      compareBy: compareBy === 'type' ? 'type' : 'total',
      year: Number.isFinite(year) ? year : null,
      month: Number.isFinite(month) ? month : null,
      batches,
      series,
      totals: {
        total: totalByBatch.reduce((s, n) => s + n, 0),
        ug: ugByBatch.reduce((s, n) => s + n, 0),
        pg: pgByBatch.reduce((s, n) => s + n, 0),
      },
      table: {
        total: totalByBatch,
        ug: ugByBatch,
        pg: pgByBatch,
      },
      filters: {
        bifurcations: [...new Set(bifRows.map((r) => r.bifurcation).filter(Boolean))],
        teams: [...new Set(teamRows.map((r) => r.team).filter(Boolean))],
        leadSources: [...new Set(leadRows.map((r) => r.lead).filter(Boolean))],
        programs: [...new Set(programRows.map((r) => r.program).filter(Boolean))],
        types: [...new Set(typeRows.map((r) => r.type).filter(Boolean))],
        statuses: [...new Set(statusRows.map((r) => r.status).filter(Boolean))],
        years,
        months: [
          { value: 1, label: 'January' },
          { value: 2, label: 'February' },
          { value: 3, label: 'March' },
          { value: 4, label: 'April' },
          { value: 5, label: 'May' },
          { value: 6, label: 'June' },
          { value: 7, label: 'July' },
          { value: 8, label: 'August' },
          { value: 9, label: 'September' },
          { value: 10, label: 'October' },
          { value: 11, label: 'November' },
          { value: 12, label: 'December' },
        ],
      },
    });
  } catch (error) {
    console.error('API Error (batch-comparison):', error);
    return NextResponse.json({ error: 'Failed to fetch batch comparison' }, { status: 500 });
  }
}
