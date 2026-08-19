import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getMisCalendarYears,
  getMisFyStartYears,
  getTodayLocal,
  MIS_START_YEAR,
  toSqlDate,
} from '@/lib/mis-dates';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';
  const today = getTodayLocal();
  const todaySql = toSqlDate(today);
  const calendarYears = getMisCalendarYears(today);
  const fyStartYears = getMisFyStartYears(today);

  try {
    const statusRows = await prisma.admissionStatus.findMany({
      orderBy: { status: 'asc' },
      select: { status: true },
    });
    const statuses = statusRows.map((r) => r.status);

    let whereClause = `WHERE af.date_of_admission IS NOT NULL
      AND af.date_of_admission >= '${MIS_START_YEAR}-01-01'
      AND af.date_of_admission <= '${todaySql}'`;
    if (status) {
      whereClause += ` AND ast.status = '${status.replace(/'/g, "''")}'`;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ year: number; month: number; count: bigint }>>(`
      SELECT
        YEAR(af.date_of_admission) AS year,
        MONTH(af.date_of_admission) AS month,
        COUNT(*) AS count
      FROM AdmissionForm af
      LEFT JOIN AdmissionStatus ast ON af.status = ast.id
      ${whereClause}
      GROUP BY YEAR(af.date_of_admission), MONTH(af.date_of_admission)
    `);

    const monthlyLookup = new Map(
      rows.map((row) => [`${Number(row.year)}-${Number(row.month)}`, Number(row.count)])
    );

    const matrix = calendarYears.map((year) => {
      const months = Array.from({ length: 12 }, (_, idx) => monthlyLookup.get(`${year}-${idx + 1}`) || 0);
      return {
        year,
        months,
        total: months.reduce((sum, value) => sum + value, 0),
      };
    });

    return NextResponse.json({
      matrix,
      years: fyStartYears,
      calendarYears,
      statuses,
      asOf: todaySql,
    });
  } catch (error) {
    console.error('API Error (admission-count):', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
