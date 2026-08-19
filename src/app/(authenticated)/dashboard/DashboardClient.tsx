'use client';
import { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import CountUp from 'react-countup';
import {
  buildFyMatrixFromCalendar,
  FY_MONTH_LABELS,
  getTodayLocal,
  isFutureFyMonth,
} from '@/lib/mis-dates';
import ConsolidatedFeeMisTable from './ConsolidatedFeeMisTable';
import BatchFeeCommissionMisTable from './BatchFeeCommissionMisTable';
import BatchCollectionTable from './BatchCollectionTable';
import BifurcationProgramTable from './BifurcationProgramTable';
import AdmissionCountTable from './AdmissionCountTable';
import BatchComparisonChart from './BatchComparisonChart';
import BatchNormalizedComparisonChart from './BatchNormalizedComparisonChart';
import CategoryFilterSelect from './CategoryFilterSelect';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Filler
);
ChartJS.defaults.font.family = "'DM Sans', sans-serif";
ChartJS.defaults.color = '#3E3E52';
// Legend is registered globally (by the trend chart). Keep it off by default so
// mini KPI charts without dataset labels don't render an "undefined" legend item.
ChartJS.defaults.plugins.legend.display = false;

interface DashboardClientProps {
  data: {
    totalForms: number;
    totalPayments: number;
    totalRevenue: number;
    pendingReco: number;
    admToday: number;
    admMTD: number;
    admYTD: number;
    collToday: number;
    collMTD: number;
    collYTD: number;
    years: number[];
    fyStartYears: number[];
    admYearResults: number[];
    collYearResults: number[];
    paymentSourceMis: {
      sourceName: string;
      today: number;
      mtd: number;
      ytd: number;
      byYear: Record<number, number>;
    }[];
    admissionMonthlyMatrix: {
      year: number;
      months: number[];
      total: number;
    }[];
    collectionMonthlyMatrix: {
      year: number;
      months: number[];
      total: number;
    }[];
    programBreakdown: {
      name: string;
      count: number;
      pct: number;
    }[];
  };
}

type TimeFrame = 'TODAY' | 'MTD' | 'YTD' | 'YEARLY' | 'ALL-TIME';

