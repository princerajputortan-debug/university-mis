import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const batch = searchParams.get('batch') || '';

  try {
    let whereClause = `WHERE 1=1`;
    if (batch) {
      whereClause += ` AND b.batch = '${batch.replace(/'/g, "''")}'`;
    }

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        e.enrollment AS enrollmentNo,
        pr.program AS program,
        b.batch AS batch,
        bif.bifurcation AS bifurcation,
        at.type AS type,
        ast.status AS status,
        t.team AS team,
        loc.location AS location,
        nat.nationality AS nationality,
        af.date_of_admission AS doa,
        po.paymentOption AS paymentOption,
        ps.placedStatus AS placedStatus
      FROM AdmissionForm af
      LEFT JOIN Enrollment e ON af.enrollment_no = e.id
      LEFT JOIN Program pr ON af.program = pr.id
      LEFT JOIN PaymentOption po ON af.payment_option = po.id
      LEFT JOIN Batch b ON af.batch = b.id
      LEFT JOIN Bifurcation bif ON af.bifurcation = bif.id
      LEFT JOIN AdmissionType at ON af.type = at.id
      LEFT JOIN AdmissionStatus ast ON af.status = ast.id
      LEFT JOIN Team t ON af.team = t.id
      LEFT JOIN Location loc ON af.location = loc.id
      LEFT JOIN Nationality nat ON af.nationality = nat.id
      LEFT JOIN PlacementStatus ps ON af.placed_status = ps.id
      ${whereClause}
      ORDER BY af.id DESC
    `);

    if (rows.length === 0) {
      return NextResponse.json({ csv: '', count: 0 });
    }

    const headers = [
      'Enrollment No', 'Program', 'Batch', 'Bifurcation', 'Type', 'Status',
      'Team', 'Location', 'Nationality', 'Date of Admission',
      'Payment Option', 'Placed Status',
    ];

    const keys = [
      'enrollmentNo', 'program', 'batch', 'bifurcation', 'type', 'status',
      'team', 'location', 'nationality', 'doa',
      'paymentOption', 'placedStatus',
    ];

    const csvRows = rows.map((row) =>
      keys
        .map((key) => {
          let val = row[key];
          if (val === null || val === undefined) return '';
          if (key === 'doa' && val) {
            val = new Date(String(val)).toLocaleDateString('en-IN');
          }
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    );

    const csv = [headers.map((h) => `"${h}"`).join(','), ...csvRows].join('\n');

    return new NextResponse('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="Student_Data${batch ? '_' + batch : ''}.csv"`,
      },
    });
  } catch (error) {
    console.error('API Error (bifurcation-program download):', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
