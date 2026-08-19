import {
  FALLBACK_LATEST_BATCH_ID,
  maxSemestersForType,
  readSemesterField,
  currentSemForBatch,
  type StudentFeeDetailedSummary,
} from '@/lib/student-fee-calculations';

export type StudentStatusFilter =
  | 'pursuing'
  | 'passout'
  | 'refund'
  | 'cancelled'
  | 'pursuing-passout';

export const STUDENT_STATUS_FILTERS: { id: StudentStatusFilter; label: string }[] = [
  { id: 'pursuing-passout', label: 'Pursuing & Passout' },
  { id: 'pursuing', label: 'Pursuing' },
  { id: 'passout', label: 'Passout' },
  { id: 'refund', label: 'Refund' },
  { id: 'cancelled', label: 'Cancelled' },
];

export const STATUS_IDS_BY_FILTER: Record<StudentStatusFilter, number[]> = {
  pursuing: [2],
  passout: [1],
  refund: [4],
  cancelled: [3],
  'pursuing-passout': [1, 2],
};

export {
  BATCH_CURRENT_SEM,
  FALLBACK_LATEST_BATCH_ID,
  currentSemForBatch,
  isAtMaxSemester,
  maxSemestersForType,
} from '@/lib/student-fee-calculations';

export async function resolveLatestBatchId(
  query: <T = unknown>(sql: string) => Promise<T>
): Promise<number> {
  const rows = (await query(`SELECT MAX(batch) AS m FROM AdmissionForm`)) as Array<{
    m: number | bigint | null;
  }>;
  const max = Number(rows?.[0]?.m);
  return Number.isFinite(max) && max > 0 ? max : FALLBACK_LATEST_BATCH_ID;
}

export function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type ConsolidatedFeeMisRow = {
  batch: string;
  batchId: number;
  type: string;
  currentSem: number;
  /** When UG+PG are merged, show both semester labels */
  currentSemLabel?: string;
  studentCount: number;
  feeStructure: number;
  feeCurrentSem: number;
  recdTillDate: number;
  pending: number;
  grossFee: number;
  scholarshipCurrentSem: number;
  grossScholarship: number;
  /** UG / PG breakdown for expandable batch rows */
  children?: ConsolidatedFeeMisRow[];
};

export type ConsolidatedFeeMisTotals = Omit<
  ConsolidatedFeeMisRow,
  'batch' | 'batchId' | 'type' | 'currentSem'
>;

export function emptyConsolidatedFeeMisTotals(): ConsolidatedFeeMisTotals {
  return {
    studentCount: 0,
    feeStructure: 0,
    feeCurrentSem: 0,
    recdTillDate: 0,
    pending: 0,
    grossFee: 0,
    scholarshipCurrentSem: 0,
    grossScholarship: 0,
  };
}

export function addConsolidatedFeeMisTotals(
  target: ConsolidatedFeeMisTotals,
  summary: StudentFeeDetailedSummary & { feeStructurePerSem: number }
) {
  target.feeStructure += summary.feeStructurePerSem;
  target.feeCurrentSem += summary.feeCurrentSem;
  target.recdTillDate += summary.recdTillDate;
  target.pending += summary.pending;
  target.grossFee += summary.grossFee;
  target.scholarshipCurrentSem += summary.scholarshipCurrentSem;
  target.grossScholarship += summary.grossScholarship;
}

export function buildStudentConsolidatedSummary(input: {
  batchCurrentSem: number;
  type: string;
  typeId?: number | null;
  baseSemFee: number;
  studentFeeRow: Record<string, unknown>;
  totalPaid: number;
}) {
  const batchCurrentSem = Math.max(0, input.batchCurrentSem || 0);
  const maxSems = maxSemestersForType(input.type, input.typeId);
  const feeStructurePerSem = input.baseSemFee;
  const perSemScholarship =
    batchCurrentSem > 0
      ? readSemesterField(input.studentFeeRow, 'Scholarship', batchCurrentSem)
      : readSemesterField(input.studentFeeRow, 'Scholarship', 1);

  const feeCurrentSem = batchCurrentSem * feeStructurePerSem;
  const grossFee = maxSems * feeStructurePerSem;
  const scholarshipCurrentSem = batchCurrentSem * perSemScholarship;
  const grossScholarship = maxSems * perSemScholarship;
  const recdTillDate = Math.max(0, input.totalPaid || 0);
  const pending = feeCurrentSem - recdTillDate;

  return {
    feeStructurePerSem,
    feeCurrentSem,
    recdTillDate,
    pending,
    grossFee,
    scholarshipCurrentSem,
    grossScholarship,
  };
}

export function createConsolidatedFeeMisRow(
  batch: string,
  batchId: number,
  type: string,
  typeId?: number | null,
  latestBatchId?: number
): ConsolidatedFeeMisRow {
  return {
    batch,
    batchId,
    type,
    currentSem: currentSemForBatch(batchId, type, typeId, latestBatchId),
    ...emptyConsolidatedFeeMisTotals(),
  };
}
