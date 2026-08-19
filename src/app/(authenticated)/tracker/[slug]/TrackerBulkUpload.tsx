'use client';

import { useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  getTrackerCsvTemplate,
  parseTrackerCsvRow,
  rowHasBlockingIssue,
  type TrackerRowIssue,
} from '@/lib/tracker-bulk-upload';
import type { TrackerTableConfig } from '@/lib/tracker-tables';
import { bulkUpsertTrackerRows, validateTrackerBulkUpload } from '../actions';

type PreviewRow = {
  line: number;
  id: number | null;
  name: string;
  prefix?: string;
  issues: TrackerRowIssue[];
};

export default function TrackerBulkUpload({
  config,
  onUploaded,
}: {
  config: TrackerTableConfig;
  onUploaded: (rows: { id: number; name: string }[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [hasBlocking, setHasBlocking] = useState(false);
  const [validCount, setValidCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const downloadTemplate = () => {
    const csv = getTrackerCsvTemplate(config);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.slug}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (file: File) => {
    setMessage(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async results => {
        const parsed = (results.data as Record<string, string>[]).map((raw, index) => {
          const { id, name, prefix } = parseTrackerCsvRow(raw, config);
          return { line: index, id, name, prefix };
        });

        if (parsed.length === 0) {
          setMessage({ text: 'CSV is empty or has no data rows.', type: 'error' });
          setPreview(null);
          return;
        }

        setLoading(true);
        const validation = await validateTrackerBulkUpload(config.slug, parsed);
        setLoading(false);

        if ('error' in validation && validation.error) {
          setMessage({ text: validation.error, type: 'error' });
          return;
        }

        setPreview(validation.rows);
        setHasBlocking(validation.hasBlocking);
        setValidCount(validation.validCount);

        if (validation.hasBlocking) {
          setMessage({
            text: `${validation.validCount} of ${parsed.length} rows are valid. Fix highlighted duplicates before uploading.`,
            type: 'warning',
          });
        } else {
          setMessage({
            text: `All ${parsed.length} rows look valid. Review and upload.`,
            type: 'success',
          });
        }
      },
      error: err => {
        setMessage({ text: `CSV parse error: ${err.message}`, type: 'error' });
      },
    });
  };

  const handleUpload = async () => {
    if (!preview?.length) return;

    const toSave = preview
      .filter(row => row.id && row.name.trim() && !rowHasBlockingIssue(row.issues))
      .map(row => ({
        id: row.id as number,
        name: row.name.trim(),
        prefix: row.prefix,
      }));

    if (toSave.length === 0) {
      setMessage({ text: 'No valid rows to upload.', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage(null);
    const result = await bulkUpsertTrackerRows(config.slug, toSave);
    setLoading(false);

    if (result.error) {
      setMessage({ text: result.error, type: 'error' });
      return;
    }

    const savedRows = toSave.map(r => ({ id: r.id, name: r.name }));
    onUploaded(savedRows);

    setPreview(null);
    setHasBlocking(false);
    setValidCount(0);
    if (fileRef.current) fileRef.current.value = '';

    const errNote =
      result.errors?.length ? ` ${result.errors.length} row(s) failed on save.` : '';
    setMessage({
      text: `Uploaded ${result.saved} row(s).${result.skipped ? ` Skipped ${result.skipped} duplicate/invalid row(s).` : ''}${errNote}`,
      type: (result.saved ?? 0) > 0 ? 'success' : 'warning',
    });
  };

  const issueStyle = (issues: TrackerRowIssue[] | undefined, field: 'id' | 'name') => {
    if (!issues?.some(i => i.field === field || i.field === 'row')) return undefined;
    return {
      background: 'rgba(239, 68, 68, 0.12)',
      borderColor: '#f87171',
      boxShadow: '0 0 0 1px rgba(248, 113, 113, 0.35)',
    };
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Bulk upload (CSV)</h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Columns: <strong>id</strong>, <strong>{config.nameField}</strong>
        {config.slug === 'enrollment' ? ', optional prefix' : ''}. Duplicate ids or names are highlighted before upload.
      </p>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={downloadTemplate} disabled={loading}>
          Download template
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          disabled={loading}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="form-input"
          style={{ maxWidth: '280px', padding: '0.35rem' }}
        />
        {preview && preview.length > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={loading || validCount === 0}
          >
            {loading ? 'Uploading…' : `Upload ${validCount} valid row(s)`}
          </button>
        )}
      </div>

      {message && (
        <div
          style={{
            padding: '0.65rem 0.9rem',
            marginBottom: preview?.length ? '1rem' : 0,
            borderRadius: '8px',
            fontSize: '0.85rem',
            background:
              message.type === 'success'
                ? 'rgba(16,185,129,0.15)'
                : message.type === 'warning'
                  ? 'rgba(245,158,11,0.15)'
                  : 'rgba(239,68,68,0.15)',
            color:
              message.type === 'success' ? '#34d399' : message.type === 'warning' ? '#fbbf24' : '#f87171',
          }}
        >
          {message.text}
        </div>
      )}

      {preview && preview.length > 0 && (
        <div style={{ overflowX: 'auto', maxHeight: '320px', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--bg-elevated)' }}>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Row</th>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>ID</th>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Name</th>
                {config.slug === 'enrollment' && (
                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Prefix</th>
                )}
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Issues</th>
              </tr>
            </thead>
            <tbody>
              {preview.map(row => {
                const blocked = rowHasBlockingIssue(row.issues);
                return (
                  <tr
                    key={row.line}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: blocked ? 'rgba(239, 68, 68, 0.08)' : undefined,
                    }}
                  >
                    <td style={{ padding: '0.5rem' }}>{row.line + 1}</td>
                    <td style={{ padding: '0.5rem', ...issueStyle(row.issues, 'id') }}>{row.id ?? '—'}</td>
                    <td style={{ padding: '0.5rem', ...issueStyle(row.issues, 'name') }}>{row.name || '—'}</td>
                    {config.slug === 'enrollment' && (
                      <td style={{ padding: '0.5rem' }}>{row.prefix || '—'}</td>
                    )}
                    <td style={{ padding: '0.5rem', color: blocked ? '#f87171' : 'var(--text-muted)' }}>
                      {row.issues.length
                        ? row.issues.map(i => i.message).join('; ')
                        : 'OK'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasBlocking && preview && (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#fbbf24' }}>
          Rows highlighted in red have duplicate or conflicting values. Only non-highlighted rows will be uploaded.
        </p>
      )}
    </div>
  );
}