export default function DashboardClient({ data }: DashboardClientProps) {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('ALL-TIME');
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [category, setCategory] = useState('');
  const [paymentSourceMis, setPaymentSourceMis] = useState(data.paymentSourceMis);
  const [paymentSourceLoading, setPaymentSourceLoading] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      document.querySelectorAll('.prog-fill, .stacked-fill, .source-bar-fill').forEach(el => {
        const htmlEl = el as HTMLElement;
        const w = htmlEl.getAttribute('data-w');
        if (w) htmlEl.style.width = w + '%';
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [timeFrame, selectedYear]);

  useEffect(() => {
    async function fetchPaymentSourceMis() {
      setPaymentSourceLoading(true);
      try {
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        const res = await fetch(`/api/dashboard/payment-source-mis?${params.toString()}`);
        const result = await res.json();
        if (res.ok && result.paymentSourceMis) {
          setPaymentSourceMis(result.paymentSourceMis);
        }
      } catch (error) {
        console.error('Failed to fetch payment source MIS', error);
      } finally {
        setPaymentSourceLoading(false);
      }
    }
    fetchPaymentSourceMis();
  }, [category]);

  // Re-run fill animation when dynamic data (e.g. programBreakdown) renders
  useEffect(() => {
    const timer = setTimeout(() => {
      document.querySelectorAll('.prog-fill').forEach(el => {
        const htmlEl = el as HTMLElement;
        const w = htmlEl.getAttribute('data-w');
        if (w) htmlEl.style.width = w + '%';
      });
    }, 500);
    return () => clearTimeout(timer);
   
  }, [data.programBreakdown]);

  const CURRENT_YEAR = useMemo(() => new Date().getFullYear(), []);

  const getYearIdx = () => data.years.indexOf(selectedYear);

  const getActiveData = () => {
    const idx = getYearIdx();
    const isCurrentYear = selectedYear === CURRENT_YEAR;

    const yearAdm  = idx >= 0 ? (data.admYearResults[idx]  || 0) : 0;
    const yearColl = idx >= 0 ? (data.collYearResults[idx] || 0) : 0;

    switch (timeFrame) {
      case 'TODAY':
        return {
          adm:   isCurrentYear ? (data.admToday  || 0) : Math.round(yearAdm  / 365),
          coll:  isCurrentYear ? (data.collToday || 0) : Math.round(yearColl / 365),
          delta: '+2.1%',
          label: `today · ${selectedYear}`
        };
      case 'MTD':
        return {
          adm:   isCurrentYear ? (data.admMTD  || 0) : Math.round(yearAdm  / 12),
          coll:  isCurrentYear ? (data.collMTD || 0) : Math.round(yearColl / 12),
          delta: '+12.5%',
          label: `month to date · ${selectedYear}`
        };
      case 'YTD':
        return {
          adm:   isCurrentYear ? (data.admYTD  || 0) : yearAdm,
          coll:  isCurrentYear ? (data.collYTD || 0) : yearColl,
          delta: '+4.2%',
          label: `year to date · ${selectedYear}`
        };
      case 'YEARLY':
        return {
          adm:   yearAdm,
          coll:  yearColl,
          delta: '+8.9%',
          label: `full year · ${selectedYear}`
        };
      case 'ALL-TIME':
      default:
        return { 
          adm: data.totalForms, 
          coll: data.totalRevenue, 
          delta: '-', 
          label: 'all time' 
        };
    }
  };

  const activeData = getActiveData();
  const sourceColors: Record<string, string> = {
    Razorpay: '#7C7FF5',
    Jodo: '#38BDF8',
    Early: '#F59E0B',
    Offline: '#8B8B9E',
    Bank: '#A78BFA',
    Propelld: '#10B981',
    'Corp Inst': '#F43F5E',
    Misc: '#64748B',
  };

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 10000000) return `₹ ${(value / 10000000).toFixed(2)}Cr`;
    if (Math.abs(value) >= 100000) return `₹ ${(value / 100000).toFixed(2)}L`;
    return `₹ ${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const paymentSourceTotals = useMemo(() => ({
    today: paymentSourceMis.reduce((sum, row) => sum + row.today, 0),
    mtd: paymentSourceMis.reduce((sum, row) => sum + row.mtd, 0),
    ytd: paymentSourceMis.reduce((sum, row) => sum + row.ytd, 0),
    byYear: Object.fromEntries(
      data.years.map(year => [
        year,
        paymentSourceMis.reduce((sum, row) => sum + (row.byYear[year] || 0), 0),
      ])
    ) as Record<number, number>,
  }), [paymentSourceMis, data.years]);

  // Financial Year (Apr-Mar) remapping
  const today = useMemo(() => getTodayLocal(), []);
  const fyYears = data.fyStartYears?.length ? data.fyStartYears : data.years;

  const fyCollectionMatrix = useMemo(
    () => buildFyMatrixFromCalendar(data.collectionMonthlyMatrix, fyYears, today),
    [data.collectionMonthlyMatrix, fyYears, today]
  );

  const fyCollectionTotals = useMemo(() => {
    const months = FY_MONTH_LABELS.map((_, idx) =>
      fyCollectionMatrix.reduce((sum, row) => sum + (row.months[idx] || 0), 0)
    );
    return {
      months,
      total: months.reduce((sum, v) => sum + v, 0),
    };
  }, [fyCollectionMatrix]);

  const paymentSourceLabelPlugin = {
    id: 'paymentSourceValueLabels',
    afterDatasetsDraw(chart: {
      getDatasetMeta: (i: number) => { data: Array<{ x: number; y: number }> };
      data: { datasets: Array<{ data?: unknown[] }> };
      ctx: CanvasRenderingContext2D;
    }) {
      const dataset = chart.getDatasetMeta(0);
      const values = chart.data.datasets[0]?.data || [];
      const { ctx } = chart;
      ctx.save();
      ctx.font = "600 10px 'DM Sans', sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#4B5268';
      dataset.data.forEach((bar: any, idx: number) => {
        const value = Number(values[idx] || 0);
        if (!value) return;
        ctx.fillText(formatCurrency(value), bar.x, bar.y - 6);
      });
      ctx.restore();
    },
  };

  const chartOpts = (type: 'bar' | 'line' | 'doughnut'): Record<string, unknown> => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: type !== 'doughnut' } },
    scales: type !== 'doughnut' ? { x: { display: false }, y: { display: false } } : undefined,
    animation: { duration: 1200, easing: 'easeOutQuart' }
  });

  const revChartRef = useRef<ChartJS<'line'> | null>(null);
  const perfChartRef = useRef<ChartJS<'line'> | null>(null);

  // Render a lightweight skeleton until client hydrates
  if (!mounted) {
    return (
      <div suppressHydrationWarning>
        <div className="stat-grid">
          {[1,2,3].map(i => <div key={i} className="stat-card" style={{ minHeight: 160 }}><div className="skeleton" style={{ height: 32, width: '60%', marginBottom: 12 }} /><div className="skeleton" style={{ height: 52 }} /></div>)}
        </div>
        <div className="section-card"><div className="skeleton" style={{ height: 200 }} /></div>
      </div>
    );
  }

  return (
    <>
      {/* STAT CARDS */}
      <div className="stat-grid">
        {/* Card 1: Total Admissions */}
        <div className="stat-card fade-in">
          <div className="stat-card-top">
            <span className="stat-label">Total Admissions</span>
            <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#7C7FF5" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
          </div>
          <div className="stat-metric-row">
            <span className="stat-metric">
              <CountUp end={data.totalForms} duration={1.2} separator="," />
            </span>
            <span className="trend-badge trend-up">↑ 12% vs last month</span>
          </div>
          <div className="stat-chart">
            <Bar 
              data={{
                labels: ['Jan','Feb','Mar','Apr','May','Jun'],
                datasets: [{
                  data: [1850, 2100, 1920, 2400, 2250, 2800],
                  backgroundColor: (ctx: any) => ctx.dataIndex === 5 ? 'rgba(124,127,245,1)' : 'rgba(124,127,245,0.35)',
                  borderRadius: 4,
                  borderSkipped: false
                }]
              }}
              options={{ ...chartOpts('bar'), plugins: { tooltip: { enabled: false } } }}
            />
          </div>
        </div>

        {/* Card 2: Total Revenue */}
        <div className="stat-card fade-in">
          <div className="stat-card-top">
            <span className="stat-label">Total Revenue</span>
            <div className="stat-icon" style={{ background: 'var(--success-dim)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9.5h4.5a2 2 0 0 1 0 4h-3a2 2 0 0 0 0 4H15"/></svg>
            </div>
          </div>
          <div className="stat-metric-row">
            <span className="stat-metric" style={{ fontSize: '28px' }}>
              ₹ <CountUp end={data.totalRevenue / 10000000} decimals={2} duration={1.2} />Cr
            </span>
            <span className="trend-badge trend-up">↑ 8.4% vs last month</span>
          </div>
          <div className="stat-chart">
            <Line
              ref={revChartRef}
              data={{
                labels: ['Jan','Feb','Mar','Apr','May','Jun'],
                datasets: [{
                  data: [320, 410, 380, 520, 490, 610],
                  borderColor: '#10B981',
                  borderWidth: 2,
                  fill: true,
                  backgroundColor: (context: any) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 52);
                    gradient.addColorStop(0, 'rgba(16,185,129,0.3)');
                    gradient.addColorStop(1, 'rgba(16,185,129,0)');
                    return gradient;
                  },
                  tension: 0.4,
                  pointRadius: 0
                }]
              }}
              options={{ ...chartOpts('line'), plugins: { tooltip: { enabled: false } } }}
            />
          </div>
        </div>

        {/* Card 3: Payment Records */}
        <div className="stat-card fade-in">
          <div className="stat-card-top">
            <span className="stat-label">Payment Records</span>
            <div className="stat-icon" style={{ background: 'var(--warning-dim)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
          </div>
          <div className="stat-card-3-inner">
            <div className="stat-card-3-text">
              <div className="stat-metric-row">
                <span className="stat-metric">
                  <CountUp end={data.totalPayments} duration={1.2} separator="," />
                </span>
              </div>
              <div style={{ marginTop: '8px' }}>
                <span className="trend-badge trend-warn" style={{ fontSize: '12px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  {data.pendingReco} pending reconciliation
                </span>
              </div>
            </div>
            <div className="donut-wrapper">
              <Doughnut
                data={{
                  datasets: [{
                    data: [Math.max(0, data.totalPayments - data.pendingReco), data.pendingReco],
                    backgroundColor: ['#10B981', '#F59E0B'],
                    borderWidth: 0,
                    hoverOffset: 2
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '72%',
                  plugins: { tooltip: { enabled: false } },
                  animation: { duration: 1200, easing: 'easeOutQuart' }
                }}
              />
              <div className="donut-center">
                <span className="donut-pct">
                  {data.totalPayments > 0 
                    ? ((data.totalPayments - data.pendingReco) / data.totalPayments * 100).toFixed(1) 
                    : '100'}%
                </span>
                <span className="donut-sub">clear</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PERFORMANCE OVERVIEW */}
      <div className="section-card fade-in">
        <div className="section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div className="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Performance Overview
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Year slicer — always visible */}
            <div className="seg-control">
              {[2022, 2023, 2024, 2025, 2026].map(yr => (
                <button
                  key={yr}
                  onClick={() => setSelectedYear(yr)}
                  className={`seg-btn ${selectedYear === yr ? 'active' : ''}`}
                >
                  {yr}
                </button>
              ))}
            </div>
            {/* Time-frame slicer */}
            <div className="seg-control">
              {(['TODAY', 'MTD', 'YTD', 'YEARLY', 'ALL-TIME'] as TimeFrame[]).map(tf => (
                <button
                  key={tf}
                  className={`seg-btn ${timeFrame === tf ? 'active' : ''}`}
                  onClick={() => setTimeFrame(tf)}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

        </div>

        <div className="perf-grid">
          {/* Left: Admissions breakdown */}
          <div>
            <div className="perf-label">New enrollments, {activeData.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '4px' }}>
              <div className="perf-metric">
                <CountUp end={activeData.adm} duration={1.2} separator="," />
              </div>
              <span className="trend-badge trend-up">↑ {activeData.delta}</span>
            </div>
            <div className="breakdown-section">
              <div className="breakdown-label">Breakdown by program</div>
              
              {(() => {
                const progColors = ['#7C7FF5', '#10B981', '#38BDF8', '#F59E0B', '#A78BFA', '#F43F5E', '#8B8B9E', '#06B6D4', '#EC4899', '#84CC16'];
                // Show top 5 individually, group rest as "Others"
                const top5 = data.programBreakdown.slice(0, 5);
                const rest = data.programBreakdown.slice(5);
                const othersPct = rest.reduce((s, r) => s + r.pct, 0);
                const othersCount = rest.reduce((s, r) => s + r.count, 0);
                const items = [...top5];
                if (rest.length > 0) {
                  items.push({ name: 'Others', count: othersCount, pct: othersPct });
                }
                return items.map((prog, idx) => (
                  <div className="prog-row" key={`${prog.name}-${idx}`}>
                    <div className="prog-row-top">
                      <span className="prog-name">{prog.name}</span>
                      <span className="prog-pct">{prog.pct}%</span>
                    </div>
                    <div className="prog-track">
                      <div className="prog-fill" data-w={String(prog.pct)} style={{ background: progColors[idx % progColors.length], width: '0%' }}></div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Right: Year-on-Year Admissions Trend */}
          <div>
            <div className="perf-label">Year-on-Year Admissions Trend</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '4px' }}>
              <div className="perf-metric" style={{ fontSize: '34px' }}>
                <CountUp end={data.totalForms} duration={1.2} separator="," />
              </div>
              <span className="trend-badge trend-up">↑ Total Admissions</span>
            </div>
            <div style={{ position: 'relative', height: '180px', marginTop: '16px' }}>
              <Line
                ref={perfChartRef}
                data={{
                  labels: data.years.length > 0
                    ? data.years.map(String)
                    : ['2022', '2023', '2024', '2025', '2026'],
                  datasets: [{
                    label: 'Admissions',
                    data: data.admYearResults.length > 0
                      ? data.admYearResults
                      : [0, 0, 0, 0, 0],
                    borderColor: '#7C7FF5',
                    borderWidth: 2.5,
                    fill: true,
                    backgroundColor: (context: any) => {
                      const ctx = context.chart.ctx;
                      const gradient = ctx.createLinearGradient(0, 0, 0, 180);
                      gradient.addColorStop(0, 'rgba(124,127,245,0.25)');
                      gradient.addColorStop(1, 'rgba(124,127,245,0)');
                      return gradient;
                    },
                    tension: 0.35,
                    pointRadius: 5,
                    pointBackgroundColor: '#7C7FF5',
                    pointBorderColor: 'var(--bg-surface)',
                    pointBorderWidth: 2,
                    pointHoverRadius: 7,
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: { duration: 1200, easing: 'easeOutQuart' },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      enabled: true,
                      backgroundColor: '#13131C',
                      borderColor: '#2A2A3E',
                      borderWidth: 1,
                      titleColor: '#7A7A8E',
                      bodyColor: '#EEEEF2',
                      padding: 10,
                      callbacks: {
                        title: (items: any) => `Year ${items[0].label}`,
                        label: (ctx: any) => ` ${ctx.raw.toLocaleString()} admissions`
                      }
                    },
                  },
                  scales: {
                    x: {
                      display: true,
                      grid: { display: false },
                      border: { display: false },
                      ticks: {
                        color: '#7A7A8E',
                        font: { size: 11, family: "'DM Sans', sans-serif" },
                        padding: 6,
                      }
                    },
                    y: {
                      display: false,
                      grid: { display: false },
                    }
                  },
                  layout: { padding: { top: 28 } }
                }}
                plugins={[{
                  id: 'yoyDataLabels',
                  afterDatasetsDraw(chart: any) {
                    const { ctx, data: chartData } = chart;
                    const dataset = chart.getDatasetMeta(0);
                    if (!dataset?.data?.length) return;
                    ctx.save();
                    dataset.data.forEach((point: any, i: number) => {
                      const val = chartData.datasets[0].data[i];
                      if (val == null || val === 0) return;
                      const label = val.toLocaleString();

                      // Read current theme to pick correct text color
                      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
                      const textColor  = isLight ? '#1A1A30' : '#EEEEF2';
                      const pillColor  = isLight ? 'rgba(91,95,232,0.12)' : 'rgba(124,127,245,0.22)';
                      const pillBorder = isLight ? 'rgba(91,95,232,0.30)' : 'rgba(124,127,245,0.40)';

                      ctx.font = "600 11px 'DM Sans', sans-serif";
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';

                      // Measure text
                      const tw = ctx.measureText(label).width + 16;
                      const th = 20;
                      const tx = point.x - tw / 2;
                      const ty = point.y - 16 - th;

                      // Draw pill background
                      ctx.fillStyle = pillColor;
                      ctx.beginPath();
                      ctx.roundRect(tx, ty, tw, th, 5);
                      ctx.fill();

                      // Draw pill border
                      ctx.strokeStyle = pillBorder;
                      ctx.lineWidth = 1;
                      ctx.beginPath();
                      ctx.roundRect(tx, ty, tw, th, 5);
                      ctx.stroke();

                      // Draw label text
                      ctx.fillStyle = textColor;
                      ctx.fillText(label, point.x, ty + th / 2);
                    });
                    ctx.restore();
                  }
                }]}
              />
            </div>
          </div>
        </div>

      </div>



      {/* MIS: PAYMENT SOURCE WISE COLLECTION */}
      <div className="section-card fade-in" style={{ marginTop: '20px' }}>
        <div className="section-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div className="section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><path d="M7 15h.01M11 15h2"/></svg>
              Payment Source Wise Collection
            </div>
            <span className="trend-badge trend-up">Today · MTD · YTD · Year Comparison</span>
          </div>
          <CategoryFilterSelect value={category} onChange={setCategory} />
        </div>

        {paymentSourceLoading && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 12px' }}>
            Updating payment source data...
          </p>
        )}

        <div className="mis-grid">
          <div className="mis-chart">
            <Bar
              data={{
                labels: paymentSourceMis.map(row => row.sourceName),
                datasets: [{
                  label: timeFrame,
                  data: paymentSourceMis.map(row => {
                    switch (timeFrame) {
                      case 'TODAY': return row.today;
                      case 'MTD': return row.mtd;
                      case 'YTD': return row.ytd;
                      case 'YEARLY': return row.byYear[selectedYear] || 0;
                      case 'ALL-TIME':
                      default: return Object.values(row.byYear).reduce((a, b) => a + b, 0);
                    }
                  }),
                  backgroundColor: paymentSourceMis.map(row => `${sourceColors[row.sourceName] || '#7C7FF5'}CC`),
                  borderRadius: 5,
                  borderSkipped: false,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 22 } },
                plugins: {
                  legend: { display: false },
                  tooltip: { callbacks: { label: (ctx: any) => ` ${formatCurrency(ctx.raw)}` } },
                },
                scales: {
                  x: { grid: { display: false }, ticks: { color: '#7A7A8E', font: { size: 11 } } },
                  y: { display: false, grid: { display: false } },
                },
              }}
              plugins={[paymentSourceLabelPlugin]}
            />
          </div>

          <div className="mis-table-wrap">
            <table className="mis-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Today</th>
                  <th>MTD</th>
                  <th>YTD</th>
                  {data.years.map(year => <th key={year}>{year}</th>)}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {paymentSourceMis.map(row => (
                  <tr key={row.sourceName}>
                    <td>
                      <span className="source-dot" style={{ background: sourceColors[row.sourceName] || '#7C7FF5' }}></span>
                      {row.sourceName}
                    </td>
                    <td>{formatCurrency(row.today)}</td>
                    <td>{formatCurrency(row.mtd)}</td>
                    <td>{formatCurrency(row.ytd)}</td>
                    {data.years.map(year => <td key={year}>{formatCurrency(row.byYear[year] || 0)}</td>)}
                    <td>{formatCurrency(Object.values(row.byYear).reduce((a, b) => a + b, 0))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{formatCurrency(paymentSourceTotals.today)}</td>
                  <td>{formatCurrency(paymentSourceTotals.mtd)}</td>
                  <td>{formatCurrency(paymentSourceTotals.ytd)}</td>
                  {data.years.map(year => (
                    <td key={year}>{formatCurrency(paymentSourceTotals.byYear[year] || 0)}</td>
                  ))}
                  <td>{formatCurrency(data.years.reduce((sum, year) => sum + (paymentSourceTotals.byYear[year] || 0), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>



      <AdmissionCountTable />
      <BatchComparisonChart />
      <BatchNormalizedComparisonChart />

      {/* MIS: COLLECTION COUNT (Financial Year: Apr-Mar) */}
      <div className="section-card fade-in" style={{ marginTop: '20px' }}>
        <div className="section-header" style={{ marginBottom: '12px' }}>
          <div className="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9.5h4.5a2 2 0 0 1 0 4h-3a2 2 0 0 0 0 4H15"/></svg>
            Collection Count
          </div>
          <span className="trend-badge trend-up">Financial Year (Apr–Mar)</span>
        </div>
        
        <div className="mis-table-wrap">
          <table className="mis-table mis-table-compact">
            <thead>
              <tr>
                <th>FY</th>
                {FY_MONTH_LABELS.map(month => <th key={`coll-${month}`}>{month}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {fyCollectionMatrix.map(row => (
                <tr key={row.label}>
                  <td><strong>{row.label}</strong></td>
                  {row.months.map((amount, idx) => (
                    <td key={`${row.label}-c-${idx}`}>
                      {isFutureFyMonth(row.startYear, idx, today)
                        ? <span style={{ color: 'var(--border-medium)' }}>-</span>
                        : amount > 0
                          ? formatCurrency(amount)
                          : <span style={{ color: 'var(--border-medium)' }}>-</span>}
                    </td>
                  ))}
                  <td><strong>{row.total > 0 ? formatCurrency(row.total) : '-'}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                {fyCollectionTotals.months.map((amount, idx) => (
                  <td key={`coll-total-${idx}`}>{amount > 0 ? formatCurrency(amount) : '-'}</td>
                ))}
                <td>{formatCurrency(fyCollectionTotals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <BatchFeeCommissionMisTable />
      <ConsolidatedFeeMisTable />
      <BatchCollectionTable />
      <BifurcationProgramTable />

      {/* RECENT ACTIVITY */}
      <div className="section-card fade-in" style={{ display: 'none' }}>
        <div className="section-header">
          <div className="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Recent Transactions
          </div>
          <button className="btn-secondary" style={{ height: '30px', fontSize: '12px', padding: '0 12px' }}>View all</button>
        </div>
        <div>
          {[
            { enroll:'UGO-2024-3821', prog:'BBA', source:'Razorpay', color:'#7C7FF5', amount:'₹ 45,000', time:'2m ago' },
            { enroll:'PGO-2024-1203', prog:'MBA', source:'Propelled', color:'#10B981', amount:'₹ 1,20,000', time:'8m ago' },
            { enroll:'UGO-2024-3820', prog:'MCA', source:'Jodo', color:'#38BDF8', amount:'₹ 32,500', time:'15m ago' },
            { enroll:'UGO-2024-3819', prog:'BBA', source:'Bank Direct', color:'#8B8B9E', amount:'₹ 60,000', time:'22m ago' },
            { enroll:'PGO-2024-1202', prog:'MAJMC', source:'Early Salary', color:'#F59E0B', amount:'₹ 85,000', time:'34m ago' },
            { enroll:'UGO-2024-3818', prog:'BCA', source:'Razorpay', color:'#7C7FF5', amount:'₹ 28,000', time:'41m ago' },
            { enroll:'PGO-2024-1201', prog:'MBA', source:'Corporate', color:'#F43F5E', amount:'₹ 2,10,000', time:'1h ago' },
            { enroll:'UGO-2024-3817', prog:'BBA', source:'International', color:'#A78BFA', amount:'₹ 95,000', time:'1h ago' },
          ].map(t => (
            <div key={t.enroll} className="activity-row">
              <div className="activity-dot" style={{ background: t.color }}></div>
              <div className="activity-enroll">{t.enroll}</div>
              <div className="activity-prog">{t.prog} &nbsp;<span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{t.source}</span></div>
              <div className="activity-amount">{t.amount}</div>
              <div className="activity-time">{t.time}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
