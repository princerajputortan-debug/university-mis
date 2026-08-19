import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** Fixed column order for the placement MIS pivot. */
export const PLACEMENT_STATUS_COLUMNS = [
  'pending to place',
  'placed',
  'Not Eligible',
  'opt out',
] as const;

function normalizeStatus(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === 'placed') return 'placed';
  if (s === 'pending to place') return 'pending to place';
  if (s === 'not eligible') return 'Not Eligible';
  if (s === 'opt out') return 'opt out';
  return status.trim();
}

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

    const pivotRows = await prisma.$queryRawUnsafe<
      Array<{ batch: string; status: string; cnt: bigint }>
    >(`
      SELECT
        TRIM(b.batch) AS batch,
        COALESCE(TRIM(ps.placedStatus), 'Unassigned') AS status,
        COUNT(*) AS cnt
      FROM AdmissionForm af
      JOIN Batch b ON af.batch = b.id
      LEFT JOIN PlacementStatus ps ON af.placed_status = ps.id
      WHERE af.enrollment_no IS NOT NULL
        ${batchFilter}
      GROUP BY TRIM(b.batch), COALESCE(TRIM(ps.placedStatus), 'Unassigned')
      ORDER BY TRIM(b.batch) DESC
    `);

    const grouped: Record<string, Record<string, number>> = {};

    for (const row of pivotRows) {
      const batchName = row.batch?.trim() || 'Others';
      if (!grouped[batchName]) {
        grouped[batchName] = {};
        PLACEMENT_STATUS_COLUMNS.forEach((col) => {
          grouped[batchName][col] = 0;
        });
        grouped[batchName].Total = 0;
      }
      const count = Number(row.cnt);
      const normalized = normalizeStatus(row.status);
      if (PLACEMENT_STATUS_COLUMNS.includes(normalized as (typeof PLACEMENT_STATUS_COLUMNS)[number])) {
        grouped[batchName][normalized] = (grouped[batchName][normalized] || 0) + count;
      }
      grouped[batchName].Total += count;
    }

    const data = Object.keys(grouped)
      .map((batchName) => ({ batch: batchName, ...grouped[batchName] }) as { batch: string; Total: number; [key: string]: string | number })
      .sort((a, b) => Number(b.Total) - Number(a.Total));

    const columnTotals: Record<string, number> = { Total: 0 };
    PLACEMENT_STATUS_COLUMNS.forEach((col) => {
      columnTotals[col] = 0;
    });
    data.forEach((row) => {
      columnTotals.Total += Number(row.Total) || 0;
      PLACEMENT_STATUS_COLUMNS.forEach((col) => {
        columnTotals[col] += Number(row[col]) || 0;
      });
    });

    const placedTotal = columnTotals.placed || 0;
    const totalStudents = columnTotals.Total || 0;

    return NextResponse.json({
      data,
      placementColumns: [...PLACEMENT_STATUS_COLUMNS],
      batches,
      columnTotals,
      totalStudents,
      placedTotal,
      placementRate: totalStudents > 0 ? Math.round((placedTotal / totalStudents) * 1000) / 10 : 0,
    });
  } catch (error) {
    console.error('API Error (batch-placement):', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
