'use client';

import { ENROLLMENT_MAPPED_PAYMENT_SOURCE_LABELS } from '@/lib/payment-sources';

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-medium)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontWeight: 500,
  outline: 'none',
  cursor: 'pointer',
  minWidth: '180px',
  boxShadow: 'var(--shadow-card)',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-display)',
};

export default function PaymentSourceFilterSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={labelStyle}>Payment Source</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={selectStyle}
        aria-label="Filter by payment source"
      >
        <option value="">All Sources</option>
        {ENROLLMENT_MAPPED_PAYMENT_SOURCE_LABELS.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}
