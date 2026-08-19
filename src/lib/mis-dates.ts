export const MIS_START_YEAR = 2022;

export const FY_MONTH_LABELS = [
  'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar',
] as const;

export function getTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function toSqlDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** FY starting in April: e.g. Jun 2026 → 2025-26 is not current; Apr 2026 → FY 2026-27. */
export function getCurrentFyStartYear(today = getTodayLocal()): number {
  return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
}

/** Calendar years required to build FY rows through the current year. */
export function getMisCalendarYears(today = getTodayLocal()): number[] {
  const endYear = today.getFullYear();
  const years: number[] = [];
  for (let year = MIS_START_YEAR; year <= endYear; year++) {
    years.push(year);
  }
  return years;
}

/** FY start years to show (2022-23 through the active financial year). */
export function getMisFyStartYears(today = getTodayLocal()): number[] {
  const currentFy = getCurrentFyStartYear(today);
  const years: number[] = [];
  for (let year = MIS_START_YEAR; year <= currentFy; year++) {
    years.push(year);
  }
  return years;
}

/** FY month index 0 = Apr of fyStartYear, 11 = Mar of fyStartYear + 1. */
export function getFyMonthStartDate(fyStartYear: number, fyMonthIdx: number): Date {
  if (fyMonthIdx < 9) {
    return new Date(fyStartYear, fyMonthIdx + 3, 1);
  }
  return new Date(fyStartYear + 1, fyMonthIdx - 9, 1);
}

export function isFutureFyMonth(fyStartYear: number, fyMonthIdx: number, today = getTodayLocal()): boolean {
  return getFyMonthStartDate(fyStartYear, fyMonthIdx) > today;
}

export function maskFutureFyMonths(
  months: number[],
  fyStartYear: number,
  today = getTodayLocal()
): number[] {
  return months.map((count, idx) => (isFutureFyMonth(fyStartYear, idx, today) ? 0 : count));
}

export function buildFyMatrixFromCalendar(
  calendarMatrix: { year: number; months: number[] }[],
  fyStartYears: number[],
  today = getTodayLocal()
) {
  const lookup = new Map(calendarMatrix.map((row) => [row.year, row.months]));

  return fyStartYears.map((startYear) => {
    const endYear = startYear + 1;
    const startMonths = lookup.get(startYear) || Array(12).fill(0);
    const endMonths = lookup.get(endYear) || Array(12).fill(0);
    const months = maskFutureFyMonths(
      [
        startMonths[3], startMonths[4], startMonths[5],
        startMonths[6], startMonths[7], startMonths[8],
        startMonths[9], startMonths[10], startMonths[11],
        endMonths[0], endMonths[1], endMonths[2],
      ],
      startYear,
      today
    );

    return {
      label: `${startYear}-${String(endYear).slice(2)}`,
      startYear,
      months,
      total: months.reduce((sum, value) => sum + value, 0),
    };
  });
}
