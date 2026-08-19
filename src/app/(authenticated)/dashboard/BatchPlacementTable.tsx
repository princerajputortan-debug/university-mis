"use client";

import React, { useEffect, useState } from 'react';

type BatchRow = {
  batch: string;
  Total: number;
  [status: string]: string | number;
};

const placementStatusColors: Record<string, string> = {
  placed: '#10B981',
  'pending to place': '#F59E0B',
  'opt out': '#F43F5E',
  'Not Eligible': '#8B8B9E',
};

const columnLabels: Record<string, string> = {
  'pending to place': 'pending to place',
  placed: 'Placed',
  'Not Eligible': 'Not Eligible',
  'opt out': 'opt out',
};

const formatCount = (val: number) => {
  if (!val) return '-';
  return val.toLocaleString('en-IN');
};

export default function BatchPlacementTable() {
  const [selectedBatch, setSelectedBatch] = useState('');
  const [batches, setBatches] = useState<string[]>([]);
  const [placementColumns, setPlacementColumns] = useState<string[]>([]);
  const [data, setData] = useState<BatchRow[]>([]);
  const [columnTotals, setColumnTotals] = useState<Record<string, number>>({});
  const [totalStudents, setTotalStudents] = useState(0);
  const [placedTotal, setPlacedTotal] = useState(0);
  const [placementRate, setPlacementRate] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedBatch) params.set('batch', selectedBatch);
        const url = `/api/dashboard/batch-placement?${params.toString()}`;
        const res = await fetch(url);
        const result = await res.json();
        if (!res.ok) {
          console.error('Batch placement API error:', result.error);
          setData([]);
          setPlacementColumns([]);
          setBatches([]);
          setColumnTotals({});
          setTotalStudents(0);
          setPlacedTotal(0);
          setPlacementRate(0);
          return;
        }
        setData(result.data || []);
        setPlacementColumns(result.placementColumns || []);
        setBatches(result.batches || []);
        setColumnTotals(result.columnTotals || {});
        setTotalStudents(result.totalStudents || 0);
        setPlacedTotal(result.placedTotal || 0);
        setPlacementRate(result.placementRate || 0);
      } catch (error) {
        console.error('Failed to fetch batch placement data', error);
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
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Batch-wise Placement MIS
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
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10B981',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            Placed: {placedTotal.toLocaleString('en-IN')} / {totalStudents.toLocaleString('en-IN')} ({placementRate}%)
          </div>
        </div>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
        Student count per batch by placement status.
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
              {placementColumns.map((status) => (
                <th key={status}>
                  <span
                    className="source-dot"
                    style={{
                      background: placementStatusColors[status] || '#7C7FF5',
                      marginRight: '6px',
                    }}
                  />
                  {columnLabels[status] || status}
                </th>
              ))}
              <th>Total Students</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={placementColumns.length + 2}
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
                {placementColumns.map((status) => (
                  <td key={`${row.batch}-${status}`}>{formatCount(Number(row[status]) || 0)}</td>
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
                {placementColumns.map((status) => (
                  <td key={`total-${status}`}>{formatCount(columnTotals[status] || 0)}</td>
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
