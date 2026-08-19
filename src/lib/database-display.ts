type RelationLabel = { [key: string]: string | undefined };

export type ModelDisplayConfig = {
  include?: Record<string, boolean>;
  formatRow: (row: Record<string, unknown>) => Record<string, unknown>;
};

function relLabel(row: Record<string, unknown>, relation: string, field: string): string {
  const rel = row[relation] as RelationLabel | null | undefined;
  const value = rel?.[field];
  return value != null ? String(value) : '';
}

export const MODEL_DISPLAY_CONFIG: Record<string, ModelDisplayConfig> = {
  feeStructure: {
    include: { batch: true, paymentOption: true, program: true },
    formatRow: (row) => ({
      id: row.id,
      batch: relLabel(row, 'batch', 'batch'),
      paymentOption: relLabel(row, 'paymentOption', 'paymentOption'),
      program: relLabel(row, 'program', 'program'),
      semFee: row.semFee,
    }),
  },
  leadSourcePayout: {
    include: { enrollment: true, leadSource: true },
    formatRow: (row) => ({
      id: row.id,
      enrollmentId: row.enrollmentId,
      enrollmentNo: relLabel(row, 'enrollment', 'enrollment'),
      leadSourceId: row.leadSourceId,
      leadSource: relLabel(row, 'leadSource', 'lead'),
      commissionPct: row.commissionPct,
      payoutAmount: row.payoutAmount,
      invoiceNo: row.invoiceNo,
      month: row.month,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  },
  leadSourcePayoutSummary: {
    include: { enrollment: true, leadSource: true },
    formatRow: (row) => ({
      id: row.id,
      enrollmentId: row.enrollmentId,
      enrollmentNo: relLabel(row, 'enrollment', 'enrollment'),
      leadSourceId: row.leadSourceId,
      leadSource: relLabel(row, 'leadSource', 'lead'),
      payoutPaid: row.payoutPaid,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  },
  studentFeeStructure: {
    include: {
      batch: true,
      paymentOption: true,
      program: true,
      enrollment: true,
      type: true,
    },
    formatRow: (row) => ({
      id: row.id,
      enrollmentNo: relLabel(row, 'enrollment', 'enrollment'),
      batch: relLabel(row, 'batch', 'batch'),
      paymentOption: relLabel(row, 'paymentOption', 'paymentOption'),
      program: relLabel(row, 'program', 'program'),
      type: relLabel(row, 'type', 'type'),
      couponName: row.couponName,
      couponName2: row.couponName2,
      currentSem: row.currentSem,
      sem1Fee: row.sem1Fee,
      sem2Fee: row.sem2Fee,
      sem3Fee: row.sem3Fee,
      sem4Fee: row.sem4Fee,
      sem5Fee: row.sem5Fee,
      sem6Fee: row.sem6Fee,
      sem1Scholarship: row.sem1Scholarship,
      sem2Scholarship: row.sem2Scholarship,
      sem3Scholarship: row.sem3Scholarship,
      sem4Scholarship: row.sem4Scholarship,
      sem5Scholarship: row.sem5Scholarship,
      sem6Scholarship: row.sem6Scholarship,
      sem1FeeAfter: row.sem1FeeAfter,
      sem2FeeAfter: row.sem2FeeAfter,
      sem3FeeAfter: row.sem3FeeAfter,
      sem4FeeAfter: row.sem4FeeAfter,
      sem5FeeAfter: row.sem5FeeAfter,
      sem6FeeAfter: row.sem6FeeAfter,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
  },
};

export function getModelDisplayConfig(modelName: string): ModelDisplayConfig | undefined {
  return MODEL_DISPLAY_CONFIG[modelName];
}

export function formatModelRows(
  modelName: string,
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  const config = getModelDisplayConfig(modelName);
  if (!config) return rows;
  return rows.map((row) => config.formatRow(row));
}
