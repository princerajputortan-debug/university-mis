import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  parseCategoryFilter,
  sqlCategoryFilterForPayment,
} from '@/lib/bifurcation-categories';
import { getMisCalendarYears, getTodayLocal } from '@/lib/mis-dates';

const CONSOLIDATED_SOURCES = ['Razorpay', 'Jodo', 'Early', 'Offline', 'Bank', 'Propelld', 'Corp Inst'];
const ALL_SOURCES = [...CONSOLIDATED_SOURCES, 'Misc'];

function emptySourceRow(sourceName: string, years: number[]) {
  return {
    sourceName,
    today: 0,
    mtd: 0,
    ytd: 0,
    byYear: Object.fromEntries(years.map((year) => [year, 0])) as Record<number, number>,
  };
}

function mapSourceRow(sourceName: string, row: Record<string, unknown> | undefined, years: number[]) {
  return {
    sourceName,
    today: Number(row?.today || 0),
    mtd: Number(row?.mtd || 0),
    ytd: Number(row?.ytd || 0),
    byYear: Object.fromEntries(
      years.map((year) => [year, Number(row?.[`y${year}`] || 0)])
    ) as Record<number, number>,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = parseCategoryFilter(searchParams.get('category'));
  const categoryFilter = sqlCategoryFilterForPayment(category);

  const today = getTodayLocal();
  const years = getMisCalendarYears(today);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  const sourceList = CONSOLIDATED_SOURCES.map((source) => `'${source}'`).join(',');
  const yearSums = years
    .map(
      (year) =>
        `COALESCE(SUM(CASE WHEN date >= '${year}-01-01' AND date < '${year + 1}-01-01' THEN amount ELSE 0 END), 0) AS y${year}`
    )
    .join(', ');

  try {
    const sourceRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        sourceName,
        COALESCE(SUM(CASE WHEN date >= '${startOfToday.toISOString()}' AND date <= '${endOfToday.toISOString()}' THEN amount ELSE 0 END), 0) AS today,
        COALESCE(SUM(CASE WHEN date >= '${startOfMonth.toISOString()}' AND date <= '${endOfToday.toISOString()}' THEN amount ELSE 0 END), 0) AS mtd,
        COALESCE(SUM(CASE WHEN date >= '${startOfYear.toISOString()}' AND date <= '${endOfToday.toISOString()}' THEN amount ELSE 0 END), 0) AS ytd,
        ${yearSums}
      FROM ConsolidatedPayment cp
      WHERE sourceName IN (${sourceList})
        AND date IS NOT NULL
        ${categoryFilter}
      GROUP BY sourceName
    `);

    const sourceMap = new Map(sourceRows.map((row) => [String(row.sourceName), row]));
    const paymentSourceMis = CONSOLIDATED_SOURCES.map((sourceName) =>
      mapSourceRow(sourceName, sourceMap.get(sourceName), years)
    );

    // Misc lives only in MiscPayment (not ConsolidatedPayment). Skip when a
    // bifurcation category filter is applied — Misc has no admission linkage.
    if (!category) {
      const miscRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT
          COALESCE(SUM(CASE WHEN date >= '${startOfToday.toISOString()}' AND date <= '${endOfToday.toISOString()}' THEN amount ELSE 0 END), 0) AS today,
          COALESCE(SUM(CASE WHEN date >= '${startOfMonth.toISOString()}' AND date <= '${endOfToday.toISOString()}' THEN amount ELSE 0 END), 0) AS mtd,
          COALESCE(SUM(CASE WHEN date >= '${startOfYear.toISOString()}' AND date <= '${endOfToday.toISOString()}' THEN amount ELSE 0 END), 0) AS ytd,
          ${yearSums}
        FROM MiscPayment
        WHERE date IS NOT NULL
      `);
      paymentSourceMis.push(mapSourceRow('Misc', miscRows[0], years));
    } else {
      paymentSourceMis.push(emptySourceRow('Misc', years));
    }

    // Keep stable order matching ALL_SOURCES
    const ordered = ALL_SOURCES.map(
      (name) => paymentSourceMis.find((r) => r.sourceName === name) || emptySourceRow(name, years)
    );

    return NextResponse.json({ category: category || null, years, paymentSourceMis: ordered });
  } catch (error) {
    console.error('API Error (payment-source-mis):', error);
    return NextResponse.json({ error: 'Failed to fetch payment source MIS' }, { status: 500 });
  }
}
