'use client';

import { useEffect, useState } from 'react';
import type { BatchFeeCommissionMisRow } from '@/lib/batch-fee-commission-mis';

type Filters = {
  leadSources: string[];
  batches: { id: number; label: string }[];
};

type ApiPayload = {
  filters: Filters;
  rows: BatchFeeCommissionMisRow[];
  totals: Omit<BatchFeeCommissionMisRow, 'batchId' | 'batch'>;
  error?: string;
};

const formatInCr = (value: number) => {
  if (!value) return '-';
  return `₹ ${(value / 10000000).toFixed(2)} Cr`;
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
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' }}>
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-display)',
        }}
      >
        {label}
      </span>
      <select
        className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ height: '36px', padding: '0 10px', fontSize: '13px' }}
      >
        <option value="">{allLabel}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function BatchFeeCommissionMisTable() {
  const [leadSource, setLeadSource] = useState('');
  const [batch, setBatch] = useState('');
  const [filters, setFilters] = useState<Filters | null>(null);
  const [rows, setRows] = useState<BatchFeeCommissionMisRow[]>([]);
  const [totals, setTotals] = useState<ApiPayload['totals'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (leadSource) params.set('leadSource', leadSource);
        if (batch) params.set('batch', batch);
        const res = await fetch(`/api/dashboard/batch-fee-commission-mis?${params.toString()}`);
        const json = (await res.json()) as ApiPayload;
        if (!res.ok || json.error) {
          setError(json.error || 'Failed to load MIS');
          setRows([]);
          setTotals(null);
          return;
        }
        setFilters(json.filters);
        setRows(json.rows ?? []);
        setTotals(json.totals ?? null);
      } catch (err) {
        console.error(err);
        setError('Failed to load MIS');
        setRows([]);
        setTotals(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leadSource, batch]);

  return (
    <div className="section-card fade-in" style={{ marginTop: '20px' }}>
      <div
        className="section-header"
        style={{ marginBottom: '12px', flexDirection: 'column', alignItems: 'stretch', gap: '14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div className="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            Batch Fee &amp; Commission MIS
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <FilterSelect
            label="Channel partner"
            value={leadSource}
            onChange={setLeadSource}
            options={(filters?.leadSources || []).map((name) => ({ value: name, label: name }))}
            allLabel="All Channel Partners"
          />
          <FilterSelect
            label="Batch"
            value={batch}
            onChange={setBatch}
            options={(filters?.batches || []).map((b) => ({
              value: String(b.id),
              label: b.label,
            }))}
            allLabel="All Batches"
          />
        </div>
      </div>

      <div className="mis-table-wrap" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading MIS...</div>
        ) : error ? (
          <div style={{ padding: '24px', color: '#ef4444' }}>{error}</div>
        ) : (
          <table className="mis-table mis-table-compact" style={{ minWidth: '900px' }}>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Total student</th>
                <th>Total fee</th>
                <th>Total Current fee</th>
                <th>Fee Collected</th>
                <th>Total Comission</th>
                <th>Comission paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.batchId}>
                  <td>
                    <strong>{row.batch}</strong>
                  </td>
                  <td>
                    {row.studentCount > 0 ? row.studentCount.toLocaleString('en-IN') : '-'}
                  </td>
                  <td>{formatInCr(row.totalFee)}</td>
                  <td>{formatInCr(row.totalCurrentFee)}</td>
                  <td>{formatInCr(row.feeCollected)}</td>
                  <td>{formatInCr(row.totalCommissionPayable)}</td>
                  <td>{formatInCr(row.commissionPaid)}</td>
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot>
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td>
                    <strong>
                      {totals.studentCount > 0
                        ? totals.studentCount.toLocaleString('en-IN')
                        : '-'}
                    </strong>
                  </td>
                  <td>
                    <strong>{formatInCr(totals.totalFee)}</strong>
                  </td>
                  <td>
                    <strong>{formatInCr(totals.totalCurrentFee)}</strong>
                  </td>
                  <td>
                    <strong>{formatInCr(totals.feeCollected)}</strong>
                  </td>
                  <td>
                    <strong>{formatInCr(totals.totalCommissionPayable)}</strong>
                  </td>
                  <td>
                    <strong>{formatInCr(totals.commissionPaid)}</strong>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
