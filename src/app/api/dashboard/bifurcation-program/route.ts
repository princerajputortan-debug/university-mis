import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const batch = searchParams.get('batch') || '';

  try {
    const batchRows = await prisma.$queryRawUnsafe<Array<{ batch: string }>>(
      `SELECT DISTINCT b.batch
       FROM AdmissionForm af
       JOIN Batch b ON af.batch = b.id
       WHERE b.batch IS NOT NULL AND b.batch != ''
       ORDER BY b.batch DESC`
    );
    const batches = batchRows.map((r) => r.batch);

    let whereClause = `WHERE af.program IS NOT NULL AND af.bifurcation IS NOT NULL`;
    if (batch) {
      whereClause += ` AND b.batch = '${batch.replace(/'/g, "''")}'`;
    }

    const pivotRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        bif.bifurcation AS category,
        pr.program AS program,
        COUNT(*) AS cnt
      FROM AdmissionForm af
      JOIN Program pr ON af.program = pr.id
      JOIN Bifurcation bif ON af.bifurcation = bif.id
      LEFT JOIN Batch b ON af.batch = b.id
      ${whereClause}
      GROUP BY bif.bifurcation, pr.program
      ORDER BY bif.bifurcation, pr.program
    `);

    const programSet = new Set<string>();
    pivotRows.forEach((r) => programSet.add(String(r.program)));
    const programs = Array.from(programSet).sort();

    const pivotMap: Record<string, Record<string, number>> = {};
    pivotRows.forEach((r) => {
      const cat = r.category as string;
      if (!pivotMap[cat]) {
        pivotMap[cat] = {};
      }
      pivotMap[cat][r.program as string] = Number(r.cnt);
    });

    const categories = Object.keys(pivotMap).sort();
    const data = categories.map((category) => {
      const row: Record<string, number | string> = { category };
      let grandTotal = 0;
      programs.forEach((prog) => {
        const count = pivotMap[category]?.[prog] || 0;
        row[prog] = count;
        grandTotal += count;
      });
      row.grandTotal = grandTotal;
      return row;
    });

    const columnTotals: Record<string, number> = {};
    let overallTotal = 0;
    programs.forEach((prog) => {
      const total = data.reduce((sum, row) => sum + (Number(row[prog]) || 0), 0);
      columnTotals[prog] = total;
      overallTotal += total;
    });
    columnTotals.grandTotal = overallTotal;

    const ugcRows = await prisma.$queryRawUnsafe<Array<{ status: string; cnt: bigint }>>(`
      SELECT
        COALESCE(us.ugcStatus, 'Unassigned') AS status,
        COUNT(*) AS cnt
      FROM AdmissionForm af
      LEFT JOIN UgcStatus us ON af.ugc_status = us.id
      LEFT JOIN Batch b ON af.batch = b.id
      ${whereClause}
      GROUP BY COALESCE(us.ugcStatus, 'Unassigned')
      ORDER BY cnt DESC
    `);

    const ugcStatusCounts = ugcRows.map((r) => ({
      status: r.status,
      count: Number(r.cnt),
    }));

    return NextResponse.json({
      data,
      programs,
      batches,
      columnTotals,
      ugcStatusCounts,
    });
  } catch (error) {
    console.error('API Error (bifurcation-program):', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
