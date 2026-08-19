'use client';

import { useEffect, useState } from 'react';
import {
  STUDENT_STATUS_FILTERS,
  type ConsolidatedFeeMisRow,
  type StudentStatusFilter,
} from '@/lib/consolidated-fee-mis';
import CategoryFilterSelect from './CategoryFilterSelect';
import PaymentSourceFilterSelect from './PaymentSourceFilterSelect';

const formatInCr = (value: number) => {
  if (!value) return '-';
  return `₹ ${(value / 10000000).toFixed(2)} Cr`;
};

const COL_COUNT = 10;

function MetricCells({ row }: { row: ConsolidatedFeeMisRow }) {
  return (
    <>
      <td>{row.currentSemLabel || (row.currentSem > 0 ? row.currentSem : '-')}</td>
      <td>{row.studentCount > 0 ? row.studentCount.toLocaleString('en-IN') : '-'}</td>
      <td>{formatInCr(row.feeStructure)}</td>
      <td>{formatInCr(row.feeCurrentSem)}</td>
      <td>{formatInCr(row.recdTillDate)}</td>
      <td style={{ color: row.pending > 0 ? '#f59e0b' : undefined }}>
        {formatInCr(row.pending)}
      </td>
      <td>{formatInCr(row.grossFee)}</td>
      <td>{formatInCr(row.scholarshipCurrentSem)}</td>
      <td>{formatInCr(row.grossScholarship)}</td>
    </>
  );
}

export default function ConsolidatedFeeMisTable() {
  const [status, setStatus] = useState<StudentStatusFilter>('pursuing-passout');
  const [category, setCategory] = useState('');
  const [paymentSource, setPaymentSource] = useState('');
  const [rows, setRows] = useState<ConsolidatedFeeMisRow[]>([]);
  const [total, setTotal] = useState<ConsolidatedFeeMisRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ status });
        if (category) params.set('category', category);
        if (paymentSource) params.set('paymentSource', paymentSource);
        const res = await fetch(`/api/dashboard/consolidated-fee-mis?${params.toString()}`);
        const result = await res.json();
        if (!res.ok || result.error) {
          setError(result.error || 'Failed to load consolidated MIS');
          setRows([]);
          setTotal(null);
          return;
        }
        setRows(result.rows ?? []);
        setTotal(result.total ?? null);
        setExpanded(new Set());
      } catch (err) {
        console.error('Failed to fetch consolidated fee MIS', err);
        setError('Failed to load consolidated MIS');
        setRows([]);
        setTotal(null);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [status, category, paymentSource]);

  const toggleBatch = (batchId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  return (
    <div className="section-card fade-in" style={{ marginTop: '20px' }}>
      <div className="section-header" style={{ marginBottom: '12px', flexDirection: 'column', alignItems: 'stretch', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div className="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            Consolidated Fee MIS
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <CategoryFilterSelect value={category} onChange={setCategory} />
          <PaymentSourceFilterSelect value={paymentSource} onChange={setPaymentSource} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
              Student Status
            </span>
            <div className="seg-control" style={{ flexWrap: 'wrap' }}>
              {STUDENT_STATUS_FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`seg-btn ${status === option.id ? 'active' : ''}`}
                  onClick={() => setStatus(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 12px' }}>
        Click + on a batch to expand UG / PG · Amounts in Cr · Fee structure from base combination (Batch + Program + Payment option)
      </p>

      <div className="mis-table-wrap" style={{ overflowX: 'auto' }}>
        <table className="mis-table mis-table-compact" style={{ minWidth: '1100px' }}>
          <thead>
            <tr>
              <th>Batch</th>
              <th>Current Sem</th>
              <th>Count of Students</th>
              <th>Fee Structure</th>
              <th>Fee - current sem</th>
              <th>Recd Till Date</th>
              <th>Pending</th>
              <th>Gross fee</th>
              <th>Scholarship - current sem</th>
              <th>Gross Scholarship</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COL_COUNT} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Loading consolidated MIS...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={COL_COUNT} style={{ textAlign: 'center', padding: '2rem', color: '#ef4444' }}>
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No data found for the selected filter.
                </td>
              </tr>
            ) : (
              rows.flatMap((row) => {
                const isOpen = expanded.has(row.batchId);
                const parent = (
                  <tr key={row.batchId}>
                    <td>
                      <button
                        type="button"
                        onClick={() => toggleBatch(row.batchId)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? `Collapse ${row.batch}` : `Expand ${row.batch}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: 'inherit',
                          font: 'inherit',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '18px',
                            height: '18px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-medium)',
                            fontSize: '14px',
                            fontWeight: 700,
                            lineHeight: 1,
                            color: 'var(--accent)',
                            flexShrink: 0,
                          }}
                        >
                          {isOpen ? '−' : '+'}
                        </span>
                        <strong>{row.batch}</strong>
                      </button>
                    </td>
                    <MetricCells row={row} />
                  </tr>
                );

                if (!isOpen || !row.children?.length) return [parent];

                const children = row.children.map((child) => (
                  <tr
                    key={`${row.batchId}-${child.type}`}
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    <td style={{ paddingLeft: '36px', color: 'var(--text-secondary)' }}>
                      {child.type}
                    </td>
                    <MetricCells row={child} />
                  </tr>
                ));

                return [parent, ...children];
              })
            )}
          </tbody>
          {!loading && total && (
            <tfoot>
              <tr>
                <td><strong>{total.batch}</strong></td>
                <td>-</td>
                <td><strong>{total.studentCount.toLocaleString('en-IN')}</strong></td>
                <td><strong>{formatInCr(total.feeStructure)}</strong></td>
                <td><strong>{formatInCr(total.feeCurrentSem)}</strong></td>
                <td><strong>{formatInCr(total.recdTillDate)}</strong></td>
                <td><strong>{formatInCr(total.pending)}</strong></td>
                <td><strong>{formatInCr(total.grossFee)}</strong></td>
                <td><strong>{formatInCr(total.scholarshipCurrentSem)}</strong></td>
                <td><strong>{formatInCr(total.grossScholarship)}</strong></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
