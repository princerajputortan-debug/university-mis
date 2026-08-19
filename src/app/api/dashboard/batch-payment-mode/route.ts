import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PAYMENT_SOURCES, PRIMARY_PAYMENT_SLUGS } from '@/lib/payment-sources';

const GATEWAY_SOURCES = PRIMARY_PAYMENT_SLUGS.map((slug) => PAYMENT_SOURCES[slug].label);
const ALL_SOURCES = [...GATEWAY_SOURCES, 'Unassigned'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const batch = searchParams.get('batch') || '';

  const sourceList = GATEWAY_SOURCES.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');
  let batchFilter = '';
  if (batch) {
    batchFilter = `AND b.batch = '${batch.replace(/'/g, "''")}'`;
  }

  try {
    const batchRows = await prisma.$queryRawUnsafe<Array<{ batch: string }>>(
      `SELECT DISTINCT b.batch
       FROM AdmissionForm af
       JOIN Batch b ON af.batch = b.id
       WHERE b.batch IS NOT NULL AND TRIM(b.batch) != ''
       ORDER BY b.batch DESC`
    );
    const batches = batchRows.map((r) => r.batch.trim());

    const pivotRows = await prisma.$queryRawUnsafe<
      Array<{ batch: string; sourceName: string; cnt: bigint }>
    >(`
      SELECT
        TRIM(b.batch) AS batch,
        COALESCE(pp.sourceName, 'Unassigned') AS sourceName,
        COUNT(*) AS cnt
      FROM AdmissionForm af
      JOIN Batch b ON af.batch = b.id
      LEFT JOIN (
        SELECT enrollmentId, sourceName
        FROM (
          SELECT
            enrollmentId,
            sourceName,
            ROW_NUMBER() OVER (
              PARTITION BY enrollmentId
              ORDER BY \`date\` ASC, id ASC
            ) AS rn
          FROM ConsolidatedPayment
          WHERE enrollmentId IS NOT NULL
            AND sourceName IN (${sourceList})
        ) ranked
        WHERE rn = 1
      ) pp ON pp.enrollmentId = af.enrollment_no
      WHERE af.enrollment_no IS NOT NULL
        ${batchFilter}
      GROUP BY TRIM(b.batch), COALESCE(pp.sourceName, 'Unassigned')
      ORDER BY TRIM(b.batch) DESC
    `);

    const grouped: Record<string, Record<string, number>> = {};

    for (const row of pivotRows) {
      const batchName = row.batch?.trim() || 'Others';
      if (!grouped[batchName]) {
        grouped[batchName] = {};
        ALL_SOURCES.forEach((s) => {
          grouped[batchName][s] = 0;
        });
        grouped[batchName].Total = 0;
      }
      const count = Number(row.cnt);
      grouped[batchName][row.sourceName] = count;
      grouped[batchName].Total += count;
    }

    const data = Object.keys(grouped)
      .map((batchName) => ({ batch: batchName, ...grouped[batchName] }) as { batch: string; Total: number; [key: string]: string | number })
      .sort((a, b) => Number(b.Total) - Number(a.Total));

    const columnTotals: Record<string, number> = { Total: 0 };
    ALL_SOURCES.forEach((s) => {
      columnTotals[s] = 0;
    });
    data.forEach((row) => {
      columnTotals.Total += Number(row.Total) || 0;
      ALL_SOURCES.forEach((s) => {
        columnTotals[s] += Number(row[s]) || 0;
      });
    });

    return NextResponse.json({
      data,
      sources: ALL_SOURCES,
      batches,
      columnTotals,
    });
  } catch (error) {
    console.error('API Error (batch-payment-mode):', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
