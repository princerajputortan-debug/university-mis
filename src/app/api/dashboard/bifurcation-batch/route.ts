import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const batch = searchParams.get('batch') || '';

  let batchFilter = '';
  if (batch) {
    batchFilter = `AND TRIM(b.batch) = '${batch.replace(/'/g, "''")}'`;
  }

  try {
    const batchRows = await prisma.$queryRawUnsafe<Array<{ batch: string }>>(
      `SELECT DISTINCT TRIM(b.batch) AS batch
       FROM AdmissionForm af
       JOIN Batch b ON af.batch = b.id
       WHERE b.batch IS NOT NULL AND TRIM(b.batch) != ''
       ORDER BY b.batch DESC`
    );
    const batches = batchRows.map((r) => r.batch.trim());

    const bifurcationRows = await prisma.$queryRawUnsafe<Array<{ bifurcation: string }>>(
      `SELECT DISTINCT TRIM(bif.bifurcation) AS bifurcation
       FROM Bifurcation bif
       WHERE bif.bifurcation IS NOT NULL AND TRIM(bif.bifurcation) != ''
       ORDER BY bif.bifurcation ASC`
    );
    const bifurcationColumns = bifurcationRows.map((r) => r.bifurcation.trim());

    // Keep Channel Partner first when present, then alphabetical remainder.
    const orderedColumns = [
      ...bifurcationColumns.filter((c) => c.toLowerCase() === 'channel partner'),
      ...bifurcationColumns.filter((c) => c.toLowerCase() !== 'channel partner'),
    ];

    const pivotRows = await prisma.$queryRawUnsafe<
      Array<{ batch: string; bifurcation: string; cnt: bigint }>
    >(`
      SELECT
        TRIM(b.batch) AS batch,
        COALESCE(TRIM(bif.bifurcation), 'Unassigned') AS bifurcation,
        COUNT(*) AS cnt
      FROM AdmissionForm af
      JOIN Batch b ON af.batch = b.id
      LEFT JOIN Bifurcation bif ON af.bifurcation = bif.id
      WHERE af.enrollment_no IS NOT NULL
        ${batchFilter}
      GROUP BY TRIM(b.batch), COALESCE(TRIM(bif.bifurcation), 'Unassigned')
      ORDER BY TRIM(b.batch) DESC
    `);

    const allColumns = orderedColumns.includes('Unassigned')
      ? orderedColumns
      : [...orderedColumns, 'Unassigned'];

    const grouped: Record<string, Record<string, number>> = {};

    for (const row of pivotRows) {
      const batchName = row.batch?.trim() || 'Others';
      if (!grouped[batchName]) {
        grouped[batchName] = {};
        allColumns.forEach((col) => {
          grouped[batchName][col] = 0;
        });
        grouped[batchName].Total = 0;
      }
      const count = Number(row.cnt);
      const col = row.bifurcation?.trim() || 'Unassigned';
      if (!grouped[batchName][col] && col !== 'Unassigned') {
        grouped[batchName][col] = 0;
      }
      grouped[batchName][col] = (grouped[batchName][col] || 0) + count;
      grouped[batchName].Total += count;
    }

    const data = Object.keys(grouped)
      .map((batchName) => ({ batch: batchName, ...grouped[batchName] }) as { batch: string; Total: number; [key: string]: string | number })
      .sort((a, b) => Number(b.Total) - Number(a.Total));

    const columnTotals: Record<string, number> = { Total: 0 };
    allColumns.forEach((col) => {
      columnTotals[col] = 0;
    });
    data.forEach((row) => {
      columnTotals.Total += Number(row.Total) || 0;
      allColumns.forEach((col) => {
        columnTotals[col] += Number(row[col]) || 0;
      });
    });

    const channelPartnerTotal =
      columnTotals['Channel Partner'] ?? columnTotals['channel partner'] ?? 0;

    return NextResponse.json({
      data,
      bifurcationColumns: allColumns,
      batches,
      columnTotals,
      totalStudents: columnTotals.Total || 0,
      channelPartnerTotal,
      channelPartnerShare:
        columnTotals.Total > 0
          ? Math.round((channelPartnerTotal / columnTotals.Total) * 1000) / 10
          : 0,
    });
  } catch (error) {
    console.error('API Error (bifurcation-batch):', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
