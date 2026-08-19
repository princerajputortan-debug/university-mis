export type SemesterFeeRow = {
  sem: number;
  feeAsPerStructure: number;
  scholarship: number;
  feeAfterDeduction: number;
  feePaidTillDate: number;
  category: 'Paid' | 'Pending' | '-';
  commissionPct: number;
  commissionAmount: number;
  commissionStatus: string;
};

export function calcFeeAfterDeduction(fee: number, scholarship: number): number {
  return Math.max(0, fee - scholarship);
}

/** Allocate cumulative payments across semesters in order (waterfall). */
export function allocatePaymentsAcrossSemesters(
  feeAfterPerSem: number[],
  totalPaid: number
): number[] {
  let remaining = Math.max(0, totalPaid);
  return feeAfterPerSem.map((feeAfter) => {
    const allocated = Math.min(remaining, feeAfter);
    remaining -= allocated;
    return allocated;
  });
}

export function feeCategory(
  feeAfterDeduction: number,
  feePaidTillDate: number
): 'Paid' | 'Pending' | '-' {
  if (feeAfterDeduction <= 0) return '-';
  if (feePaidTillDate >= feeAfterDeduction) return 'Paid';
  return 'Pending';
}

export function commissionStatusForSem(
  feeAfterDeduction: number,
  feePaidTillDate: number,
  category: 'Paid' | 'Pending' | '-',
  commissionAmount: number,
  commissionPaidAllocated: number
): string {
  if (feeAfterDeduction <= 0 || feePaidTillDate <= 0) return 'Not eligible';
  if (category === 'Pending') return 'Not eligible';
  if (commissionAmount <= 0) return 'Not eligible';
  // Mark paid once consolidated_payout covers this semester's commission (small tolerance)
  if (commissionPaidAllocated + 0.01 >= commissionAmount) return 'Paid';
  if (commissionPaidAllocated > 0) return 'Partially paid';
  return 'Pending to pay';
}

export function calcCommissionAmount(feePaidTillDate: number, commissionPct: number): number {
  const pct = commissionPct > 1 ? commissionPct / 100 : commissionPct;
  return Math.round(feePaidTillDate * pct * 100) / 100;
}

export function maxSemestersForType(typeLabel: string, typeId?: number | null): number {
  const t = (typeLabel || '').trim().toUpperCase();
  if (t === 'UG' || typeId === 2) return 6; // UG max
  return 4; // PG max
}

/**
 * Newest batch that has admission data is Sem 1; older batches step up by 1 each.
 * When Batch 10 starts, Batch 10 → Sem 1 and Batch 9 → Sem 2, etc.
 * Capped at UG=6 / PG=4.
 */
export const FALLBACK_LATEST_BATCH_ID = 9;

export function currentSemForBatch(
  batchId: number | bigint,
  typeLabel: string,
  typeId?: number | null,
  latestBatchId: number = FALLBACK_LATEST_BATCH_ID
): number {
  const id = Number(batchId) || 0;
  if (id <= 0) return 1;
  const latest = Math.max(1, Number(latestBatchId) || FALLBACK_LATEST_BATCH_ID);
  const maxSems = maxSemestersForType(typeLabel, typeId);
  const progressed = Math.max(1, latest - id + 1);
  return Math.min(progressed, maxSems);
}

/** True when current semester has hit the UG/PG max (eligible for Passout). */
export function isAtMaxSemester(
  batchId: number | bigint,
  typeLabel: string,
  typeId?: number | null,
  latestBatchId: number = FALLBACK_LATEST_BATCH_ID
): boolean {
  const maxSems = maxSemestersForType(typeLabel, typeId);
  return currentSemForBatch(batchId, typeLabel, typeId, latestBatchId) >= maxSems;
}

/** Snapshot map for the given latest batch (docs / scripts). */
export function buildBatchCurrentSemMap(
  latestBatchId: number = FALLBACK_LATEST_BATCH_ID
): Record<number, { UG: number; PG: number }> {
  const map: Record<number, { UG: number; PG: number }> = {};
  for (let id = 1; id <= latestBatchId; id++) {
    map[id] = {
      UG: currentSemForBatch(id, 'UG', 2, latestBatchId),
      PG: currentSemForBatch(id, 'PG', 1, latestBatchId),
    };
  }
  return map;
}

