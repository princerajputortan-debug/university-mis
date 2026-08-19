'use client'

import { useState, useEffect, useMemo } from 'react';
import { DROPDOWNS, TEAM_BIFURCATION_MAPPING } from '@/lib/constants';
import { getFeeStructure, getPaymentsForEnrollment, saveAdmissionForm } from './actions';
import { useRouter } from 'next/navigation';
import Loader from '@/components/Loader';
import { formatDateForDisplay } from '@/lib/dates';

/* ── Shared inline styles ── */
const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-display)',
};

const autoLabelStyle: React.CSSProperties = {
  ...labelStyle,
  color: 'var(--success)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '38px',
  padding: '0 12px',
  borderRadius: '8px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-medium)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: '13px',
  outline: 'none',
  transition: 'border-color 0.15s',
};

const disabledInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  cursor: 'not-allowed',
  border: '1px solid var(--border-subtle)',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const sectionCardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  padding: '24px',
  marginBottom: '16px',
  boxShadow: 'var(--shadow-card)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '13px',
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  marginBottom: '20px',
  paddingBottom: '12px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const gridStyle = (cols: number): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${cols}, 1fr)`,
  gap: '16px',
});

type PlacementStatusOption = { id: number; placedStatus: string };

function Field({ label, children, auto }: { label: string; children: React.ReactNode; auto?: boolean }) {
  return (
    <div style={fieldStyle}>
      <label style={auto ? autoLabelStyle : labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export default function FormEditor({
  initialData,
  isAdmin,
  placementStatuses = [],
}: {
  initialData?: any;
  isAdmin: boolean;
  placementStatuses?: PlacementStatusOption[];
}) {
  const router = useRouter();
  const [formData, setFormData] = useState<any>(initialData || { id: 'new' });
  const [loading, setLoading] = useState(false);
  const [feeAsPerStructure, setFeeAsPerStructure] = useState<number>(Number(initialData?.feeAsPerStructure) || 0);
  const [recdFee, setRecdFee] = useState<number>(Number(initialData?.recdFee) || 0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => {
      const next: any = { ...prev, [name]: value };
      if (name === 'type') {
        if (value === 'UG') next.currentSem = 6;
        else if (value === 'PG') next.currentSem = 4;
      }
      return next;
    });
  };

  const bifurcationOptions = useMemo(() => {
    if (!formData.team) return DROPDOWNS.bifurcations;
    return TEAM_BIFURCATION_MAPPING[formData.team] || [];
  }, [formData.team]);

  const locationOptions = useMemo(() => {
    if (formData.nationality === 'Indian') return DROPDOWNS.indianStates;
    if (formData.nationality === 'Others') return DROPDOWNS.countries;
    return [];
  }, [formData.nationality]);

  useEffect(() => {
    const fetchFee = async () => {
      if (formData.batch && formData.paymentOption && formData.program) {
        const fee = await getFeeStructure(formData.batch, formData.paymentOption, formData.program);
        setFeeAsPerStructure(fee || 0);
        setFormData((p: any) => ({ ...p, feeAsPerStructure: fee || 0 }));
      }
    };
    void fetchFee();
  }, [formData.batch, formData.paymentOption, formData.program]);

  useEffect(() => {
    const fetchPayments = async () => {
      if (formData.enrollmentNo && formData.enrollmentNo.length > 3) {
        const result = await getPaymentsForEnrollment(formData.enrollmentNo);
        setRecdFee(result.total);
        setFormData((p: any) => ({ ...p, recdFee: result.total, modeOfPayment: result.modeOfPayment || p.modeOfPayment }));
      }
    };
    const timer = setTimeout(fetchPayments, 500);
    return () => clearTimeout(timer);
  }, [formData.enrollmentNo]);

  const scholarship = useMemo(() => {
    const feeAfterDisc = parseFloat(String(formData.semFeeAfterDisc ?? '')) || 0;
    return feeAsPerStructure - feeAfterDisc;
  }, [feeAsPerStructure, formData.semFeeAfterDisc]);

  const totalFee = useMemo(() => {
    const sem = parseInt(String(formData.currentSem ?? ''), 10) || 0;
    return sem * feeAsPerStructure;
  }, [formData.currentSem, feeAsPerStructure]);

  const pendingFee = useMemo(() => totalFee - recdFee, [totalFee, recdFee]);

  const category = useMemo(() => {
    if (pendingFee === 0) return 'Full Fee';
    if (pendingFee > 0) return 'Pending Fee';
    return 'Excess Fee';
  }, [pendingFee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setLoading(true);
    const payload = {
      ...formData,
      scholarship,
      totalFee,
      pendingFee,
      category,
      totalFeeWithDiscount: parseFloat(String(formData.totalFeeWithDiscount ?? '')) || null,
      semFeeAfterDisc: parseFloat(String(formData.semFeeAfterDisc ?? '')) || null,
      currentSem: parseInt(String(formData.currentSem ?? ''), 10) || null,
    };
    const res = await saveAdmissionForm(payload);
    setLoading(false);
    if (res.success) router.push('/admission-form');
    else alert('Error saving: ' + res.error);
  };

  const isReadOnly = !isAdmin;

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '1200px' }}>

      {/* ── Section 1: Basic Info ── */}
      <div style={sectionCardStyle}>
        <div style={sectionTitleStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Basic Information
        </div>
        <div style={gridStyle(3)}>
          <Field label="Date of Admission (dd-mm-yyyy)">
            <input type="text" name="doa" style={isReadOnly ? disabledInputStyle : inputStyle}
              placeholder="dd-mm-yyyy"
              value={formatDateForDisplay(formData.doa) || (typeof formData.doa === 'string' ? formData.doa : '')}
              onChange={handleChange} disabled={isReadOnly} />
          </Field>
          <Field label="Enrollment No (Triggers Payment Search)">
            <input type="text" name="enrollmentNo" style={isReadOnly ? disabledInputStyle : inputStyle}
              value={String(formData.enrollmentNo ?? '')} onChange={handleChange} required disabled={isReadOnly}
              placeholder="e.g. PGO26885540" />
          </Field>
          <Field label="Type">
            <select name="type" style={isReadOnly ? disabledInputStyle : selectStyle}
              value={String(formData.type ?? '')} onChange={handleChange} disabled={isReadOnly}>
              <option value="">Select</option>
              {DROPDOWNS.types.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <Field label="Program">
            <select name="program" style={isReadOnly ? disabledInputStyle : selectStyle}
              value={String(formData.program ?? '')} onChange={handleChange} disabled={isReadOnly}>
              <option value="">Select</option>
              {DROPDOWNS.programs.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Batch">
            <select name="batch" style={isReadOnly ? disabledInputStyle : selectStyle}
              value={String(formData.batch ?? '')} onChange={handleChange} disabled={isReadOnly}>
              <option value="">Select</option>
              {DROPDOWNS.batches.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Payment Option">
            <select name="paymentOption" style={isReadOnly ? disabledInputStyle : selectStyle}
              value={String(formData.paymentOption ?? '')} onChange={handleChange} disabled={isReadOnly}>
              <option value="">Select</option>
              {DROPDOWNS.paymentOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <Field label="Team">
            <select name="team" style={isReadOnly ? disabledInputStyle : selectStyle}
              value={String(formData.team ?? '')} onChange={handleChange} disabled={isReadOnly}>
              <option value="">Select</option>
              {DROPDOWNS.teams.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Bifurcation">
            <select name="bifurcation" style={isReadOnly ? disabledInputStyle : selectStyle}
              value={String(formData.bifurcation ?? '')} onChange={handleChange} disabled={isReadOnly}>
              <option value="">Select</option>
              {bifurcationOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Nationality">
            <select name="nationality" style={isReadOnly ? disabledInputStyle : selectStyle}
              value={String(formData.nationality ?? '')} onChange={handleChange} disabled={isReadOnly}>
              <option value="">Select</option>
              {DROPDOWNS.nationalities.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <Field label="Location">
            <select name="location" style={isReadOnly ? disabledInputStyle : selectStyle}
              value={String(formData.location ?? '')} onChange={handleChange} disabled={isReadOnly}>
              <option value="">Select</option>
              {locationOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" style={isReadOnly ? disabledInputStyle : selectStyle}
              value={String(formData.status ?? '')} onChange={handleChange} disabled={isReadOnly}>
              <option value="">Select</option>
              {DROPDOWNS.statuses.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Placed Status">
            <select name="placedStatus" style={isReadOnly ? disabledInputStyle : selectStyle}
              value={String(formData.placedStatus ?? '')} onChange={handleChange} disabled={isReadOnly}>
              <option value="">Select</option>
              {placementStatuses.map(o => (
                <option key={o.id} value={o.placedStatus.trim()}>
                  {o.placedStatus.trim()}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Mode of Payment (Auto-Fetched)" auto>
            <input type="text" name="modeOfPayment" style={disabledInputStyle}
              value={String(formData.modeOfPayment ?? '')} disabled />
          </Field>
        </div>
      </div>

      {/* ── Section 2: Fee Calculations ── */}
      <div style={sectionCardStyle}>
        <div style={sectionTitleStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9.5h4.5a2 2 0 0 1 0 4h-3a2 2 0 0 0 0 4H15"/></svg>
          Fee Calculations
        </div>
        <div style={gridStyle(4)}>
          <Field label="Fee as per Structure (Auto)" auto>
            <input type="text" style={disabledInputStyle} disabled value={`₹ ${feeAsPerStructure.toLocaleString()}`} />
          </Field>
          <Field label="Sem Fee after Disc. (Manual)">
            <input type="number" name="semFeeAfterDisc" style={isReadOnly ? disabledInputStyle : inputStyle}
              value={String(formData.semFeeAfterDisc ?? '')} onChange={handleChange} disabled={isReadOnly} placeholder="0" />
          </Field>
          <Field label="Scholarship (Auto)" auto>
            <input type="text" style={disabledInputStyle} disabled value={`₹ ${scholarship.toLocaleString()}`} />
          </Field>
          <Field label="Current Sem (Auto)" auto>
            <input type="text" style={disabledInputStyle} disabled value={String(formData.currentSem ?? '')} />
          </Field>

          <Field label="Total Fee (Auto)" auto>
            <input type="text" style={disabledInputStyle} disabled value={`₹ ${totalFee.toLocaleString()}`} />
          </Field>
          <Field label="Recd Fee (Auto-Fetched)" auto>
            <input type="text" style={{
              ...disabledInputStyle,
              color: 'var(--success)',
              borderColor: recdFee > 0 ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)',
              background: recdFee > 0 ? 'rgba(16,185,129,0.06)' : 'var(--bg-elevated)',
            }} disabled value={`₹ ${recdFee.toLocaleString()}`} />
          </Field>
          <Field label="Pending Fee (Auto)" auto>
            <input type="text" style={{
              ...disabledInputStyle,
              color: pendingFee > 0 ? 'var(--danger)' : pendingFee < 0 ? 'var(--warning)' : 'var(--success)',
              borderColor: pendingFee > 0 ? 'rgba(244,63,94,0.3)' : 'var(--border-subtle)',
            }} disabled value={`₹ ${pendingFee.toLocaleString()}`} />
          </Field>
          <Field label="Category (Auto)" auto>
            <input type="text" style={{
              ...disabledInputStyle,
              color: category === 'Full Fee' ? 'var(--success)' : category === 'Excess Fee' ? 'var(--warning)' : 'var(--danger)',
              fontWeight: 500,
            }} disabled value={category} />
          </Field>
        </div>
      </div>

      {/* ── Action Buttons ── */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' }}>
          <button type="button" className="btn-secondary" style={{ height: '40px', padding: '0 20px' }}
            onClick={() => router.push('/admission-form')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" style={{ height: '40px', padding: '0 28px' }} disabled={loading}>
            {loading ? <><Loader size="sm" color="white" /> Saving...</> : 'Save Admission Form'}
          </button>
        </div>
      )}
    </form>
  );
}
