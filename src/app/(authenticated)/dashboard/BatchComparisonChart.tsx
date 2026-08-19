'use client';

import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

/** Draw numeric labels above each data point (skip trendline series). */
const dataLabelsPlugin = {
  id: 'batchComparisonDataLabels',
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
      if (String(dataset.label || '').startsWith('Linear')) return;
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      meta.data.forEach((element: any, index: number) => {
        const raw = dataset.data?.[index];
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) return;
        const { x, y } = element.getProps(['x', 'y'], true);
        ctx.save();
        ctx.font = '600 11px var(--font-body), system-ui, sans-serif';
        ctx.fillStyle = dataset.borderColor || '#1e293b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(value.toLocaleString('en-IN'), x, y - 8);
        ctx.restore();
      });
    });
  },
};

type BatchPoint = { id: number; label: string };
type Series = { key: string; label: string; data: number[] };

type FilterOptions = {
  bifurcations: string[];
  teams: string[];
  leadSources: string[];
  programs: string[];
  types: string[];
  statuses: string[];
  years: number[];
  months: Array<{ value: number; label: string }>;
};

type ApiPayload = {
  batches: BatchPoint[];
  series: Series[];
  totals: { total: number; ug: number; pg: number };
  table: { total: number[]; ug: number[]; pg: number[] };
  filters: FilterOptions;
  error?: string;
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-medium)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontWeight: 500,
  outline: 'none',
  cursor: 'pointer',
  minWidth: '160px',
  boxShadow: 'var(--shadow-card)',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-display)',
};

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allLabel: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={labelStyle}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        <option value="">{allLabel}</option>
        {options.map((opt, idx) => (
          <option key={`${label}-${idx}-${opt}`} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Ordinary least-squares trendline y = a + b*x for index 0..n-1 */
function linearTrendline(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i] || 0;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return values.map(() => sumY / n);
  const b = (n * sumXY - sumX * sumY) / denom;
  const a = sumY / n - (b * sumX) / n;
  return values.map((_, i) => Math.max(0, a + b * i));
}

const SERIES_COLORS: Record<string, string> = {
  Total: '#2563EB',
  UG: '#0EA5E9',
  PG: '#F59E0B',
};

export default function BatchComparisonChart() {
  const [bifurcation, setBifurcation] = useState('');
  const [team, setTeam] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [program, setProgram] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [showTrendline, setShowTrendline] = useState(true);
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ compareBy: 'total' });
        if (bifurcation) params.set('bifurcation', bifurcation);
        if (team) params.set('team', team);
        if (leadSource) params.set('leadSource', leadSource);
        if (program) params.set('program', program);
        if (month) params.set('month', month);
        if (year) params.set('year', year);
        const res = await fetch(`/api/dashboard/batch-comparison?${params.toString()}`);
        const json = (await res.json()) as ApiPayload;
        if (!res.ok || json.error) {
          setError(json.error || 'Failed to load batch comparison');
          setData(null);
          return;
        }
        setData(json);
      } catch (err) {
        console.error(err);
        setError('Failed to load batch comparison');
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bifurcation, team, leadSource, program, month, year]);

  const chartData = useMemo(() => {
    if (!data?.batches?.length) {
      return { labels: [] as string[], datasets: [] as any[] };
    }
    const labels = data.batches.map((b) => b.label);
    const datasets = data.series.map((s) => {
      const color = SERIES_COLORS[s.key] || '#2563EB';
      return {
        label: s.label,
        data: s.data,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 3,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.15,
        fill: false,
      };
    });

    if (showTrendline && data.series[0]) {
      datasets.push({
        label: 'Linear (Total)',
        data: linearTrendline(data.series[0].data),
        borderColor: '#64748B',
        backgroundColor: '#64748B',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0,
        fill: false,
      } as any);
    }

    return { labels, datasets };
  }, [data, showTrendline]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 24, right: 8, left: 4 },
      },
      plugins: {
        legend: {
          position: 'right' as const,
          labels: { usePointStyle: true, boxWidth: 10, color: 'var(--text-secondary)' },
        },
        tooltip: {
          callbacks: {
            label: (ctx: any) =>
              `${ctx.dataset.label}: ${Number(ctx.raw || 0).toLocaleString('en-IN')}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: { color: 'var(--text-secondary)' },
          border: { display: false },
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
            text: 'Count of Enrollment',
            color: 'var(--text-secondary)',
          },
        },
      },
    }),
    []
  );

  const filters = data?.filters;

  return (
    <div className="section-card fade-in" style={{ marginTop: '20px' }}>
      <div
        className="section-header"
        style={{ marginBottom: '12px', flexDirection: 'column', alignItems: 'stretch', gap: '14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div className="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3v18h18" />
              <path d="M7 14l3-3 3 2 5-6" />
            </svg>
            Batch Comparison
          </div>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Total: {(data?.totals.total ?? 0).toLocaleString('en-IN')} enrollments
          </span>
        </div>

        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <FilterSelect
            label="Bifurcation"
            value={bifurcation}
            onChange={setBifurcation}
            options={filters?.bifurcations || []}
            allLabel="All Bifurcations"
          />
          <FilterSelect
            label="Team"
            value={team}
            onChange={setTeam}
            options={filters?.teams || []}
            allLabel="All Teams"
          />
          <FilterSelect
            label="Lead Source"
            value={leadSource}
            onChange={setLeadSource}
            options={filters?.leadSources || []}
            allLabel="All Lead Sources"
          />
          <FilterSelect
            label="Program"
            value={program}
            onChange={setProgram}
            options={filters?.programs || []}
            allLabel="All Programs"
          />
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={labelStyle}>Month</span>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={selectStyle}
            >
              <option value="">All Months</option>
              {(filters?.months || []).map((m) => (
                <option key={m.value} value={String(m.value)}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={labelStyle}>Year</span>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              style={selectStyle}
            >
              <option value="">All Years</option>
              {(filters?.years || []).map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              paddingBottom: '8px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={showTrendline}
              onChange={(e) => setShowTrendline(e.target.checked)}
            />
            Linear trendline
          </label>
        </div>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 12px' }}>
        Count of Enrollment by batch (date of admission). Use month/year and other filters to narrow the set.
      </p>

      <div style={{ height: '360px', marginBottom: '16px', position: 'relative' }}>
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
            Loading batch comparison...
          </div>
        ) : error ? (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#ef4444' }}>
            {error}
          </div>
        ) : (
          <Line data={chartData} options={chartOptions} plugins={[dataLabelsPlugin]} />
        )}
      </div>

      {!loading && !error && data && (
        <div className="mis-table-wrap" style={{ overflowX: 'auto' }}>
          <table className="mis-table mis-table-compact" style={{ minWidth: '700px' }}>
            <thead>
              <tr>
                <th>Metric</th>
                {data.batches.map((b) => (
                  <th key={b.id}>{b.label}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Total</strong></td>
                {data.table.total.map((n, i) => (
                  <td key={`t-${i}`}>{n > 0 ? n.toLocaleString('en-IN') : '-'}</td>
                ))}
                <td><strong>{data.totals.total.toLocaleString('en-IN')}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
