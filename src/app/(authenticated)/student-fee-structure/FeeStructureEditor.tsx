'use client'

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DROPDOWNS } from '@/lib/constants';
import Loader from '@/components/Loader';
import { buildSemesterFeeRows } from '@/lib/student-fee-calculations';
import {
  calculateCouponScholarships,
  couponOptionLabel,
  listCouponOptions,
  COUPON_BY_CODE,
} from '@/lib/coupons';
import {
  getStudentFeeEnrollmentContext,
  saveStudentFeeStructure,
  updateCommissionPct,
} from './actions';

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '6px' };
const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-display)',
};
const autoLabelStyle: React.CSSProperties = { ...labelStyle, color: 'var(--success)' };

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

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

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

const Field = ({
  label,
  children,
  auto,
}: {
  label: string;
  children: React.ReactNode;
  auto?: boolean;
}) => (
  <div style={fieldStyle}>
    <label style={auto ? autoLabelStyle : labelStyle}>{label}</label>
    {children}
  </div>
);

const categoryColor: Record<string, string> = {
  Paid: 'var(--success)',
  Pending: 'var(--warning)',
  '-': 'var(--text-muted)',
};

export default function FeeStructureEditor({
  initialData,
  isAdmin,
}: {
  initialData?: any;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [formData, setFormData] = useState<any>(initialData || { id: 'new' });
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [admissionContext, setAdmissionContext] = useState<any>(null);
  const [commissionPct, setCommissionPct] = useState<number | null>(null);
  const [commissionTableId, setCommissionTableId] = useState<number | null>(null);
  const [totalPaid, setTotalPaid] = useState(0);
  const [commissionPaidTillDate, setCommissionPaidTillDate] = useState(0);

  const isReadOnly = !isAdmin;
  const maxSems = formData.type === 'PG' ? 4 : 6;

  const couponStudentCtx = useMemo(
    () => ({
      leadSource: admissionContext?.leadSource || '',
      team: admissionContext?.team || '',
      paymentOption: formData.paymentOption || admissionContext?.paymentOption || '',
      bifurcation: admissionContext?.bifurcation || '',
    }),
    [
      admissionContext?.leadSource,
      admissionContext?.team,
      admissionContext?.paymentOption,
      admissionContext?.bifurcation,
      formData.paymentOption,
    ]
  );

  const selectedCouponCodes = useMemo(
    () =>
      [formData.couponName, formData.couponName2, formData.couponName3]
        .map((c: string) => (c || '').trim())
        .filter(Boolean),
    [formData.couponName, formData.couponName2, formData.couponName3]
  );

  const couponOptions = useMemo(
    () => listCouponOptions(couponStudentCtx, selectedCouponCodes),
    [couponStudentCtx, selectedCouponCodes]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => {
      if (name === 'couponName' || name === 'couponName2' || name === 'couponName3') {
        const others = ['couponName', 'couponName2', 'couponName3'].filter((k) => k !== name);
        const duplicate = others.some((k) => (prev[k] || '') === value && value);
        if (duplicate) return prev;
      }
      return { ...prev, [name]: value };
    });
  };

  const loadEnrollmentContext = useCallback(async (enrollmentNo: string) => {
    const trimmed = enrollmentNo?.trim();
    if (!trimmed) {
      setAdmissionContext(null);
      setTotalPaid(0);
      return;
    }
    setContextLoading(true);
    try {
      const ctx = await getStudentFeeEnrollmentContext(trimmed);
      if (!ctx) return;
      setAdmissionContext(ctx);
      setTotalPaid(ctx.totalPaid);
      setCommissionPct(ctx.commissionPct);
      setCommissionTableId(ctx.commissionTableId);
      setCommissionPaidTillDate(ctx.commissionPaidTillDate ?? 0);

      if (ctx.found) {
        setFormData((prev: any) => {
          const next: any = {
            ...prev,
            enrollmentNo: ctx.enrollmentNo,
            program: ctx.program || prev.program,
            batch: ctx.batch || prev.batch,
            paymentOption: ctx.paymentOption || prev.paymentOption,
            type: ctx.type || prev.type,
            currentSem: ctx.currentSem || prev.currentSem,
          };
          // Auto-fill the saved semester fee structure for this enrollment.
          const fs: any = ctx.feeStructure;
          if (fs) {
            next.couponName = fs.couponName ?? next.couponName ?? '';
            next.couponName2 = fs.couponName2 ?? next.couponName2 ?? '';
            next.couponName3 = fs.couponName3 ?? next.couponName3 ?? '';
            // currentSem comes from batch mapping (admission context), not a form field
            if (ctx.currentSem) next.currentSem = ctx.currentSem;
            for (let i = 1; i <= 6; i++) {
              next[`sem${i}Fee`] = fs[`sem${i}Fee`] ?? '';
              next[`sem${i}Scholarship`] = fs[`sem${i}Scholarship`] ?? '';
            }
          }
          return next;
        });
      }
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialData?.enrollmentNo) return;
    const enrollmentNo = initialData.enrollmentNo;
    const timer = setTimeout(() => {
      void loadEnrollmentContext(enrollmentNo);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialData?.enrollmentNo, loadEnrollmentContext]);

  useEffect(() => {
    const trimmed = formData.enrollmentNo?.trim();
    if (!trimmed) return;
    const timer = setTimeout(() => loadEnrollmentContext(trimmed), 500);
    return () => clearTimeout(timer);
  }, [formData.enrollmentNo, loadEnrollmentContext]);

  const feeAfter = useMemo(() => {
    const calc = (feeStr: string, scholStr: string) => {
      const fee = parseFloat(feeStr) || 0;
      const schol = parseFloat(scholStr) || 0;
      return Math.max(0, fee - schol);
    };
    return {
      sem1: calc(formData.sem1Fee, formData.sem1Scholarship),
      sem2: calc(formData.sem2Fee, formData.sem2Scholarship),
      sem3: calc(formData.sem3Fee, formData.sem3Scholarship),
      sem4: calc(formData.sem4Fee, formData.sem4Scholarship),
      sem5: calc(formData.sem5Fee, formData.sem5Scholarship),
      sem6: calc(formData.sem6Fee, formData.sem6Scholarship),
    };
  }, [
    formData.sem1Fee, formData.sem1Scholarship,
    formData.sem2Fee, formData.sem2Scholarship,
    formData.sem3Fee, formData.sem3Scholarship,
    formData.sem4Fee, formData.sem4Scholarship,
    formData.sem5Fee, formData.sem5Scholarship,
    formData.sem6Fee, formData.sem6Scholarship,
  ]);

  const semFees = useMemo(
    () => [1, 2, 3, 4, 5, 6].map((s) => parseFloat(formData[`sem${s}Fee`]) || 0),
    [formData]
  );

  // Auto-fill scholarship from coupons (Overall → Annual → 1st Sem) when any coupon is selected.
  useEffect(() => {
    if (selectedCouponCodes.length === 0) return;
    const scholarships = calculateCouponScholarships({
      maxSems,
      semFees,
      couponCodes: [
        formData.couponName,
        formData.couponName2,
        formData.couponName3,
      ],
      student: couponStudentCtx,
    });
    const timer = setTimeout(() => {
      setFormData((prev: any) => {
        let changed = false;
        const next = { ...prev };
        for (let i = 1; i <= 6; i++) {
          const key = `sem${i}Scholarship`;
          const value = i <= maxSems ? String(scholarships[i - 1] ?? 0) : '';
          if (String(prev[key] ?? '') !== value) {
            next[key] = value;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [
    selectedCouponCodes,
    maxSems,
    semFees,
    couponStudentCtx,
    formData.couponName,
    formData.couponName2,
    formData.couponName3,
  ]);

  const semScholarships = useMemo(
    () => [1, 2, 3, 4, 5, 6].map((s) => parseFloat(formData[`sem${s}Scholarship`]) || 0),
    [formData]
  );

  const semesterRows = useMemo(
    () =>
      buildSemesterFeeRows({
        maxSems,
        semFees,
        semScholarships,
        totalPaid,
        commissionPct: commissionPct ?? 0,
        commissionPaidTillDate,
      }),
    [maxSems, semFees, semScholarships, totalPaid, commissionPct, commissionPaidTillDate]
  );

  const totalPaidDisplay = semesterRows.reduce((sum, r) => sum + r.feePaidTillDate, 0);
  const totalFeeStructure = semesterRows.reduce((sum, r) => sum + r.feeAsPerStructure, 0);
  const totalScholarship = semesterRows.reduce((sum, r) => sum + r.scholarship, 0);
  const totalFeeAfterDeduction = semesterRows.reduce((sum, r) => sum + r.feeAfterDeduction, 0);
  const totalCommissionAmount = semesterRows.reduce((sum, r) => sum + r.commissionAmount, 0);

  const handleCommissionChange = async (value: string) => {
    const pct = parseFloat(value);
    setCommissionPct(Number.isFinite(pct) ? pct : null);
    if (!isAdmin || !commissionTableId || !Number.isFinite(pct)) return;
    await updateCommissionPct({ commissionTableId, commissionPct: pct });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setLoading(true);

    const payload = {
      ...formData,
      sem1Fee: parseFloat(formData.sem1Fee) || null,
      sem2Fee: parseFloat(formData.sem2Fee) || null,
      sem3Fee: parseFloat(formData.sem3Fee) || null,
      sem4Fee: parseFloat(formData.sem4Fee) || null,
      sem5Fee: parseFloat(formData.sem5Fee) || null,
      sem6Fee: parseFloat(formData.sem6Fee) || null,
      sem1Scholarship: parseFloat(formData.sem1Scholarship) || null,
      sem2Scholarship: parseFloat(formData.sem2Scholarship) || null,
      sem3Scholarship: parseFloat(formData.sem3Scholarship) || null,
      sem4Scholarship: parseFloat(formData.sem4Scholarship) || null,
      sem5Scholarship: parseFloat(formData.sem5Scholarship) || null,
      sem6Scholarship: parseFloat(formData.sem6Scholarship) || null,
      sem1FeeAfter: feeAfter.sem1,
      sem2FeeAfter: feeAfter.sem2,
      sem3FeeAfter: feeAfter.sem3,
      sem4FeeAfter: feeAfter.sem4,
      sem5FeeAfter: feeAfter.sem5,
      sem6FeeAfter: feeAfter.sem6,
    };

    const res = await saveStudentFeeStructure(payload);
    setLoading(false);
    if (res.success) {
      router.push('/student-fee-structure');
    } else {
      alert('Error saving: ' + res.error);
    }
  };

  const formatCurrency = (val: number) =>
    val > 0 ? `₹ ${val.toLocaleString('en-IN')}` : '-';

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '1400px' }}>
      <div style={sectionCardStyle}>
        <div style={sectionTitleStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="7" r="4" />
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          </svg>
          Student Details
          {contextLoading && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
              Loading admission data...
            </span>
          )}
        </div>
        <div style={gridStyle(4)}>
          <Field label="Enrollment No">
            <input
              type="text"
              name="enrollmentNo"
              style={isReadOnly ? disabledInputStyle : inputStyle}
              value={formData.enrollmentNo || ''}
              onChange={handleChange}
              required
              disabled={isReadOnly}
              placeholder="e.g. PGO26885540"
            />
          </Field>
          <Field label="Type">
            <select
              name="type"
              style={isReadOnly ? disabledInputStyle : selectStyle}
              value={formData.type || ''}
              onChange={handleChange}
              disabled={isReadOnly}
            >
              <option value="">Select</option>
              {DROPDOWNS.types.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Program">
            <select
              name="program"
              style={isReadOnly ? disabledInputStyle : selectStyle}
              value={formData.program || ''}
              onChange={handleChange}
              disabled={isReadOnly}
            >
              <option value="">Select</option>
              {DROPDOWNS.programs.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Batch">
            <select
              name="batch"
              style={isReadOnly ? disabledInputStyle : selectStyle}
              value={formData.batch || ''}
              onChange={handleChange}
              disabled={isReadOnly}
            >
              <option value="">Select</option>
              {DROPDOWNS.batches.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>

          <Field label="Payment Option">
            <select
              name="paymentOption"
              style={isReadOnly ? disabledInputStyle : selectStyle}
              value={formData.paymentOption || ''}
              onChange={handleChange}
              disabled={isReadOnly}
            >
              <option value="">Select</option>
              {DROPDOWNS.paymentOptions.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Coupon Name">
            <select
              name="couponName"
              style={isReadOnly ? disabledInputStyle : selectStyle}
              value={formData.couponName || ''}
              onChange={handleChange}
              disabled={isReadOnly}
            >
              <option value="">Select coupon</option>
              {couponOptions.map((c) => (
                <option
                  key={c.code}
                  value={c.code}
                  disabled={
                    !c.eligible ||
                    [formData.couponName2, formData.couponName3].includes(c.code)
                  }
                >
                  {couponOptionLabel(c)}
                  {!c.eligible ? ' (not eligible)' : ''}
                </option>
              ))}
              {formData.couponName &&
                !COUPON_BY_CODE.has(formData.couponName) && (
                  <option value={formData.couponName}>{formData.couponName} (legacy)</option>
                )}
            </select>
          </Field>
          <Field label="Coupon Name 2">
            <select
              name="couponName2"
              style={isReadOnly ? disabledInputStyle : selectStyle}
              value={formData.couponName2 || ''}
              onChange={handleChange}
              disabled={isReadOnly}
            >
              <option value="">Select coupon</option>
              {couponOptions.map((c) => (
                <option
                  key={c.code}
                  value={c.code}
                  disabled={
                    !c.eligible ||
                    [formData.couponName, formData.couponName3].includes(c.code)
                  }
                >
                  {couponOptionLabel(c)}
                  {!c.eligible ? ' (not eligible)' : ''}
                </option>
              ))}
              {formData.couponName2 &&
                !COUPON_BY_CODE.has(formData.couponName2) && (
                  <option value={formData.couponName2}>{formData.couponName2} (legacy)</option>
                )}
            </select>
          </Field>
          <Field label="Coupon 3">
            <select
              name="couponName3"
              style={isReadOnly ? disabledInputStyle : selectStyle}
              value={formData.couponName3 || ''}
              onChange={handleChange}
              disabled={isReadOnly}
            >
              <option value="">Select coupon</option>
              {couponOptions.map((c) => (
                <option
                  key={c.code}
                  value={c.code}
                  disabled={
                    !c.eligible ||
                    [formData.couponName, formData.couponName2].includes(c.code)
                  }
                >
                  {couponOptionLabel(c)}
                  {!c.eligible ? ' (not eligible)' : ''}
                </option>
              ))}
              {formData.couponName3 &&
                !COUPON_BY_CODE.has(formData.couponName3) && (
                  <option value={formData.couponName3}>{formData.couponName3} (legacy)</option>
                )}
            </select>
          </Field>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
          Current Sem: {formData.currentSem || admissionContext?.currentSem || '-'}
          {selectedCouponCodes.length > 0
            ? ' · Scholarship auto-applies Overall → Annual → 1st Sem'
            : ''}
        </p>
      </div>

      <div style={sectionCardStyle}>
        <div style={sectionTitleStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Admission & Commission (from AdmissionForm)
        </div>
        <div style={gridStyle(5)}>
          <Field label="Status" auto>
            <input type="text" style={disabledInputStyle} value={admissionContext?.status || '-'} disabled />
          </Field>
          <Field label="Bifurcation" auto>
            <input type="text" style={disabledInputStyle} value={admissionContext?.bifurcation || '-'} disabled />
          </Field>
          <Field label="Lead Source" auto>
            <input type="text" style={disabledInputStyle} value={admissionContext?.leadSource || '-'} disabled />
          </Field>
          <Field label="Commission %">
            <input
              type="number"
              step="0.01"
              style={isReadOnly ? disabledInputStyle : inputStyle}
              value={commissionPct ?? ''}
              onChange={(e) => handleCommissionChange(e.target.value)}
              disabled={isReadOnly || !commissionTableId}
              placeholder={commissionTableId ? 'Enter %' : 'No payout row'}
            />
          </Field>
          <Field label="Payment Source" auto>
            <input type="text" style={disabledInputStyle} value={admissionContext?.paymentSource || '-'} disabled />
          </Field>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
          Total fee received (ConsolidatedPayment): {formatCurrency(totalPaid)}
        </p>
      </div>

      <div style={sectionCardStyle}>
        <div style={sectionTitleStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v12M9 9.5h4.5a2 2 0 0 1 0 4h-3a2 2 0 0 0 0 4H15" />
          </svg>
          Semester-wise Fee, Payments & Commission
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1100px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '12px 8px', ...labelStyle }}>Semester</th>
                <th style={{ padding: '12px 8px', ...labelStyle }}>Fee As per Structure</th>
                <th style={{ padding: '12px 8px', ...labelStyle }}>Scholarship</th>
                <th style={{ padding: '12px 8px', ...autoLabelStyle }}>Fee After Deduction</th>
                <th style={{ padding: '12px 8px', ...autoLabelStyle }}>Fee Paid Till Date</th>
                <th style={{ padding: '12px 8px', ...autoLabelStyle }}>Category</th>
                <th style={{ padding: '12px 8px', ...labelStyle }}>Commission %</th>
                <th style={{ padding: '12px 8px', ...autoLabelStyle }}>Commission Amount</th>
                <th style={{ padding: '12px 8px', ...autoLabelStyle }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {semesterRows.map((row) => (
                <tr key={row.sem} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>
                    Sem {row.sem}
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="number"
                      name={`sem${row.sem}Fee`}
                      style={isReadOnly ? disabledInputStyle : inputStyle}
                      value={formData[`sem${row.sem}Fee`] || ''}
                      onChange={handleChange}
                      disabled={isReadOnly}
                      placeholder="0"
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="number"
                      name={`sem${row.sem}Scholarship`}
                      style={
                        isReadOnly || selectedCouponCodes.length > 0
                          ? disabledInputStyle
                          : inputStyle
                      }
                      value={formData[`sem${row.sem}Scholarship`] || ''}
                      onChange={handleChange}
                      disabled={isReadOnly || selectedCouponCodes.length > 0}
                      placeholder="0"
                      title={
                        selectedCouponCodes.length > 0
                          ? 'Auto-calculated from selected coupons (Overall → Annual → 1st Sem)'
                          : undefined
                      }
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="text"
                      style={{ ...disabledInputStyle, color: 'var(--success)' }}
                      value={formatCurrency(row.feeAfterDeduction)}
                      disabled
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="text"
                      style={disabledInputStyle}
                      value={formatCurrency(row.feePaidTillDate)}
                      disabled
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '12px',
                        color: categoryColor[row.category] || 'var(--text-primary)',
                      }}
                    >
                      {row.category}
                    </span>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="text"
                      style={disabledInputStyle}
                      value={commissionPct != null ? `${commissionPct}%` : '-'}
                      disabled
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="text"
                      style={{ ...disabledInputStyle, color: 'var(--accent)' }}
                      value={formatCurrency(row.commissionAmount)}
                      disabled
                    />
                  </td>
                  <td style={{ padding: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {row.commissionStatus}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-medium)' }}>
                <td style={{ padding: '12px 8px', fontWeight: 700 }}>Total</td>
                <td style={{ padding: '12px 8px', fontWeight: 700 }}>
                  {formatCurrency(totalFeeStructure)}
                </td>
                <td style={{ padding: '12px 8px', fontWeight: 700 }}>
                  {formatCurrency(totalScholarship)}
                </td>
                <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--success)' }}>
                  {formatCurrency(totalFeeAfterDeduction)}
                </td>
                <td style={{ padding: '12px 8px', fontWeight: 700 }}>
                  {formatCurrency(totalPaidDisplay)}
                </td>
                <td colSpan={2} />
                <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--accent)' }}>
                  {formatCurrency(totalCommissionAmount)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <p style={{ margin: '12px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
          Category rules: Fee after deduction = Fee paid till date → Paid; Fee after deduction &gt; Fee paid till date → Pending.
          Fee paid is allocated across semesters from ConsolidatedPayment totals.
        </p>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ height: '40px', padding: '0 20px' }}
            onClick={() => router.push('/student-fee-structure')}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            style={{ height: '40px', padding: '0 28px' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader size="sm" color="white" /> Saving...
              </>
            ) : (
              'Save Fee Structure'
            )}
          </button>
        </div>
      )}
    </form>
  );
}
