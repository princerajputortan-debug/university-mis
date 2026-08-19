/**
 * Batch Fee & Commission MIS — field map from requirements:
 * Total student        → DISTINCT enrollment_id from consolidated_payout
 * Total fee            → Gross Fee
 * Total Current fee    → Fee till Sem
 * Fee Collected        → Fee Collected
 * Total Comission      → Total commission payable
 * Comission paid       → Commission paid
 * Lead Source / Batch  → dropdown filters
 */
import {
  buildSemesterFeeRows,
  currentSemForBatch,
  maxSemestersForType,
  readSemesterField,
} from '@/lib/student-fee-calculations';
import { toNumber } from '@/lib/consolidated-fee-mis';

export type BatchFeeCommissionMisRow = {
  batchId: number;
  batch: string;
  studentCount: number;
  totalFee: number;
  totalCurrentFee: number;
  feeCollected: number;
  totalCommissionPayable: number;
  commissionPaid: number;
};

export type BatchFeeCommissionMisTotals = Omit<BatchFeeCommissionMisRow, 'batchId' | 'batch'>;

export function emptyBatchFeeCommissionTotals(): BatchFeeCommissionMisTotals {
  return {
    studentCount: 0,
    totalFee: 0,
    totalCurrentFee: 0,
    feeCollected: 0,
    totalCommissionPayable: 0,
    commissionPaid: 0,
  };
}

export function createBatchFeeCommissionRow(
  batchId: number,
  batch: string
): BatchFeeCommissionMisRow {
  return {
    batchId,
    batch,
    ...emptyBatchFeeCommissionTotals(),
  };
}

function normalizePct(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 0;
  const n = Number(raw);
  if (n <= 0) return 0;
  // Stored as fraction (0.1) or percent (10)
  return n > 0 && n <= 1 ? n * 100 : n;
}

/**
 * Per-student rollup matching Consolidated Fee MIS + semester commission rules.
 */
export function summarizeStudentForBatchFeeCommission(input: {
  batchId: number;
  typeLabel: string;
  typeId: number | null;
  latestBatchId: number;
  baseSemFee: number;
  studentFeeRow: Record<string, unknown>;
  totalPaid: number;
  commissionPct: number | null;
  commissionPaid: number;
}) {
  const typeLabel =
    input.typeLabel.trim().toUpperCase() === 'UG'
      ? 'UG'
      : input.typeLabel.trim().toUpperCase() === 'PG'
        ? 'PG'
        : input.typeId === 2
          ? 'UG'
          : 'PG';
  const maxSems = maxSemestersForType(typeLabel, input.typeId);
  const currentSem = currentSemForBatch(
    input.batchId,
    typeLabel,
    input.typeId,
    input.latestBatchId
  );
  const baseSemFee = Math.max(0, input.baseSemFee || 0);

  const semFees: number[] = [];
  const semScholarships: number[] = [];
  for (let sem = 1; sem <= maxSems; sem++) {
    const fromRow = readSemesterField(input.studentFeeRow, 'Fee', sem);
    semFees.push(fromRow > 0 ? fromRow : baseSemFee);
    semScholarships.push(readSemesterField(input.studentFeeRow, 'Scholarship', sem));
  }

  const totalFee = maxSems * baseSemFee;
  const totalCurrentFee = currentSem * baseSemFee;
  const feeCollected = Math.max(0, input.totalPaid || 0);
  const commissionPct = normalizePct(input.commissionPct);
  const commissionPaid = Math.max(0, input.commissionPaid || 0);

  const semesterRows = buildSemesterFeeRows({
    maxSems,
    semFees,
    semScholarships,
    totalPaid: feeCollected,
    commissionPct,
    commissionPaidTillDate: commissionPaid,
  });
  const totalCommissionPayable = semesterRows.reduce((sum, row) => sum + row.commissionAmount, 0);

  return {
    totalFee,
    totalCurrentFee,
    feeCollected,
    totalCommissionPayable,
    commissionPaid,
  };
}

export function addStudentToBatchRow(
  row: BatchFeeCommissionMisRow,
  summary: ReturnType<typeof summarizeStudentForBatchFeeCommission>
) {
  // studentCount comes from DISTINCT consolidated_payout.enrollment_id, not this rollup
  row.totalFee += summary.totalFee;
  row.totalCurrentFee += summary.totalCurrentFee;
  row.feeCollected += summary.feeCollected;
  row.totalCommissionPayable += summary.totalCommissionPayable;
  row.commissionPaid += summary.commissionPaid;
}

export { toNumber };
