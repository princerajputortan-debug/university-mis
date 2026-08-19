"use client";

import React, { useState, useEffect } from 'react';

type PivotRow = {
  category: string;
  grandTotal: number;
  [program: string]: any;
};

type UgcStatusCount = {
  status: string;
  count: number;
};

const ugcStatusColors: Record<string, string> = {
  UGC: '#10B981',
  Transfer: '#38BDF8',
  cancelled: '#F43F5E',
  ERP: '#F59E0B',
  Bypass: '#A78BFA',
  Unassigned: '#8B8B9E',
};

export default function BifurcationProgramTable() {
  const [selectedBatch, setSelectedBatch] = useState('');
  const [batches, setBatches] = useState<string[]>([]);
  const [programs, setPrograms] = useState<string[]>([]);
  const [data, setData] = useState<PivotRow[]>([]);
  const [columnTotals, setColumnTotals] = useState<Record<string, number>>({});
  const [ugcStatusCounts, setUgcStatusCounts] = useState<UgcStatusCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        let url = `/api/dashboard/bifurcation-program`;
        if (selectedBatch) {
          url += `?batch=${encodeURIComponent(selectedBatch)}`;
        }
        const res = await fetch(url);
        const result = await res.json();
        if (!res.ok) {
          console.error('Bifurcation program API error:', result.error);
          setData([]);
          setPrograms([]);
          setBatches([]);
          setColumnTotals({});
          setUgcStatusCounts([]);
          return;
        }
        setData(result.data || []);
        setPrograms(result.programs || []);
        setBatches(result.batches || []);
        setColumnTotals(result.columnTotals || {});
        setUgcStatusCounts(result.ugcStatusCounts || []);
      } catch (error) {
        console.error('Failed to fetch bifurcation-program data', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [selectedBatch]);

  const downloadCSV = async () => {
    try {
      let url = `/api/dashboard/bifurcation-program/download`;
      if (selectedBatch) {
        url += `?batch=${encodeURIComponent(selectedBatch)}`;
      }
      const res = await fetch(url);
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Student_Data${selectedBatch ? '_' + selectedBatch : ''}.csv`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <div className="section-card fade-in" style={{ marginTop: '20px' }}>
      <div className="section-header" style={{ marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <div className="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 3h18v18H3z" />
            <path d="M3 9h18" />
            <path d="M3 15h18" />
            <path d="M9 3v18" />
          </svg>
          Bifurcation × Program Enrollment
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-medium)',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              minWidth: '160px',
            }}
          >
            <option value="">All Batches</option>
            {batches.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <button
            onClick={downloadCSV}
            disabled={data.length === 0}
            className="btn-secondary"
            style={{ height: '32px', fontSize: '12px', padding: '0 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download
          </button>
        </div>
      </div>

      {ugcStatusCounts.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '12px',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px' }}>
            UGC Status
          </span>
          {ugcStatusCounts.map(({ status, count }) => (
            <span
              key={status}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 600,
                background: `${ugcStatusColors[status] || '#7C7FF5'}18`,
                color: ugcStatusColors[status] || '#7C7FF5',
                border: `1px solid ${ugcStatusColors[status] || '#7C7FF5'}33`,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: ugcStatusColors[status] || '#7C7FF5',
                }}
              />
              {status}
              <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>
                {count.toLocaleString('en-IN')}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="mis-table-wrap" style={{ minHeight: '120px', position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-card)', opacity: 0.7, zIndex: 1
          }}>
            <div className="trend-badge" style={{ padding: '8px 16px' }}>Loading...</div>
          </div>
        )}

        <table className="mis-table mis-table-compact">
          <thead>
            <tr>
              <th>Category</th>
              {programs.map(prog => (
                <th key={prog}>{prog}</th>
              ))}
              <th style={{ background: 'var(--accent-dim)', fontWeight: 700 }}>Grand Total</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && !loading && (
              <tr>
                <td colSpan={programs.length + 2} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No enrollment data found{selectedBatch ? ` for batch "${selectedBatch}"` : ''}.
                </td>
              </tr>
            )}
            {data.map(row => (
              <tr key={row.category}>
                <td><strong>{row.category}</strong></td>
                {programs.map(prog => (
                  <td key={`${row.category}-${prog}`}>
                    {row[prog] > 0
                      ? row[prog].toLocaleString('en-IN')
                      : <span style={{ color: 'var(--border-medium)' }}></span>
                    }
                  </td>
                ))}
                <td><strong>{row.grandTotal > 0 ? row.grandTotal.toLocaleString('en-IN') : '-'}</strong></td>
              </tr>
            ))}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr>
                <td><strong>Grand Total</strong></td>
                {programs.map(prog => (
                  <td key={`total-${prog}`}>
                    <strong>{(columnTotals[prog] || 0) > 0 ? (columnTotals[prog] || 0).toLocaleString('en-IN') : '-'}</strong>
                  </td>
                ))}
                <td>
                  <strong>{(columnTotals.grandTotal || 0) > 0 ? (columnTotals.grandTotal || 0).toLocaleString('en-IN') : '-'}</strong>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
