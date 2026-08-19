'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type BatchRow = {
  batchId: number;
  batch: string;
  startDate: string | null;
  windowEnd: string | null;
  sameDayEnd?: string | null;
  observedDays: number;
  truncated: boolean;
  ug: number;
  pg: number;
  total: number;
};

type ApiPayload = {
  asOfDate: string;
  referenceStartDate: string;
  referenceElapsedDays: number;
  batches: BatchRow[];
  totals: { ug: number; pg: number; total: number };
  error?: string;
};

const dataLabelsPlugin = {
  id: 'batchNormalizedDataLabels',
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      meta.data.forEach((element: any, index: number) => {
        const value = Number(dataset.data?.[index]);
        if (!Number.isFinite(value) || value <= 0) return;
        const { x, y } = element.getProps(['x', 'y'], true);
        ctx.save();
        ctx.font = '600 10px var(--font-body), system-ui, sans-serif';
        ctx.fillStyle = dataset.borderColor || dataset.backgroundColor || '#1e293b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(value.toLocaleString('en-IN'), x, y - 4);
        ctx.restore();
      });
    });
  },
};

export default function BatchNormalizedComparisonChart() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/dashboard/batch-normalized-comparison');
        const json = (await res.json()) as ApiPayload;
        if (!res.ok || json.error) {
          setError(json.error || 'Failed to load comparison');
          setData(null);
          return;
        }
        setData(json);
      } catch (err) {
        console.error(err);
        setError('Failed to load comparison');
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const chartData = useMemo(() => {
    if (!data?.batches?.length) return { labels: [] as string[], datasets: [] as any[] };
    return {
      labels: data.batches.map((b) => b.batch),
      datasets: [
        {
          label: 'Total',
          data: data.batches.map((b) => b.total),
          backgroundColor: '#2563EB',
          borderColor: '#2563EB',
          borderRadius: 4,
          maxBarThickness: 48,
        },
      ],
    };
  }, [data]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 28, right: 8, left: 4 } },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            afterBody: (items: any[]) => {
              const idx = items?.[0]?.dataIndex;
              const row = data?.batches?.[idx];
              if (!row?.startDate) return '';
              return [
                `Start: ${row.startDate}`,
                `Same-day end: ${row.windowEnd}`,
                `Days: ${row.observedDays}${row.truncated ? ' (capped at today)' : ''}`,
              ];
            },
            label: (ctx: any) =>
              `Total: ${Number(ctx.raw || 0).toLocaleString('en-IN')}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          border: { display: false },
          ticks: { color: 'var(--text-secondary)' },
        },
        y: {
          beginAtZero: true,
          grid: { display: false, drawBorder: false },
          border: { display: false },
          ticks: {
            color: 'var(--text-secondary)',
            callback: (v: string | number) => Number(v).toLocaleString('en-IN'),
          },
          title: {
            display: true,
            text: 'Admissions in equalized window',
            color: 'var(--text-secondary)',
          },
        },
      },
    }),
    [data]
  );

  return (
    <div className="section-card fade-in" style={{ marginTop: '20px' }}>
      <div
        className="section-header"
        style={{ marginBottom: '12px', flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div className="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 19V5" />
              <path d="M8 19V9" />
              <path d="M12 19V7" />
              <path d="M16 19v-6" />
              <path d="M20 19V11" />
            </svg>
            Batch Equal-Day Comparison
          </div>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Same day: Day {data?.referenceElapsedDays ?? '-'} of each batch
          </span>
        </div>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 12px' }}>
        Batch 9 window
        {data
          ? ` (${data.referenceStartDate} → ${data.asOfDate}) = ${data.referenceElapsedDays} days`
          : ''}.
        Previous batches are counted from their own start date through the same day number, so you
        can compare where each batch stood at this point in the cycle. Younger batches are capped at
        today.
      </p>

      <div style={{ height: '380px', marginBottom: '16px', position: 'relative' }}>
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
            Loading equal-day comparison...
          </div>
        ) : error ? (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#ef4444' }}>
            {error}
          </div>
        ) : (
          <Bar data={chartData} options={chartOptions} plugins={[dataLabelsPlugin]} />
        )}
      </div>

      {!loading && !error && data && (
        <div className="mis-table-wrap" style={{ overflowX: 'auto' }}>
          <table className="mis-table mis-table-compact" style={{ minWidth: '700px' }}>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Start Date</th>
                <th>Same-Day End</th>
                <th>Days</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.batches.map((row) => (
                <tr key={row.batchId}>
                  <td><strong>{row.batch}</strong></td>
                  <td>{row.startDate || '-'}</td>
                  <td>{row.windowEnd || '-'}</td>
                  <td>
                    {row.observedDays > 0 ? row.observedDays.toLocaleString('en-IN') : '-'}
                    {row.truncated ? ' *' : ''}
                  </td>
                  <td><strong>{row.total > 0 ? row.total.toLocaleString('en-IN') : '-'}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}><strong>Total</strong></td>
                <td><strong>{data.totals.total.toLocaleString('en-IN')}</strong></td>
              </tr>
            </tfoot>
          </table>
          {data.batches.some((b) => b.truncated) && (
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '8px 0 0' }}>
              * Batch is younger than Batch 9’s elapsed days, so the window is capped at today.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
