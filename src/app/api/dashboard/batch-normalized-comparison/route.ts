import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type StartRow = {
  batchId: number | bigint;
  batchLabel: string | null;
  startDate: Date | string | null;
};

type DistinctDoaRow = {
  batchId: number | bigint;
  doa: string;
};

type CountRow = {
  batchId: number | bigint;
  typeLabel: string | null;
  count: number | bigint;
};

/** When MIN(DOA) still has known early outliers, force the official cohort start. */
const BATCH_START_OVERRIDES: Record<number, string> = {
  9: '2026-04-14',
};

/** If the earliest DOA is more than this many days before the next distinct DOA, treat it as an outlier. */
const OUTLIER_GAP_DAYS = 90;

function toDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((b - a) / 86400000));
}

function resolveBatchStart(
  batchId: number,
  distinctDoasAsc: string[]
): string | null {
  if (BATCH_START_OVERRIDES[batchId]) return BATCH_START_OVERRIDES[batchId];
  if (!distinctDoasAsc.length) return null;
  if (distinctDoasAsc.length === 1) return distinctDoasAsc[0];

  let start = distinctDoasAsc[0];
  for (let i = 0; i < distinctDoasAsc.length - 1; i++) {
    const gap = daysBetween(distinctDoasAsc[i], distinctDoasAsc[i + 1]);
    if (gap > OUTLIER_GAP_DAYS) {
      start = distinctDoasAsc[i + 1];
      continue;
    }
    break;
  }
  return start;
}

export async function GET() {
  try {
    const asOfDate = todayLocal();

    const startRows = await prisma.$queryRawUnsafe<StartRow[]>(`
      SELECT
        af.batch AS batchId,
        b.batch AS batchLabel,
        DATE_FORMAT(MIN(af.date_of_admission), '%Y-%m-%d') AS startDate
      FROM AdmissionForm af
      LEFT JOIN Batch b ON b.id = af.batch
      WHERE af.batch BETWEEN 1 AND 9
        AND af.date_of_admission IS NOT NULL
      GROUP BY af.batch, b.batch
      ORDER BY af.batch
    `);

    const distinctDoas = await prisma.$queryRawUnsafe<DistinctDoaRow[]>(`
      SELECT
        af.batch AS batchId,
        DATE_FORMAT(af.date_of_admission, '%Y-%m-%d') AS doa
      FROM AdmissionForm af
      WHERE af.batch BETWEEN 1 AND 9
        AND af.date_of_admission IS NOT NULL
      GROUP BY af.batch, DATE_FORMAT(af.date_of_admission, '%Y-%m-%d')
      ORDER BY af.batch, doa
    `);

    const doasByBatch = new Map<number, string[]>();
    for (const row of distinctDoas) {
      const batchId = Number(row.batchId);
      const list = doasByBatch.get(batchId) || [];
      list.push(row.doa);
      doasByBatch.set(batchId, list);
    }

    const starts = startRows
      .map((r) => {
        const batchId = Number(r.batchId);
        return {
          batchId,
          batchLabel: r.batchLabel || `batch ${batchId}`,
          startDate: resolveBatchStart(batchId, doasByBatch.get(batchId) || []),
          rawMinStart: toDateOnly(r.startDate),
        };
      })
      .filter((r) => r.startDate);

    const batch9 = starts.find((r) => r.batchId === 9);
    if (!batch9?.startDate) {
      return NextResponse.json({ error: 'Batch 9 start date not found' }, { status: 404 });
    }

    // Batch 9: official start → today = N days (e.g. 14 Apr 2026 → 30 Jul 2026 = 107).
    const referenceElapsedDays = daysBetween(batch9.startDate, asOfDate);

    // Each prior batch is measured from its own start for the same N days
    // (= "position on the same day" of the admission cycle).
    const windows = starts.map((batch) => {
      const startDate = batch.startDate!;
      const sameDayEnd = addDays(startDate, referenceElapsedDays);
      const countEnd = sameDayEnd > asOfDate ? asOfDate : sameDayEnd;
      return {
        batchId: batch.batchId,
        batchLabel: batch.batchLabel,
        startDate,
        sameDayEnd,
        windowEnd: countEnd,
        countEnd,
        observedDays: daysBetween(startDate, countEnd),
        truncated: sameDayEnd > asOfDate,
      };
    });

    const caseSql = windows
      .map(
        (w) =>
          `WHEN af.batch = ${w.batchId} AND af.date_of_admission >= '${w.startDate}' AND af.date_of_admission <= '${w.countEnd}' THEN 1`
      )
      .join('\n          ');

    const counts = await prisma.$queryRawUnsafe<CountRow[]>(`
      SELECT
        af.batch AS batchId,
        at.type AS typeLabel,
        COUNT(*) AS count
      FROM AdmissionForm af
      LEFT JOIN AdmissionType at ON at.id = af.type
      WHERE af.batch BETWEEN 1 AND 9
        AND af.date_of_admission IS NOT NULL
        AND CASE
          ${caseSql}
          ELSE 0
        END = 1
      GROUP BY af.batch, at.type
      ORDER BY af.batch, at.type
    `);

    const countMap = new Map<string, number>();
    for (const row of counts) {
      const batchId = Number(row.batchId);
      const label = (row.typeLabel || 'UNKNOWN').trim().toUpperCase();
      countMap.set(`${batchId}:${label}`, Number(row.count) || 0);
    }

    const byId = new Map(
      windows.map((w) => {
        const ug = countMap.get(`${w.batchId}:UG`) || 0;
        const pg = countMap.get(`${w.batchId}:PG`) || 0;
        const unknown = countMap.get(`${w.batchId}:UNKNOWN`) || 0;
        return [
          w.batchId,
          {
            batchId: w.batchId,
            batch: w.batchLabel,
            startDate: w.startDate,
            windowEnd: w.windowEnd,
            sameDayEnd: w.sameDayEnd,
            equalizedEnd: w.sameDayEnd,
            countEnd: w.countEnd,
            observedDays: w.observedDays,
            truncated: w.truncated,
            ug,
            pg,
            other: unknown,
            total: ug + pg + unknown,
          },
        ] as const;
      })
    );

    const ordered = Array.from({ length: 9 }, (_, i) => i + 1).map((id) => {
      return (
        byId.get(id) || {
          batchId: id,
          batch: `batch ${id}`,
          startDate: null,
          windowEnd: asOfDate,
          sameDayEnd: null,
          equalizedEnd: null,
          countEnd: null,
          observedDays: 0,
          truncated: false,
          ug: 0,
          pg: 0,
          other: 0,
          total: 0,
        }
      );
    });

    return NextResponse.json({
      asOfDate,
      referenceBatchId: 9,
      referenceStartDate: batch9.startDate,
      referenceElapsedDays,
      batches: ordered,
      series: [
        { key: 'UG', label: 'UG', data: ordered.map((b) => b.ug) },
        { key: 'PG', label: 'PG', data: ordered.map((b) => b.pg) },
      ],
      totals: {
        ug: ordered.reduce((s, b) => s + b.ug, 0),
        pg: ordered.reduce((s, b) => s + b.pg, 0),
        total: ordered.reduce((s, b) => s + b.total, 0),
      },
    });
  } catch (error) {
    console.error('API Error (batch-normalized-comparison):', error);
    return NextResponse.json(
      { error: 'Failed to fetch normalized batch comparison' },
      { status: 500 }
    );
  }
}
