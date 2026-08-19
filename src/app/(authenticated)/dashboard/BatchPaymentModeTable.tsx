"use client";

import React, { useEffect, useState } from 'react';

type BatchRow = {
  batch: string;
  Total: number;
  [source: string]: string | number;
};

const sourceColors: Record<string, string> = {
  Razorpay: '#7C7FF5',
  Jodo: '#38BDF8',
  Early: '#F59E0B',
  Propelld: '#A78BFA',
  Unassigned: '#8B8B9E',
};

const formatCount = (val: number) => {
  if (!val) return '-';
  return val.toLocaleString('en-IN');
};

export default function BatchPaymentModeTable() {
  const [selectedBatch, setSelectedBatch] = useState('');
  const [batches, setBatches] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [data, setData] = useState<BatchRow[]>([]);
  const [columnTotals, setColumnTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        let url = '/api/dashboard/batch-payment-mode';
        if (selectedBatch) {
          url += `?batch=${encodeURIComponent(selectedBatch)}`;
        }
        const res = await fetch(url);
        const result = await res.json();
        if (!res.ok) {
          console.error('Batch payment mode API error:', result.error);
          setData([]);
          setSources([]);
          setBatches([]);
          setColumnTotals({});
          return;
        }
        setData(result.data || []);
        setSources(result.sources || []);
        setBatches(result.batches || []);
        setColumnTotals(result.columnTotals || {});
      } catch (error) {
        console.error('Failed to fetch batch payment mode data', error);
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
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M7 8h10" />
            <path d="M7 12h6" />
            <path d="M7 16h8" />
          </svg>
          Batch-wise Payment Mode (Students)
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
        </div>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
        Student count per batch by primary payment gateway (Razorpay, Jodo, Early, Propelld).
        Unassigned = no payment recorded in these gateways.
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
              {sources.map((source) => (
                <th key={source}>
                  <span
                    className="source-dot"
                    style={{
                      background: sourceColors[source] || '#7C7FF5',
                      marginRight: '6px',
                    }}
                  />
                  {source}
                </th>
              ))}
              <th>Total Students</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={sources.length + 2}
                  style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}
                >
                  No student data found for the selected batch.
                </td>
              </tr>
            )}
            {data.map((row) => (
              <tr key={row.batch}>
                <td>
                  <strong>{row.batch}</strong>
                </td>
                {sources.map((source) => (
                  <td key={`${row.batch}-${source}`}>{formatCount(Number(row[source]) || 0)}</td>
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
                {sources.map((source) => (
                  <td key={`total-${source}`}>{formatCount(columnTotals[source] || 0)}</td>
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
