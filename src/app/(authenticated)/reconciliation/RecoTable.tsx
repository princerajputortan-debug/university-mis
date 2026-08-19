'use client';

import { useState } from 'react';
import Loader from '@/components/Loader';

type RecoPayment = {
  id: number;
  transactionId: string;
  date: Date | null;
  amount: number;
  sourceName: string;
  mode: string | null;
  batch: string | null;
};

export default function RecoTable({ initialData }: { initialData: RecoPayment[] }) {
  const [payments, setPayments] = useState<RecoPayment[]>(initialData);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [enrollmentInput, setEnrollmentInput] = useState<{ [key: number]: string }>({});
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleResolve = async (payment: RecoPayment) => {
    const newEnrollmentNo = enrollmentInput[payment.id]?.trim();
    if (!newEnrollmentNo) {
      setMessage({ text: 'Please enter a valid Enrollment No.', type: 'error' });
      return;
    }

    setResolvingId(payment.id);
    setMessage(null);

    try {
      const res = await fetch('/api/reconciliation/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: payment.transactionId,
          sourceName: payment.sourceName,
          newEnrollmentNo
        })
      });

      const result = await res.json();

      if (res.ok) {
        setMessage({ text: `Successfully resolved ${payment.transactionId} to ${newEnrollmentNo}!`, type: 'success' });
        // Remove from list
        setPayments(prev => prev.filter(p => p.id !== payment.id));
      } else {
        setMessage({ text: `Failed to resolve: ${result.error}`, type: 'error' });
      }
    } catch (err: unknown) {
      setMessage({ text: `Error: ${(err instanceof Error ? err.message : String(err))}`, type: 'error' });
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div>
      {message && (
        <div style={{ 
          padding: '0.75rem 1rem', 
          marginBottom: '1rem', 
          borderRadius: '8px', 
          background: message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          color: message.type === 'success' ? '#34d399' : '#f87171',
          border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`
        }}>
          {message.text}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)' }}>Date</th>
              <th style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)' }}>Transaction ID</th>
              <th style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)' }}>Source</th>
              <th style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)' }}>Amount (₹)</th>
              <th style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)' }}>Batch / Mode</th>
              <th style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)' }}>Resolve (Enter Enrollment)</th>
              <th style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(payment => (
              <tr key={payment.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)' }}>{payment.date ? new Date(payment.date).toLocaleDateString() : 'N/A'}</td>
                <td style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)', fontWeight: 500 }}>{payment.transactionId}</td>
                <td style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '4px', 
                    background: 'rgba(255,255,255,0.1)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase'
                  }}>
                    {payment.sourceName}
                  </span>
                </td>
                <td style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)', color: 'var(--primary-color)', fontWeight: 600 }}>
                  ₹{payment.amount.toLocaleString()}
                </td>
                <td style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.85rem' }}>{payment.batch || '-'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{payment.mode || '-'}</div>
                </td>
                <td style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)' }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: '0.4rem', fontSize: '0.875rem', width: '160px', margin: 0 }}
                    placeholder="e.g. PGO123456"
                    value={enrollmentInput[payment.id] || ''}
                    onChange={e => setEnrollmentInput(prev => ({ ...prev, [payment.id]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleResolve(payment);
                    }}
                    disabled={resolvingId === payment.id}
                  />
                </td>
                <td style={{ padding: '0.75rem', border: '1px solid var(--border-subtle)' }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    onClick={() => handleResolve(payment)}
                    disabled={resolvingId === payment.id || !enrollmentInput[payment.id]?.trim()}
                  >
                    {resolvingId === payment.id ? <Loader size="sm" color="white" /> : 'Resolve'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
