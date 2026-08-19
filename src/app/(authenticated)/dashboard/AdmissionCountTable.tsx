"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  buildFyMatrixFromCalendar,
  FY_MONTH_LABELS,
  getTodayLocal,
  isFutureFyMonth,
} from '@/lib/mis-dates';

type MatrixRow = {
  year: number;
  months: number[];
  total: number;
};

export default function AdmissionCountTable() {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        let url = `/api/dashboard/admission-count`;
        if (selectedStatus) {
          url += `?status=${encodeURIComponent(selectedStatus)}`;
        }
        const res = await fetch(url);
        const result = await res.json();
        if (!res.ok) {
          console.error('Admission count API error:', result.error);
          setMatrix([]);
          setStatuses([]);
          setYears([]);
          return;
        }
        setMatrix(result.matrix || []);
        setStatuses(result.statuses || []);
        setYears(result.years || []);
      } catch (error) {
        console.error('Failed to fetch admission count', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [selectedStatus]);

  const today = useMemo(() => getTodayLocal(), []);

  const fyMatrix = useMemo(
    () => buildFyMatrixFromCalendar(matrix, years, today),
    [matrix, years, today]
  );

  const fyTotals = useMemo(() => {
    const months = FY_MONTH_LABELS.map((_, idx) =>
      fyMatrix.reduce((sum, row) => sum + (row.months[idx] || 0), 0)
    );
    return {
      months,
      total: months.reduce((sum, v) => sum + v, 0),
    };
  }, [fyMatrix]);

  return (
    <div className="section-card fade-in" style={{ marginTop: '20px' }}>
      <div className="section-header" style={{ marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <div className="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 4 3 5-7"/></svg>
          Admission Count
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
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
            <option value="">All Status</option>
            {statuses.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="trend-badge trend-up">Financial Year (Apr–Mar)</span>
        </div>
      </div>

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
              <th>FY</th>
              {FY_MONTH_LABELS.map(month => <th key={month}>{month}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {fyMatrix.map(row => (
              <tr key={row.label}>
                <td><strong>{row.label}</strong></td>
                {row.months.map((count, idx) => (
                  <td key={`${row.label}-${idx}`}>
                    {isFutureFyMonth(row.startYear, idx, today)
                      ? <span style={{ color: 'var(--border-medium)' }}>-</span>
                      : count > 0
                        ? count.toLocaleString('en-IN')
                        : <span style={{ color: 'var(--border-medium)' }}>-</span>}
                  </td>
                ))}
                <td><strong>{row.total.toLocaleString('en-IN')}</strong></td>
              </tr>
            ))}
          </tbody>
          {fyMatrix.length > 0 && (
            <tfoot>
              <tr>
                <td>Total</td>
                {fyTotals.months.map((count, idx) => (
                  <td key={FY_MONTH_LABELS[idx]}>{count > 0 ? count.toLocaleString('en-IN') : '-'}</td>
                ))}
                <td>{fyTotals.total.toLocaleString('en-IN')}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
