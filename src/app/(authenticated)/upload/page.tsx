'use client'

import { useState } from 'react';
import Papa from 'papaparse';
import Loader from '@/components/Loader';
import { getAdmissionFormTemplateRows } from '@/lib/admission-form-template';
import { CONSOLIDATED_PAYOUT_CATEGORIES } from '@/lib/consolidated-payout-upload';
import { PAYMENT_SOURCES, type PaymentUploadSlug } from '@/lib/payment-sources';

type ClearType =
  | 'form'
  | 'fee'
  | 'student-fee'
  | 'razorpay'
  | 'jodo'
  | 'early'
  | 'offline'
  | 'bank'
  | 'propelld'
  | 'others'
  | 'misc'
  | 'all-payments'
  | 'consolidated-payout'
  | 'consolidated-payout-cp'
  | 'consolidated-payout-ds'
  | 'consolidated-payout-hp'
  | 'consolidated-payout-incentive'
  | 'consolidated-payout-referral'
  | 'consolidated-payout-others';

function ClearButton({
  type,
  label,
  disabled,
  onClear,
}: {
  type: ClearType;
  label: string;
  disabled: boolean;
  onClear: (type: ClearType, label: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClear(type, label)}
      disabled={disabled}
      style={{
        padding: '0.25rem 0.75rem',
        fontSize: '0.75rem',
        background: 'rgba(239, 68, 68, 0.15)',
        color: '#f87171',
        border: '1px solid rgba(239, 68, 68, 0.4)',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.3)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239, 68, 68, 0.7)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.15)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239, 68, 68, 0.4)';
      }}
    >
      🗑 Clear Data
    </button>
  );
}

