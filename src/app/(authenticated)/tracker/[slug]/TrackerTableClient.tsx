'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { deleteTrackerRow, upsertTrackerRow } from '../actions';
import type { TrackerTableConfig } from '@/lib/tracker-tables';
import {
  findDuplicateNameKeys,
  getManualEntryIssues,
  normalizeTrackerName,
} from '@/lib/tracker-bulk-upload';
import TrackerBulkUpload from './TrackerBulkUpload';

type Row = { id: number; name: string };

const duplicateInputStyle = {
  borderColor: '#f87171',
  boxShadow: '0 0 0 1px rgba(248, 113, 113, 0.4)',
  background: 'rgba(239, 68, 68, 0.08)',
};

export default function TrackerTableClient({
  config,
  initialRows,
}: {
  config: TrackerTableConfig;
  initialRows: Row[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);

  const duplicateNameKeys = useMemo(() => findDuplicateNameKeys(rows), [rows]);

  const parsedId = parseInt(newId, 10);
  const manualIssues = useMemo(() => {
    if (!newId && !newName.trim()) return [];
    return getManualEntryIssues(
      Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null,
      newName,
      rows.filter(r => r.id !== parsedId)
    );
  }, [newId, newName, parsedId, rows]);

  const idFieldIssues = manualIssues.filter(i => i.field === 'id' || i.code === 'duplicate_id');
  const nameFieldIssues = manualIssues.filter(i => i.field === 'name' || i.code === 'name_taken' || i.code === 'duplicate_name');

  const mergeUploaded = (uploaded: { id: number; name: string }[]) => {
    setRows(prev => {
      const map = new Map(prev.map(r => [r.id, r]));
      for (const row of uploaded) {
        map.set(row.id, row);
      }
      return [...map.values()].sort((a, b) => a.id - b.id);
    });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(newId, 10);
    if (!id || !newName.trim()) {
      setMessage({ text: 'Enter a valid numeric id and name.', type: 'error' });
      return;
    }
    if (manualIssues.some(i => i.code !== 'case_duplicate_name')) {
      setMessage({ text: manualIssues.map(i => i.message).join(' '), type: 'error' });
      return;
    }
    setLoading(true);
    setMessage(null);
    const result = await upsertTrackerRow(config.slug, id, newName);
    setLoading(false);
    if (result.error) {
      setMessage({ text: result.error, type: 'error' });
      return;
    }
    setRows(prev => {
      const next = prev.filter(r => r.id !== id);
      next.push({ id, name: newName.trim() });
      next.sort((a, b) => a.id - b.id);
      return next;
    });
    setNewId('');
    setNewName('');
    setMessage({ text: 'Saved successfully.', type: 'success' });
  };

  const handleDelete = async (id: number) => {
    if (!confirm(`Delete ${config.menuLabel} id ${id}?`)) return;
    setLoading(true);
    const result = await deleteTrackerRow(config.slug, id);
    setLoading(false);
    if (result.error) {
      setMessage({ text: result.error, type: 'error' });
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
    setMessage({ text: 'Deleted.', type: 'success' });
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href="/database" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem' }}>
          ← Database
        </Link>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.35rem' }}>{config.title}</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Tracker field: <strong>{config.menuLabel}</strong> — manage id and label used by Admission Form.
        </p>
      </div>

      {message && (
        <div
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            borderRadius: '8px',
            background: message.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            color: message.type === 'success' ? '#34d399' : '#f87171',
          }}
        >
          {message.text}
        </div>
      )}

      <TrackerBulkUpload config={config} onUploaded={mergeUploaded} />

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Add / Update row</h2>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: 'var(--text-muted)' }}>ID</label>
            <input
              type="number"
              className="form-input"
              value={newId}
              onChange={e => setNewId(e.target.value)}
              placeholder="e.g. 1"
              required
              disabled={loading}
              style={{ width: '100px', ...(idFieldIssues.length ? duplicateInputStyle : {}) }}
            />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: 'var(--text-muted)' }}>Name</label>
            <input
              type="text"
              className="form-input"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Label value"
              required
              disabled={loading}
              style={{ width: '100%', ...(nameFieldIssues.length ? duplicateInputStyle : {}) }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: '38px' }}>
            {loading ? 'Saving…' : 'Save'}
          </button>
        </form>
        {manualIssues.length > 0 && (
          <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem', color: '#f87171' }}>
            {manualIssues.map((issue, i) => (
              <li key={`${issue.code}-${i}`}>{issue.message}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="glass-panel" style={{ overflowX: 'auto', padding: '1rem' }}>
        {duplicateNameKeys.size > 0 && (
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#fbbf24' }}>
            {duplicateNameKeys.size} duplicate name(s) in the table are highlighted below (case-insensitive).
          </p>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left' }}>ID</th>
              <th style={{ padding: '0.75rem', textAlign: 'left' }}>Name</th>
              <th style={{ padding: '0.75rem', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No rows yet.
                </td>
              </tr>
            ) : (
              rows.map(row => {
                const isDuplicateName = duplicateNameKeys.has(normalizeTrackerName(row.name));
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isDuplicateName ? 'rgba(239, 68, 68, 0.08)' : undefined,
                    }}
                  >
                    <td style={{ padding: '0.75rem' }}>{row.id}</td>
                    <td
                      style={{
                        padding: '0.75rem',
                        ...(isDuplicateName
                          ? { color: '#f87171', fontWeight: 500 }
                          : {}),
                      }}
                    >
                      {row.name}
                      {isDuplicateName && (
                        <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: '#fbbf24' }}>
                          duplicate
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: '#f87171' }}
                        onClick={() => handleDelete(row.id)}
                        disabled={loading}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <p style={{ margin: '1rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Total: {rows.length} rows
        </p>
      </div>
    </div>
  );
}
