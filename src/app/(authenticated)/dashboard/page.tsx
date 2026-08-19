import { getSession } from '@/lib/auth';
import { isDatabaseReachable } from '@/lib/db-retry';
import {
  getMisCalendarYears,
  getMisFyStartYears,
  getTodayLocal,
  MIS_START_YEAR,
  toSqlDate,
} from '@/lib/mis-dates';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import DashboardClient from './DashboardClient';

const DB_UNREACHABLE_MSG =
  'Database is currently unreachable. Showing empty MIS metrics until the connection is restored.';
const DB_QUERY_MSG =
  'Some dashboard metrics could not be loaded. Showing partial MIS data.';

function toSqlDateTime(date: Date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function countAdmissionForms(start: Date, end: Date): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM AdmissionForm
     WHERE date_of_admission >= '${toSqlDateTime(start)}'
       AND date_of_admission <= '${toSqlDateTime(end)}'`
  );
  return Number(rows[0]?.cnt ?? 0);
}

export default async function DashboardPage() {
  const session = await getSession();
  let databaseError: string | null = null;

  const dbReachable = await isDatabaseReachable(3);
  if (!dbReachable) {
    console.error('Dashboard database health check failed after retries');
    databaseError = DB_UNREACHABLE_MSG;
  }

  const today = getTodayLocal();
  const todaySql = toSqlDate(today);
  const calendarYears = getMisCalendarYears(today);
  const fyStartYears = getMisFyStartYears(today);
  const years = calendarYears;

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  const yearDates = calendarYears.map((year) => ({
    year,
    start: new Date(year, 0, 1),
    end:
      year === today.getFullYear()
        ? endOfToday
        : new Date(year, 11, 31, 23, 59, 59, 999),
  }));

  // Legacy AdmissionForm table uses date_of_admission, not Prisma's doa field
  const admYearPromises = yearDates.map((y) => countAdmissionForms(y.start, y.end));

  // Create promises for collections by year
  const collYearPromises = yearDates.map(y => 
    prisma.consolidatedPayment.aggregate({ where: { date: { gte: y.start, lte: y.end } }, _sum: { amount: true } })
  );

  const emptyAgg = { _sum: { amount: 0 } };
  const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

  // Parallel data fetching for performance
  const [
    totalForms,
    totalPayments,
    paymentsAgg,
    // Admissions basics
    admToday,
    admMTD,
    admYTD,
    pendingReco,
    // Admissions by year
    ...restResults
  ] = databaseError
    ? [0, 0, emptyAgg, 0, 0, 0, 0, ...Array(years.length).fill(0), ...Array(years.length + 3).fill(emptyAgg)]
    : await Promise.all([
    safe(
      prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>('SELECT COUNT(*) AS cnt FROM AdmissionForm').then(
        (rows) => Number(rows[0]?.cnt ?? 0)
      ),
      0
    ),
    safe(prisma.consolidatedPayment.count(), 0),
    safe(
      prisma.consolidatedPayment.aggregate({
        where: { date: { not: null } },
        _sum: { amount: true },
      }),
      emptyAgg as any
    ),
    
    safe(countAdmissionForms(startOfToday, endOfToday), 0),
    safe(countAdmissionForms(startOfMonth, endOfToday), 0),
    safe(countAdmissionForms(startOfYear, endOfToday), 0),
    safe(prisma.consolidatedPayment.count({ where: { enrollmentId: null, NOT: { sourceName: 'Misc' } } }), 0),
    
    ...admYearPromises.map(p => safe(p, 0)),
    
    safe(prisma.consolidatedPayment.aggregate({ where: { date: { gte: startOfToday, lte: endOfToday } }, _sum: { amount: true } }), emptyAgg as any),
    safe(prisma.consolidatedPayment.aggregate({ where: { date: { gte: startOfMonth, lte: endOfToday } }, _sum: { amount: true } }), emptyAgg as any),
    safe(prisma.consolidatedPayment.aggregate({ where: { date: { gte: startOfYear, lte: endOfToday } }, _sum: { amount: true } }), emptyAgg as any),
    
    ...collYearPromises.map(p => safe(p, emptyAgg as any))
  ]);
  
  // Extract results
  const admYearResults = restResults.slice(0, years.length) as number[];
  const collToday = restResults[years.length] as { _sum: { amount: number | null } };
  const collMTD = restResults[years.length + 1] as { _sum: { amount: number | null } };
  const collYTD = restResults[years.length + 2] as { _sum: { amount: number | null } };
  const collYearResults = restResults.slice(years.length + 3) as { _sum: { amount: number | null } }[];

  const sourceNames = ['Razorpay', 'Jodo', 'Early', 'Offline', 'Bank', 'Propelld', 'Corp Inst', 'Misc'];
  const consolidatedSourceNames = ['Razorpay', 'Jodo', 'Early', 'Offline', 'Bank', 'Propelld', 'Corp Inst'];
  let totalRevenue = paymentsAgg._sum.amount || 0;

  let paymentSourceMis = sourceNames.map(sourceName => ({
    sourceName,
    today: 0,
    mtd: 0,
    ytd: 0,
    byYear: Object.fromEntries(years.map(year => [year, 0])) as Record<number, number>,
  }));
  let admissionMonthlyMatrix = years.map(year => ({
    year,
    months: Array(12).fill(0) as number[],
    total: 0,
  }));
  let programBreakdown: { name: string; count: number; pct: number }[] = [];
  let collectionMonthlyMatrix = years.map(year => ({
    year,
    months: Array(12).fill(0) as number[],
    total: 0,
  }));

  if (!databaseError) {
    try {
      const sourceList = consolidatedSourceNames.map(source => `'${source}'`).join(',');
      const yearSums = years
        .map(year => `COALESCE(SUM(CASE WHEN date >= '${year}-01-01' AND date < '${year + 1}-01-01' THEN amount ELSE 0 END), 0) AS y${year}`)
        .join(', ');

      const sourceRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT
          sourceName,
          COALESCE(SUM(CASE WHEN date >= '${startOfToday.toISOString()}' AND date <= '${endOfToday.toISOString()}' THEN amount ELSE 0 END), 0) AS today,
          COALESCE(SUM(CASE WHEN date >= '${startOfMonth.toISOString()}' AND date <= '${endOfToday.toISOString()}' THEN amount ELSE 0 END), 0) AS mtd,
          COALESCE(SUM(CASE WHEN date >= '${startOfYear.toISOString()}' AND date <= '${endOfToday.toISOString()}' THEN amount ELSE 0 END), 0) AS ytd,
          ${yearSums}
        FROM ConsolidatedPayment
        WHERE sourceName IN (${sourceList}) AND date IS NOT NULL
        GROUP BY sourceName
      `);

      const miscRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT
          COALESCE(SUM(CASE WHEN date >= '${startOfToday.toISOString()}' AND date <= '${endOfToday.toISOString()}' THEN amount ELSE 0 END), 0) AS today,
          COALESCE(SUM(CASE WHEN date >= '${startOfMonth.toISOString()}' AND date <= '${endOfToday.toISOString()}' THEN amount ELSE 0 END), 0) AS mtd,
          COALESCE(SUM(CASE WHEN date >= '${startOfYear.toISOString()}' AND date <= '${endOfToday.toISOString()}' THEN amount ELSE 0 END), 0) AS ytd,
          ${yearSums}
        FROM MiscPayment
        WHERE date IS NOT NULL
      `);

      const admissionRows = await prisma.$queryRawUnsafe<Array<{ year: number; month: number; count: bigint }>>(`
        SELECT YEAR(date_of_admission) AS year, MONTH(date_of_admission) AS month, COUNT(*) AS count
        FROM AdmissionForm
        WHERE date_of_admission >= '${MIS_START_YEAR}-01-01'
          AND date_of_admission <= '${todaySql}'
        GROUP BY YEAR(date_of_admission), MONTH(date_of_admission)
      `);

      const programRows = await prisma.$queryRawUnsafe<Array<{ name: string; cnt: bigint }>>(`
        SELECT pr.program AS name, COUNT(*) AS cnt
        FROM AdmissionForm af
        JOIN Program pr ON af.program = pr.id
        WHERE af.program IS NOT NULL
        GROUP BY pr.program
        ORDER BY cnt DESC
      `);
      const totalProgCount = programRows.reduce((s, r) => s + Number(r.cnt), 0);
      programBreakdown = programRows.map(r => ({
        name: r.name,
        count: Number(r.cnt),
        pct: totalProgCount > 0 ? Math.round((Number(r.cnt) / totalProgCount) * 100) : 0,
      }));

      const sourceMap = new Map(sourceRows.map(row => [row.sourceName, row]));
      sourceMap.set('Misc', miscRows[0] || {});
      paymentSourceMis = sourceNames.map(sourceName => {
        const row = sourceMap.get(sourceName);
        return {
          sourceName,
          today: Number(row?.today || 0),
          mtd: Number(row?.mtd || 0),
          ytd: Number(row?.ytd || 0),
          byYear: Object.fromEntries(
            years.map(year => [year, Number(row?.[`y${year}`] || 0)])
          ) as Record<number, number>,
        };
      });

      // Keep Total Revenue card aligned with Payment Source MIS totals
      totalRevenue = paymentSourceMis.reduce(
        (sum, row) => sum + years.reduce((yearSum, year) => yearSum + (row.byYear[year] || 0), 0),
        0
      );

      const monthlyLookup = new Map(
        admissionRows.map(row => [`${Number(row.year)}-${Number(row.month)}`, Number(row.count)])
      );
      admissionMonthlyMatrix = calendarYears.map((year) => {
        const months = Array.from({ length: 12 }, (_, idx) => monthlyLookup.get(`${year}-${idx + 1}`) || 0);
        return {
          year,
          months,
          total: months.reduce((sum, value) => sum + value, 0),
        };
      });

      const collectionRows = await prisma.$queryRawUnsafe<Array<{ year: number; month: number; total: number }>>(`
        SELECT YEAR(date) AS year, MONTH(date) AS month, COALESCE(SUM(amount), 0) AS total
        FROM (
          SELECT date, amount FROM ConsolidatedPayment
          WHERE date >= '${MIS_START_YEAR}-01-01' AND date <= '${todaySql}' AND date IS NOT NULL
          UNION ALL
          SELECT date, amount FROM MiscPayment
          WHERE date >= '${MIS_START_YEAR}-01-01' AND date <= '${todaySql}' AND date IS NOT NULL
        ) all_collections
        GROUP BY YEAR(date), MONTH(date)
      `);
      const collMonthlyLookup = new Map(
        collectionRows.map(row => [`${Number(row.year)}-${Number(row.month)}`, Number(row.total)])
      );
      collectionMonthlyMatrix = calendarYears.map((year) => {
        const months = Array.from({ length: 12 }, (_, idx) => collMonthlyLookup.get(`${year}-${idx + 1}`) || 0);
        return {
          year,
          months,
          total: months.reduce((sum, value) => sum + value, 0),
        };
      });
    } catch (error) {
      console.error('Dashboard MIS query failed:', error);
      databaseError = DB_QUERY_MSG;
    }
  }

  return (
    <div className="page fade-in pb-12">
      {/* PAGE HEADER */}
      <div className="page-header fade-in">
        <div className="page-header-left">
          <h1 className="welcome-title">Welcome back, {session?.user?.email || 'Admin'}</h1>
          <div className="welcome-sub">
            <div className="live-dot"></div>
            <span>University MIS &middot; Last updated 2 min ago</span>
          </div>
        </div>
        
        <div className="quick-actions">
          <Link href="/admission-form/new" className="btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Admission
          </Link>
          {session?.user?.role === 'ADMIN' && (
            <>
              <Link href="/upload" className="btn-secondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                Upload CSV
              </Link>
              <Link href="/reconciliation" className="btn-secondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                View Pending Reco
              </Link>
              <button className="btn-secondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download Report
              </button>
            </>
          )}
        </div>
      </div>

      {databaseError && (
        <div
          className="section-card"
          style={{
            borderColor: 'var(--warning)',
            background: 'var(--warning-dim)',
            color: 'var(--warning)',
            marginBottom: '20px',
          }}
        >
          {databaseError}
        </div>
      )}
      
      <DashboardClient 
        data={{
          totalForms,
          totalPayments,
          totalRevenue,
          pendingReco,
          admToday,
          admMTD,
          admYTD,
          collToday: (collToday._sum.amount || 0) + (paymentSourceMis.find((r) => r.sourceName === 'Misc')?.today || 0),
          collMTD: (collMTD._sum.amount || 0) + (paymentSourceMis.find((r) => r.sourceName === 'Misc')?.mtd || 0),
          collYTD: (collYTD._sum.amount || 0) + (paymentSourceMis.find((r) => r.sourceName === 'Misc')?.ytd || 0),
          years,
          fyStartYears,
          admYearResults,
          collYearResults: collYearResults.map((r, i) =>
            (r._sum.amount || 0) + (paymentSourceMis.find((row) => row.sourceName === 'Misc')?.byYear[years[i]] || 0)
          ),
          paymentSourceMis,
          admissionMonthlyMatrix,
          collectionMonthlyMatrix,
          programBreakdown,
        }} 
      />
    </div>
  );
}
