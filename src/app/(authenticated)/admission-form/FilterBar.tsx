'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { DROPDOWNS } from '@/lib/constants';

export type PlacementStatusOption = { id: number; placedStatus: string };

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-medium)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: '13px',
  cursor: 'pointer',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-display)',
};

export default function FilterBar({
  placementStatuses,
}: {
  placementStatuses: PlacementStatusOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    program: searchParams.get('program') || '',
    batch: searchParams.get('batch') || '',
    category: searchParams.get('category') || '',
    placedStatus: searchParams.get('placedStatus') || ''
  });

  const updateFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', '1');
    if (filters.search) params.set('search', filters.search); else params.delete('search');
    if (filters.program) params.set('program', filters.program); else params.delete('program');
    if (filters.batch) params.set('batch', filters.batch); else params.delete('batch');
    if (filters.category) params.set('category', filters.category); else params.delete('category');
    if (filters.placedStatus) params.set('placedStatus', filters.placedStatus); else params.delete('placedStatus');
    router.push(`?${params.toString()}`);
  }, [filters, searchParams, router]);

  const handleClear = () => {
    setFilters({ search: '', program: '', batch: '', category: '', placedStatus: '' });
    router.push('?page=1');
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '12px',
      padding: '20px 24px',
      marginBottom: '20px',
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-end',
      flexWrap: 'wrap',
      boxShadow: 'var(--shadow-card)',
    }}>
      {/* Enrollment Search */}
      <div style={{ flex: 1, minWidth: '200px' }}>
        <label style={labelStyle}>Search Enrollment</label>
        <input 
          type="text" 
          style={selectStyle} 
          placeholder="Enter Enrollment No..." 
          value={filters.search} 
          onChange={e => setFilters(p => ({...p, search: e.target.value}))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); updateFilters(); } }}
        />
      </div>

      {/* Program */}
      <div style={{ flex: 1, minWidth: '150px' }}>
        <label style={labelStyle}>Program</label>
        <select style={selectStyle} value={filters.program} onChange={e => setFilters(p => ({...p, program: e.target.value}))}>
          <option value="">All</option>
          {DROPDOWNS.programs.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Batch */}
      <div style={{ flex: 1, minWidth: '140px' }}>
        <label style={labelStyle}>Batch</label>
        <select style={selectStyle} value={filters.batch} onChange={e => setFilters(p => ({...p, batch: e.target.value}))}>
          <option value="">All</option>
          {DROPDOWNS.batches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Category */}
      <div style={{ flex: 1, minWidth: '140px' }}>
        <label style={labelStyle}>Category</label>
        <select style={selectStyle} value={filters.category} onChange={e => setFilters(p => ({...p, category: e.target.value}))}>
          <option value="">All</option>
          <option value="Full Fee">Full Fee</option>
          <option value="Excess Fee">Excess Fee</option>
          <option value="Pending Fee">Pending Fee</option>
        </select>
      </div>

      {/* Placed Status */}
      <div style={{ flex: 1, minWidth: '160px' }}>
        <label style={labelStyle}>Placed Status</label>
        <select style={selectStyle} value={filters.placedStatus} onChange={e => setFilters(p => ({...p, placedStatus: e.target.value}))}>
          <option value="">All</option>
          {placementStatuses.map(s => (
            <option key={s.id} value={s.placedStatus}>
              {s.placedStatus.trim()}
            </option>
          ))}
        </select>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px', paddingBottom: '1px' }}>
        <button onClick={handleClear} className="btn-secondary" style={{ height: '38px', padding: '0 16px' }}>
          Clear
        </button>
        <button onClick={updateFilters} className="btn-primary" style={{ height: '38px', padding: '0 20px' }}>
          Apply Filters
        </button>
      </div>
    </div>
  );
}