/** @deprecated Prefer currentSemForBatch(); kept as snapshot for latest=FALLBACK. */
export const BATCH_CURRENT_SEM = buildBatchCurrentSemMap(FALLBACK_LATEST_BATCH_ID);

export function batchIdFromLabel(batch: string | null | undefined): number {
  if (!batch) return 0;
  const match = batch.trim().match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function readSemesterField(
  row: Record<string, unknown>,
  field: 'Fee' | 'Scholarship',
  sem: number
): number {
  if (sem < 1 || sem > 6) return 0;
  const key = field === 'Fee' ? `sem${sem}Fee` : `sem${sem}Scholarship`;
  const raw = row[key];
  if (raw == null) return 0;
  if (typeof raw === 'bigint') return Number(raw);
  return Number(raw) || 0;
}

export type StudentFeeDetailedSummary = {
  feeStructurePerSem: number;
  feeCurrentSem: number;
  recdTillDate: number;
  pending: number;
  grossFee: number;
  scholarshipCurrentSem: number;
  grossScholarship: number;
};

export function buildStudentFeeDetailedSummary(input: {
  currentSem: number;
  type: string;
  typeId?: number | null;
  baseSemFee: number;
  perSemScholarship: number;
  totalPaid: number;
}): StudentFeeDetailedSummary {
  const currentSem = Math.max(0, input.currentSem || 0);
  const maxSems = maxSemestersForType(input.type, input.typeId);
  const feeStructurePerSem = input.baseSemFee;
  const feeCurrentSem = currentSem * feeStructurePerSem;
  const recdTillDate = Math.max(0, input.totalPaid || 0);
  const pending = feeCurrentSem - recdTillDate;
  const grossFee = maxSems * feeStructurePerSem;
  const scholarshipCurrentSem = currentSem * input.perSemScholarship;
  const grossScholarship = maxSems * input.perSemScholarship;

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

export function buildSemesterFeeRows(input: {
  maxSems: number;
  semFees: number[];
  semScholarships: number[];
  totalPaid: number;
  commissionPct: number;
  /** Total commission already released (from consolidated_payout). */
  commissionPaidTillDate?: number;
}): SemesterFeeRow[] {
  const feeAfter = input.semFees.map((fee, i) =>
    calcFeeAfterDeduction(fee, input.semScholarships[i] ?? 0)
  );
  const paidAlloc = allocatePaymentsAcrossSemesters(
    feeAfter.slice(0, input.maxSems),
    input.totalPaid
  );

  const draft = [];
  for (let i = 0; i < input.maxSems; i++) {
    const feeAfterDeduction = feeAfter[i] ?? 0;
    const feePaidTillDate = paidAlloc[i] ?? 0;
    const category = feeCategory(feeAfterDeduction, feePaidTillDate);
    const commissionAmount =
      category === 'Paid'
        ? calcCommissionAmount(feePaidTillDate, input.commissionPct)
        : 0;
    draft.push({
      sem: i + 1,
      feeAsPerStructure: input.semFees[i] ?? 0,
      scholarship: input.semScholarships[i] ?? 0,
      feeAfterDeduction,
      feePaidTillDate,
      category,
      commissionPct: input.commissionPct,
      commissionAmount,
    });
  }

  // Waterfall allocate released commission across eligible paid semesters
  const eligibleAmounts = draft.map((row) =>
    row.category === 'Paid' && row.commissionAmount > 0 ? row.commissionAmount : 0
  );
  const commissionPaidAlloc = allocatePaymentsAcrossSemesters(
    eligibleAmounts,
    Math.max(0, input.commissionPaidTillDate ?? 0)
  );

  const rows: SemesterFeeRow[] = draft.map((row, i) => ({
    ...row,
    commissionStatus: commissionStatusForSem(
      row.feeAfterDeduction,
      row.feePaidTillDate,
      row.category,
      row.commissionAmount,
      commissionPaidAlloc[i] ?? 0
    ),
  }));
  return rows;
}