export default function UploadPage() {
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'warning' } | null>(null);
  const [confirmClear, setConfirmClear] = useState<{ type: ClearType; label: string } | null>(null);

  const handleCancelUpload = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setLoading(false);
      setMessage({ text: 'Upload cancelled by user.', type: 'warning' });
    }
  };

  const handleUpload = async (
    e: React.FormEvent<HTMLFormElement>,
    type: 'fee' | 'form' | 'student-fee' | 'razorpay' | 'jodo' | 'early' | 'offline' | 'bank' | 'propelld' | 'others' | 'misc' | 'consolidated-payout',
    extra?: Record<string, unknown>
  ) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: 'Reading CSV file...', type: 'success' });
    
    const controller = new AbortController();
    setAbortController(controller);
    
    const formData = new FormData(e.currentTarget);
    const file = formData.get('file') as File;
    
    if (!file || file.size === 0) {
      setMessage({ text: 'Please select a file', type: 'error' });
      setLoading(false);
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let totalUploaded = 0;
        try {
          const allData = results.data;
          const BATCH_SIZE = 500; // Send 500 rows per API request to prevent server timeout

          for (let i = 0; i < allData.length; i += BATCH_SIZE) {
            if (controller.signal.aborted) {
              throw new Error('Upload aborted by user');
            }

            const batch = allData.slice(i, i + BATCH_SIZE);
            const res = await fetch(`/api/upload/${type}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: batch, ...extra }),
              signal: controller.signal
            });
            
            const result = await res.json();
            if (!res.ok) {
              throw new Error(result.error || 'Batch upload failed');
            }
            
            totalUploaded += result.count;
            // Update progress
            setMessage({ 
              text: `Uploading... (${totalUploaded.toLocaleString()} / ${allData.length.toLocaleString()} records processed)`, 
              type: 'success' 
            });
          }

          if (!controller.signal.aborted) {
            setMessage({ text: `✓ Successfully uploaded all ${totalUploaded.toLocaleString()} records!`, type: 'success' });
          }
        } catch (err: unknown) {
          const error = err as { name?: string; message?: string };
          if (error.name === 'AbortError' || error.message === 'Upload aborted by user') {
            setMessage({ text: `Upload manually stopped. (Processed ${totalUploaded} records before stopping)`, type: 'warning' });
          } else {
            setMessage({ text: `Failed to upload: ${error.message}`, type: 'error' });
          }
        } finally {
          setLoading(false);
          setAbortController(null);
          (e.target as HTMLFormElement).reset();
        }
      },
      error: (error) => {
        setMessage({ text: `CSV Parse Error: ${error.message}`, type: 'error' });
        setLoading(false);
      }
    });
  };

  const handleClear = async () => {
    if (!confirmClear) return;
    setClearing(true);
    setConfirmClear(null);
    setMessage(null);

    try {
      const categoryClearMap: Record<string, string> = {
        'consolidated-payout-cp': 'CP',
        'consolidated-payout-ds': 'DS',
        'consolidated-payout-hp': 'HP',
        'consolidated-payout-incentive': 'Incentive',
        'consolidated-payout-referral': 'Referral',
        'consolidated-payout-others': 'Corp Inst',
      };

      const category = categoryClearMap[confirmClear.type];
      const clearPath = category
        ? `/api/clear/consolidated-payout?category=${encodeURIComponent(category)}`
        : `/api/clear/${confirmClear.type}`;
      const res = await fetch(clearPath, { method: 'DELETE' });
      const result = await res.json();
      if (res.ok) {
        setMessage({ text: `✓ ${result.message}`, type: 'success' });
      } else {
        setMessage({ text: `Error: ${result.error}`, type: 'error' });
      }
    } catch (err: unknown) {
      setMessage({ text: `Failed to clear: ${(err instanceof Error ? err.message : String(err))}`, type: 'error' });
    } finally {
      setClearing(false);
    }
  };

  const downloadTemplate = (type: 'fee' | 'payment' | 'payment-misc' | 'form' | 'consolidated-payout') => {
    let data: unknown[] = [];
    if (type === 'fee') {
      data = [{ batch: 'Batch 1', payment_option: 'Opt Out', program: 'B.Com (Hons.) Online', sem_fee: 10000 }];
    } else if (type === 'payment-misc') {
      data = [{
        Date: '02-03-2026',
        'Settlement UTR / Transaction ID': 'MISC-001',
        'Transaction Amount (₹)': 50000,
        Mode: 'Misc',
        Description: 'Corporate sponsorship / other collection',
      }];
    } else if (type === 'payment') {
      data = [{
        Date: '02-03-2026',
        'Settlement UTR / Transaction ID': 'LAI8012160550',
        enrollment_id: 1,
        'Transaction Amount (₹)': 94960,
        Mode: 'Early',
        'Discounted Course Fee': 0,
        '1st EMI': 5000,
        tenure: 12,
      }];
    } else if (type === 'consolidated-payout') {
      data = [{
        'Enrollment Id': 693,
        LeadSource_Code: 102,
        'Pay Out': 3750,
        'Invoice no.': 'Invoice 23: Efos',
        Month: 'Jan',
        Category: 'CP',
        'Commission %': '50%',
        DOA: '08-07-2026 14:04',
        'Reco Status': 'Paid',
      }];
    } else {
      data = getAdmissionFormTemplateRows();
    }

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const dateStr = new Date().toISOString().split('T')[0];
    const filePrefix = type === 'form' ? 'admission_form_main_data_base' : `${type}_template`;
    link.setAttribute('download', `${filePrefix}_${dateStr}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const ClearButtonProps = { disabled: loading || clearing, onClear: (type: ClearType, label: string) => setConfirmClear({ type, label }) };

  return (
    <div className="page animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h1>Data Upload</h1>
        <p style={{ color: 'var(--text-muted)' }}>Upload CSV files to update the Admission Forms, Fee Structure, and Payment Sources.</p>
      </div>

      {message && (
        <div style={{ 
          padding: '1rem', 
          marginBottom: '2rem', 
          borderRadius: '8px', 
          background: message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : message.type === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          color: message.type === 'success' ? '#34d399' : message.type === 'warning' ? '#fbbf24' : '#f87171',
          border: `1px solid ${message.type === 'success' ? '#10b981' : message.type === 'warning' ? '#f59e0b' : '#ef4444'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: '1rem',
          zIndex: 50,
          backdropFilter: 'blur(8px)'
        }}>
          <span>{message.text}</span>
          {loading && (
            <button 
              onClick={handleCancelUpload}
              className="btn" 
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
            >
              🛑 Stop Upload
            </button>
          )}
        </div>
      )}

      <div className="upload-grid">
        {/* Admission Forms Upload */}
        <div className="glass-panel upload-card">
          <div className="upload-card-header">
            <h2 style={{ margin: 0 }}>Admission Forms</h2>
            <div className="upload-card-actions">
              <button className="btn btn-secondary" type="button" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={() => downloadTemplate('form')}>
                Template
              </button>
              <ClearButton type="form" label="Admission Forms" {...ClearButtonProps} />
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Upload <strong>main_data_base</strong> format: numeric ids for Batch, Program, Payment_option, Type,
            Status, etc. <strong>Enrollment_No</strong> is <code>Enrollment.id</code> (create enrollments first).
            Download Template for exact column headers.
          </p>
          
          <form onSubmit={(e) => handleUpload(e, 'form')}>
            <div className="form-group">
              <input type="file" name="file" accept=".csv" className="form-input" required disabled={loading} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? <><Loader size="sm" color="white" /> Uploading...</> : 'Upload Forms'}
            </button>
          </form>
        </div>

        {/* Fee Structure Upload */}
        <div className="glass-panel upload-card">
          <div className="upload-card-header">
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Base Fee Structure</h2>
            <div className="upload-card-actions">
              <button className="btn btn-secondary" type="button" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={() => downloadTemplate('fee')}>
                Template
              </button>
              <ClearButton type="fee" label="Base Fee" {...ClearButtonProps} />
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Upload combinations of Batch, Payment Option, and Program to update Sem Fee.
            Use numeric lookup ids (same as main_data_base) or text labels (e.g. <code>batch 1</code>, <code>Opt Out</code>).
          </p>
          
          <form onSubmit={(e) => handleUpload(e, 'fee')}>
            <div className="form-group">
               <input type="file" name="file" accept=".csv" className="form-input" required disabled={loading} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? <><Loader size="sm" color="white" /> Uploading...</> : 'Upload Base Fee'}
            </button>
          </form>
        </div>

        {/* Student Fee Structure Upload */}
        <div className="glass-panel upload-card">
          <div className="upload-card-header">
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Student Fee Structure</h2>
            <div className="upload-card-actions">
              <a href="/api/student-fee-structure/template" className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', textDecoration: 'none' }}>
                Template
              </a>
              <ClearButton type="student-fee" label="Student Fees" {...ClearButtonProps} />
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Bulk upload student-specific fee structures, coupons, and scholarships.
          </p>
          
          <form onSubmit={(e) => handleUpload(e, 'student-fee')}>
            <div className="form-group">
               <input type="file" name="file" accept=".csv" className="form-input" required disabled={loading} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? <><Loader size="sm" color="white" /> Uploading...</> : 'Upload Student Fees'}
            </button>
          </form>
        </div>

        {/* Payment Sources Upload */}
        <div className="glass-panel upload-card">
          <div className="upload-card-header">
            <h2 style={{ margin: 0 }}>Payment Sources</h2>
            <div className="upload-card-actions">
              <button className="btn btn-secondary" type="button" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={() => downloadTemplate('payment')}>
                Template
              </button>
              <button className="btn btn-secondary" type="button" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={() => downloadTemplate('payment-misc')}>
                Misc Template
              </button>
              <ClearButton type="all-payments" label="All Payment Sources" {...ClearButtonProps} />
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Upload fee/payment rows with <strong>enrollment_id</strong> (numeric id from Enrollment table).
            Use <strong>Reco</strong> when enrollment is not known yet — those rows appear on the <strong>Reco Tab</strong> for reconciliation.
            Batch is set automatically from that student&apos;s admission form — do not upload a Batch column.
            Optional <strong>tenure</strong> (integer, e.g. 12). Records are mirrored to Consolidated Payment.
            <br /><br />
            <strong>Misc</strong> is for overall collection only (no enrollment mapping, not added to Consolidated Payment / Reco). Use the Misc Template — columns are Date, Settlement UTR / Transaction ID, Transaction Amount, Mode, and Description only.
          </p>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const source = formData.get('paymentSource') as PaymentUploadSlug;
            handleUpload(e, source);
          }}>
            <div className="form-group">
              <select name="paymentSource" className="form-select" required disabled={loading} defaultValue="razorpay">
                <option value="razorpay">Razorpay</option>
                <option value="jodo">Jodo</option>
                <option value="early">Early</option>
                <option value="offline">Offline</option>
                <option value="bank">Bank</option>
                <option value="propelld">Propelld</option>
                <option value="others">Corp Inst</option>
                <option value="misc">Misc</option>
              </select>
            </div>
            <div className="form-group">
              <input type="file" name="file" accept=".csv" className="form-input" required disabled={loading} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? <><Loader size="sm" color="white" /> Uploading...</> : 'Upload Payments'}
            </button>
          </form>

          {/* Per-source clear buttons */}
          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Clear individual source
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {(['razorpay', 'jodo', 'early', 'offline', 'bank', 'propelld', 'others', 'misc'] as PaymentUploadSlug[]).map(src => {
                const label = PAYMENT_SOURCES[src].label;
                return (
                <button
                  key={src}
                  type="button"
                  onClick={() => setConfirmClear({ type: src, label: `${label} payments` })}
                  disabled={loading || clearing}
                  style={{
                    padding: '0.2rem 0.6rem',
                    fontSize: '0.7rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.25)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.1)';
                  }}
                >
                  {label}
                </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Consolidated Payout Upload */}
        <div className="glass-panel upload-card">
          <div className="upload-card-header">
            <h2 style={{ margin: 0 }}>Consolidated Payout</h2>
            <div className="upload-card-actions">
              <button className="btn btn-secondary" type="button" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={() => downloadTemplate('consolidated-payout')}>
                Template
              </button>
              <ClearButton type="consolidated-payout" label="Consolidated Payout" {...ClearButtonProps} />
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Upload payout released rows for channel partners. Select category from dropdown in place of payment source names.
          </p>

          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const category = formData.get('category') as string;
            handleUpload(e, 'consolidated-payout', { category });
          }}>
            <div className="form-group">
              <select name="category" className="form-select" required disabled={loading} defaultValue="CP">
                {CONSOLIDATED_PAYOUT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <input type="file" name="file" accept=".csv" className="form-input" required disabled={loading} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? <><Loader size="sm" color="white" /> Uploading...</> : 'Upload Consolidated Payout'}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Clear individual category
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {CONSOLIDATED_PAYOUT_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() =>
                    setConfirmClear({
                      type: (category === 'Corp Inst'
                        ? 'consolidated-payout-others'
                        : `consolidated-payout-${category.toLowerCase()}`) as ClearType,
                      label: `${category} consolidated payout`,
                    })
                  }
                  disabled={loading || clearing}
                  style={{
                    padding: '0.2rem 0.6rem',
                    fontSize: '0.7rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.25)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.1)';
                  }}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmClear && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setConfirmClear(null)}
        >
          <div
            className="glass-panel"
            style={{ padding: '2rem', maxWidth: '420px', width: '90%', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ margin: '0 0 0.75rem', color: '#f87171' }}>Clear Data?</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              This will permanently delete <strong style={{ color: 'white' }}>all records</strong> in{' '}
              <strong style={{ color: '#f87171' }}>{confirmClear.label}</strong>. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={() => setConfirmClear(null)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                disabled={clearing}
                style={{
                  flex: 1,
                  padding: '0.75rem 1.5rem',
                  background: 'rgba(239, 68, 68, 0.85)',
                  color: 'white',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
              >
                {clearing ? <><Loader size="sm" color="white" /> Clearing...</> : 'Yes, Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
