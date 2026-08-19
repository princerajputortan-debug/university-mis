"use client";

import React, { useState, useEffect } from 'react';

type BatchData = {
  batch: string;
  Total: number;
  [source: string]: any;
};

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const years = [2022, 2023, 2024, 2025, 2026];

const sourceColors: Record<string, string> = {
  Razorpay: '#7C7FF5',
  Jodo: '#38BDF8',
  Early: '#F59E0B',
  Offline: '#10B981',
  Bank: '#8B8B9E',
  Propelld: '#A78BFA',
  'Corp Inst': '#F43F5E',
  Misc: '#64748B',
};

const formatCurrency = (val: number) => {
  if (val === 0 || !val) return '-';
  return '₹ ' + val.toLocaleString('en-IN');
};

export default function BatchCollectionTable() {
  const [filter, setFilter] = useState<'today' | 'yesterday' | 'month'>('today');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<BatchData[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        let url = `/api/dashboard/batch-collections?filter=${filter}`;
        if (filter === 'month') {
          url += `&month=${selectedMonth}&year=${selectedYear}`;
        }
        const res = await fetch(url);
        const result = await res.json();
        if (result.data) {
          setData(result.data);
          setSources(result.sources);
        }
      } catch (error) {
        console.error('Failed to fetch batch collection', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [filter, selectedMonth, selectedYear]);

  // Calculate totals
  const totals: Record<string, number> = { Total: 0 };
  sources.forEach(s => totals[s] = 0);
  data.forEach(row => {
    totals.Total += row.Total || 0;
    sources.forEach(s => {
      totals[s] += row[s] || 0;
    });
  });

  return (
    <div className="section-card fade-in" style={{ marginTop: '20px' }}>
      <div className="section-header" style={{ marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <div className="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          Collections by Batch
        </div>
        
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div className="seg-control" style={{ background: 'var(--bg-card)' }}>
            <button className={`seg-btn ${filter === 'today' ? 'active' : ''}`} onClick={() => setFilter('today')}>TODAY</button>
            <button className={`seg-btn ${filter === 'yesterday' ? 'active' : ''}`} onClick={() => setFilter('yesterday')}>YESTERDAY</button>
            <button className={`seg-btn ${filter === 'month' ? 'active' : ''}`} onClick={() => setFilter('month')}>MONTH</button>
          </div>
          
          {filter === 'month' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <select 
                className="select-input" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-medium)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '12px', outline: 'none' }}
              >
                {monthLabels.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select 
                className="select-input" 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-medium)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '12px', outline: 'none' }}
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
      
      <div className="mis-table-wrap" style={{ minHeight: '120px', position: 'relative' }}>
        {loading && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', opacity: 0.7, zIndex: 1 }}>
            <div className="trend-badge" style={{ padding: '8px 16px' }}>Loading...</div>
          </div>
        )}
        
        <table className="mis-table mis-table-compact">
          <thead>
            <tr>
              <th>Batch</th>
              {sources.map(source => (
                <th key={source}>
                  <span className="source-dot" style={{ background: sourceColors[source] || '#7C7FF5', marginRight: '6px' }}></span>
                  {source}
                </th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && !loading && (
              <tr>
                <td colSpan={sources.length + 2} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No collections found for this period.
                </td>
              </tr>
            )}
            {data.map(row => (
              <tr key={row.batch}>
                <td><strong>{row.batch}</strong></td>
                {sources.map(source => (
                  <td key={`${row.batch}-${source}`}>{formatCurrency(row[source])}</td>
                ))}
                <td><strong>{formatCurrency(row.Total)}</strong></td>
              </tr>
            ))}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr>
                <td>Total</td>
                {sources.map(source => (
                  <td key={`total-${source}`}>{formatCurrency(totals[source])}</td>
                ))}
                <td>{formatCurrency(totals.Total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
