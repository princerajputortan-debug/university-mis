"use client";

import React, { useEffect, useState } from 'react';

type BatchRow = {
  batch: string;
  Total: number;
  [bifurcation: string]: string | number;
};

const bifurcationColors: Record<string, string> = {
  'Channel Partner': '#7C7FF5',
  Referral: '#38BDF8',
  Insides: '#10B981',
  HP: '#F59E0B',
  DS: '#A78BFA',
  Corporate: '#059669',
  International: '#EC4899',
  App: '#6366F1',
  'batch 1': '#8B8B9E',
  'Batch 2': '#6B7280',
  'Not Found': '#F43F5E',
  Unassigned: '#9CA3AF',
};

const formatCount = (val: number) => {
  if (!val) return '-';
  return val.toLocaleString('en-IN');
};

export default function BifurcationBatchTable() {
  const [selectedBatch, setSelectedBatch] = useState('');
  const [batches, setBatches] = useState<string[]>([]);
  const [bifurcationColumns, setBifurcationColumns] = useState<string[]>([]);
  const [data, setData] = useState<BatchRow[]>([]);
  const [columnTotals, setColumnTotals] = useState<Record<string, number>>({});
  const [totalStudents, setTotalStudents] = useState(0);
  const [channelPartnerTotal, setChannelPartnerTotal] = useState(0);
  const [channelPartnerShare, setChannelPartnerShare] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedBatch) params.set('batch', selectedBatch);
        const url = `/api/dashboard/bifurcation-batch?${params.toString()}`;
        const res = await fetch(url);
        const result = await res.json();
        if (!res.ok) {
          console.error('Bifurcation batch API error:', result.error);
          setData([]);
          setBifurcationColumns([]);
          setBatches([]);
          setColumnTotals({});
          setTotalStudents(0);
          setChannelPartnerTotal(0);
          setChannelPartnerShare(0);
          return;
        }
        setData(result.data || []);
        setBifurcationColumns(result.bifurcationColumns || []);
        setBatches(result.batches || []);
        setColumnTotals(result.columnTotals || {});
        setTotalStudents(result.totalStudents || 0);
        setChannelPartnerTotal(result.channelPartnerTotal || 0);
        setChannelPartnerShare(result.channelPartnerShare || 0);
      } catch (error) {
        console.error('Failed to fetch bifurcation batch data', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [selectedBatch]);

  return (
    <div className="section-card fade-in" style={{ marginTop: '20px' }}>
      <div className="section-header" style={{ marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <div className="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Bifurcation Channel Partners (Batch-wise)
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="select-input"
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-medium)',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '12px',
              outline: 'none',
              minWidth: '140px',
            }}
          >
            <option value="">All Batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <div
            className="trend-badge"
            style={{
              background: 'rgba(124, 127, 245, 0.12)',
              color: '#7C7FF5',
              border: '1px solid rgba(124, 127, 245, 0.25)',
            }}
          >
            Channel Partner: {channelPartnerTotal.toLocaleString('en-IN')} / {totalStudents.toLocaleString('en-IN')} ({channelPartnerShare}%)
          </div>
        </div>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
        Student count per batch by bifurcation channel (Channel Partner, Referral, Insides, HP, etc.).
      </p>

      <div className="mis-table-wrap" style={{ minHeight: '120px', position: 'relative' }}>
        {loading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-card)',
              opacity: 0.7,
              zIndex: 1,
            }}
          >
            <div className="trend-badge" style={{ padding: '8px 16px' }}>
              Loading...
            </div>
          </div>
        )}

        <table className="mis-table mis-table-compact">
          <thead>
            <tr>
              <th>Batch</th>
              {bifurcationColumns.map((category) => (
                <th
                  key={category}
                  style={
                    category === 'Channel Partner'
                      ? { background: 'rgba(124, 127, 245, 0.08)' }
                      : undefined
                  }
                >
                  <span
                    className="source-dot"
                    style={{
                      background: bifurcationColors[category] || '#7C7FF5',
                      marginRight: '6px',
                    }}
                  />
                  {category}
                </th>
              ))}
              <th>Total Students</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={bifurcationColumns.length + 2}
                  style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}
                >
                  No bifurcation data found for the selected batch.
                </td>
              </tr>
            )}
            {data.map((row) => (
              <tr key={row.batch}>
                <td>
                  <strong>{row.batch}</strong>
                </td>
                {bifurcationColumns.map((category) => (
                  <td
                    key={`${row.batch}-${category}`}
                    style={
                      category === 'Channel Partner'
                        ? { background: 'rgba(124, 127, 245, 0.04)' }
                        : undefined
                    }
                  >
                    {formatCount(Number(row[category]) || 0)}
                  </td>
                ))}
                <td>
                  <strong>{formatCount(Number(row.Total) || 0)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr>
                <td>Total</td>
                {bifurcationColumns.map((category) => (
                  <td
                    key={`total-${category}`}
                    style={
                      category === 'Channel Partner'
                        ? { background: 'rgba(124, 127, 245, 0.08)' }
                        : undefined
                    }
                  >
                    {formatCount(columnTotals[category] || 0)}
                  </td>
                ))}
                <td>{formatCount(columnTotals.Total || 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
