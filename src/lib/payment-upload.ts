import { prisma } from '@/lib/prisma';
import { prismaDelegate } from '@/lib/prisma-delegate';
import { ensureEnrollmentId } from '@/lib/lookups';
import { ENROLLMENT_TABLE } from '@/lib/enrollment-source';
import { parseDateInput, parseDateInputDmy } from '@/lib/dates';
import type { PaymentUploadSlug } from '@/lib/payment-sources';
import { getPaymentSource } from '@/lib/payment-sources';
import { upsertLegacyPaymentRow, upsertNormalizedRawPaymentRow, usesLegacyPaymentSchema, usesNormalizedRawPaymentSchema } from '@/lib/legacy-payment-tables';

const ID_CHUNK = 500;

function sqlQuote(value: string) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function queryEnrollmentIdsInChunks(ids: number[]): Promise<Set<number>> {
  const found = new Set<number>();
  if (ids.length === 0) return found;
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK);
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM \`${ENROLLMENT_TABLE}\` WHERE id IN (${chunk.join(',')})`
    );
    for (const row of rows) found.add(Number(row.id));
  }
  return found;
}

async function loadEnrollmentTextMap(enrollmentIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (enrollmentIds.length === 0) return map;
  const unique = [...new Set(enrollmentIds)];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK);
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; enrollment: string }>>(
      `SELECT id, enrollment FROM \`${ENROLLMENT_TABLE}\` WHERE id IN (${chunk.join(',')})`
    );
    for (const row of rows) map.set(Number(row.id), String(row.enrollment));
  }
  return map;
}

async function loadEnrollmentIdsByText(texts: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (texts.length === 0) return map;
  const unique = [...new Set(texts.map((t) => t.trim()).filter(Boolean))];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK);
    const inList = chunk.map(sqlQuote).join(',');
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; enrollment: string }>>(
      `SELECT id, enrollment FROM \`${ENROLLMENT_TABLE}\` WHERE enrollment IN (${inList})`
    );
    for (const row of rows) map.set(String(row.enrollment), Number(row.id));
  }
  return map;
}

export function firstRowValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

const ENROLLMENT_ID_KEYS = [
  'enrollment_id',
  'enrollmentId',
  'Enrollment_Id',
  'Enrollment ID',
  'Enrollment_ID',
  'Enrollment_No',
  'Enrollment No',
];

const ENROLLMENT_TEXT_KEYS = ['Enrollment', 'EnrollmentNo', 'enrollmentNo', 'enrollment_no'];

/** True when CSV marks a payment for reconciliation (no enrollment yet). */
export function isRecoEnrollmentRef(row: Record<string, unknown>): boolean {
  const idRaw = firstRowValue(row, ENROLLMENT_ID_KEYS);
  if (idRaw !== null && String(idRaw).trim().toLowerCase() === 'reco') return true;
  const textRaw = firstRowValue(row, ENROLLMENT_TEXT_KEYS);
  if (textRaw !== null && String(textRaw).trim().toLowerCase() === 'reco') return true;
  return false;
}

/** Prefer numeric enrollment_id; fall back to enrollment text for legacy CSVs. */
export function parseEnrollmentRefFromRow(row: Record<string, unknown>): {
  kind: 'id' | 'text';
  value: string;
} | null {
  if (isRecoEnrollmentRef(row)) return null;

  const idRaw = firstRowValue(row, ENROLLMENT_ID_KEYS);
  if (idRaw !== null) {
    const s = String(idRaw).trim();
    if (s && s.toLowerCase() !== 'reco') return { kind: 'id', value: s };
  }
  const textRaw = firstRowValue(row, ENROLLMENT_TEXT_KEYS);
  if (textRaw !== null) {
    const s = String(textRaw).trim();
    if (s && s.toLowerCase() !== 'reco') return { kind: 'text', value: s };
  }
  return null;
}

export async function loadValidEnrollmentIds(numericIds: number[]): Promise<Set<number>> {
  return queryEnrollmentIdsInChunks(numericIds);
}

/** batch from legacy AdmissionForm.enrollment_no → batch */
export async function loadBatchIdByEnrollment(enrollmentIds: number[]): Promise<Map<number, number | null>> {
  const map = new Map<number, number | null>();
  if (enrollmentIds.length === 0) return map;
  const unique = [...new Set(enrollmentIds)];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK);
    const forms = await prisma.$queryRawUnsafe<Array<{ enrollment_no: number; batch: number | null }>>(`
      SELECT enrollment_no, batch
      FROM AdmissionForm
      WHERE enrollment_no IN (${chunk.join(',')})
    `);
    for (const form of forms) {
      map.set(Number(form.enrollment_no), form.batch != null ? Number(form.batch) : null);
    }
  }
  return map;
}

export type PaymentUploadContext = {
  validNumericIds: Set<number>;
  textToEnrollmentId: Map<string, number>;
  batchByEnrollment: Map<number, number | null>;
  enrollmentTextById: Map<number, string>;
  legacySchema: boolean;
  normalizedRawSchema: boolean;
  sourceLabel: string;
  mapsToEnrollment: boolean;
};

export async function preparePaymentUploadContext(
  rows: Record<string, unknown>[],
  slug: PaymentUploadSlug
): Promise<PaymentUploadContext> {
  const source = getPaymentSource(slug)!;

  // Misc is collection-only — never resolve or create enrollments.
  if (!source.mapsToEnrollment) {
    const [legacySchema, normalizedRawSchema] = await Promise.all([
      usesLegacyPaymentSchema(source.delegate),
      usesNormalizedRawPaymentSchema(source.delegate),
    ]);
    return {
      validNumericIds: new Set(),
      textToEnrollmentId: new Map(),
      batchByEnrollment: new Map(),
      enrollmentTextById: new Map(),
      legacySchema,
      normalizedRawSchema,
      sourceLabel: source.label,
      mapsToEnrollment: false,
    };
  }

  const numericIds: number[] = [];
  const textRefs: string[] = [];

  for (const row of rows) {
    const ref = parseEnrollmentRefFromRow(row);
    if (!ref) continue;
    if (ref.kind === 'id' && /^\d+$/.test(ref.value)) {
      numericIds.push(parseInt(ref.value, 10));
    } else {
      textRefs.push(ref.value);
    }
  }

  const validNumericIds = await queryEnrollmentIdsInChunks(numericIds);
  const textToEnrollmentId = await loadEnrollmentIdsByText(textRefs);

  for (const text of textRefs) {
    const trimmed = text.trim();
    if (!textToEnrollmentId.has(trimmed)) {
      const id = await ensureEnrollmentId(trimmed);
      if (id != null) {
        textToEnrollmentId.set(trimmed, id);
        validNumericIds.add(id);
      }
    }
  }

  const allEnrollmentIds = [...validNumericIds];
  const [batchByEnrollment, enrollmentTextById] = await Promise.all([
    loadBatchIdByEnrollment(allEnrollmentIds),
    loadEnrollmentTextMap(allEnrollmentIds),
  ]);

  const [legacySchema, normalizedRawSchema] = await Promise.all([
    usesLegacyPaymentSchema(source.delegate),
    usesNormalizedRawPaymentSchema(source.delegate),
  ]);

  return {
    validNumericIds,
    textToEnrollmentId,
    batchByEnrollment,
    enrollmentTextById,
    legacySchema,
    normalizedRawSchema,
    sourceLabel: source.label,
    mapsToEnrollment: true,
  };
}

/** Resolved enrollment id, or null for reco / unknown (Reco tab). */
export function resolveEnrollmentIdForPaymentRow(
  row: Record<string, unknown>,
  ctx: Pick<PaymentUploadContext, 'validNumericIds' | 'textToEnrollmentId'>
): number | null {
  if (isRecoEnrollmentRef(row)) return null;

  const ref = parseEnrollmentRefFromRow(row);
  if (!ref) return null;

  if (ref.kind === 'id' && /^\d+$/.test(ref.value)) {
    const id = parseInt(ref.value, 10);
    return ctx.validNumericIds.has(id) ? id : null;
  }

  return ctx.textToEnrollmentId.get(ref.value.trim()) ?? null;
}

export function getBatchIdForEnrollment(
  enrollmentId: number | null,
  batchByEnrollment: Map<number, number | null>
): number | null {
  if (!enrollmentId) return null;
  return batchByEnrollment.get(enrollmentId) ?? null;
}

/** Parse optional integer tenure from payment CSV row. */
export function parseTenureFromRow(row: Record<string, unknown>): number | null {
  const raw = firstRowValue(row, ['tenure', 'Tenure', 'TENURE']);
  if (raw === null) return null;
  const parsed = parseInt(String(raw).trim(), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

const TRANSACTION_ID_KEYS = [
  'Settlement UTR / Transaction ID',
  'TransactionId',
  'transactionId',
  'Transaction ID',
  'Transaction Id',
  'transaction_id',
];

const AMOUNT_KEYS = [
  'Transaction Amount (₹)',
  'Transaction Amount (â,¹)',
  'Transaction Amount',
  'Amount',
  'amount',
];

const DATE_KEYS = [
  'Date',
  'date',
  'Payment Date',
  'paymentDate',
  'payment_date',
  'Created At',
  'created_at',
  'Transaction Date',
  'transactionDate',
  'transaction_date',
];

export function parseTransactionIdFromRow(row: Record<string, unknown>): string | null {
  const raw = firstRowValue(row, TRANSACTION_ID_KEYS);
  if (raw === null) return null;
  const tx = String(raw).trim();
  return tx ? tx : null;
}

export function parseAmountFromRow(row: Record<string, unknown>): number {
  let amountStr = firstRowValue(row, AMOUNT_KEYS) ?? '0';
  if (typeof amountStr === 'string') {
    amountStr = amountStr.replace(/,/g, '');
  }
  return parseFloat(String(amountStr)) || 0;
}

const DMY_DATE_SOURCES = new Set<PaymentUploadSlug>(['propelld', 'jodo', 'razorpay', 'early']);

export function parsePaymentDateFromRow(
  row: Record<string, unknown>,
  slug?: PaymentUploadSlug
) {
  const raw = firstRowValue(row, DATE_KEYS);
  if (slug && DMY_DATE_SOURCES.has(slug)) {
    return parseDateInputDmy(raw);
  }
  return parseDateInput(raw);
}

/** Keep last row per transactionId (dedupe within upload batch/file). */
export function dedupeRowsByTransactionId<T extends Record<string, unknown>>(
  rows: T[]
): { rows: T[]; duplicateCount: number } {
  const byTx = new Map<string, T>();
  let duplicateCount = 0;
  for (const row of rows) {
    const tx = parseTransactionIdFromRow(row);
    if (!tx) continue;
    if (byTx.has(tx)) duplicateCount++;
    byTx.set(tx, row);
  }
  return { rows: [...byTx.values()], duplicateCount };
}

export type PaymentRowPayload = {
  transactionId: string;
  amount: number;
  date: ReturnType<typeof parseDateInput>;
  enrollmentId: number | null;
  enrollmentText: string | null;
  batchId: number | null;
  mode: string | null;
  discountedCourseFee: number | null;
  firstEmi: number | null;
  tenure: number | null;
  description: string | null;
};

export function buildPaymentPayloadFromRow(
  row: Record<string, unknown>,
  ctx: PaymentUploadContext,
  slug?: PaymentUploadSlug
): PaymentRowPayload | null {
  const transactionId = parseTransactionIdFromRow(row);
  if (!transactionId) return null;

  // Misc (and any non-enrollment source): store collection only.
  if (!ctx.mapsToEnrollment) {
    const descRaw = firstRowValue(row, ['Description', 'description', 'Remarks', 'remarks', 'Narration', 'narration']);
    return {
      transactionId,
      amount: parseAmountFromRow(row),
      date: parsePaymentDateFromRow(row, slug),
      enrollmentId: null,
      enrollmentText: null,
      batchId: null,
      mode: (row.Mode ?? row.mode ?? null) as string | null,
      discountedCourseFee: null,
      firstEmi: null,
      tenure: null,
      description: descRaw != null ? String(descRaw).trim() || null : null,
    };
  }

  const enrollmentId = resolveEnrollmentIdForPaymentRow(row, ctx);
  const batchId = getBatchIdForEnrollment(enrollmentId, ctx.batchByEnrollment);

  let enrollmentText: string | null = null;
  if (enrollmentId != null) {
    enrollmentText = ctx.enrollmentTextById.get(enrollmentId) ?? String(enrollmentId);
  } else {
    const raw = firstRowValue(row, ENROLLMENT_ID_KEYS) ?? firstRowValue(row, ENROLLMENT_TEXT_KEYS);
    enrollmentText = raw != null ? String(raw).trim() : null;
  }

  const discounted = parseFloat(String(row['Discounted Course Fee'] ?? '').replace(/,/g, '')) || 0;
  const firstEmi = parseFloat(String(row['1st EMI'] ?? '').replace(/,/g, '')) || 0;

  return {
    transactionId,
    amount: parseAmountFromRow(row),
    date: parsePaymentDateFromRow(row, slug),
    enrollmentId,
    enrollmentText,
    batchId,
    mode: (row.Mode ?? row.mode ?? null) as string | null,
    discountedCourseFee: discounted || null,
    firstEmi: firstEmi || null,
    tenure: parseTenureFromRow(row),
    description: null,
  };
}

export async function upsertPaymentRecords(
  slug: PaymentUploadSlug,
  payload: PaymentRowPayload,
  ctx: PaymentUploadContext
) {
  const source = getPaymentSource(slug);
  if (!source) throw new Error(`Unknown payment source: ${slug}`);

  // MiscPayment has no enrollment / batch / EMI columns.
  // Do NOT write to ConsolidatedPayment — keeps Reco tab clean and avoids
  // student fee / enrollment mapping. Overall collection MIS reads MiscPayment directly.
  if (!ctx.mapsToEnrollment) {
    const miscData = {
      amount: payload.amount,
      date: payload.date,
      mode: payload.mode,
      description: payload.description,
    };
    await prisma.miscPayment.upsert({
      where: { transactionId: payload.transactionId },
      update: miscData,
      create: { transactionId: payload.transactionId, ...miscData },
    });
    return;
  }

  const commonData = {
    amount: payload.amount,
    date: payload.date,
    enrollmentId: payload.enrollmentId,
    mode: payload.mode,
    batchId: payload.batchId,
    discountedCourseFee: payload.discountedCourseFee,
    firstEmi: payload.firstEmi,
    tenure: payload.tenure,
  };

  if (ctx.legacySchema) {
    await upsertLegacyPaymentRow(source.delegate, {
      transactionId: payload.transactionId,
      amount: payload.amount,
      date: payload.date,
      enrollmentId: payload.enrollmentId,
      enrollmentText: payload.enrollmentText,
      batchId: payload.batchId,
      mode: payload.mode,
      discountedCourseFee: payload.discountedCourseFee,
      firstEmi: payload.firstEmi,
      tenure: payload.tenure,
    });
  } else if (ctx.normalizedRawSchema) {
    await upsertNormalizedRawPaymentRow(source.delegate, {
      transactionId: payload.transactionId,
      amount: payload.amount,
      date: payload.date,
      enrollmentId: payload.enrollmentId,
      batchId: payload.batchId,
      mode: payload.mode,
      discountedCourseFee: payload.discountedCourseFee,
      firstEmi: payload.firstEmi,
      tenure: payload.tenure,
    });
  } else {
    const delegate = prismaDelegate(source.delegate);
    await delegate.upsert({
      where: { transactionId: payload.transactionId },
      update: commonData,
      create: { transactionId: payload.transactionId, ...commonData },
    });
  }

  await prisma.consolidatedPayment.upsert({
    where: { transactionId: payload.transactionId },
    update: { ...commonData, sourceName: ctx.sourceLabel },
    create: { transactionId: payload.transactionId, ...commonData, sourceName: ctx.sourceLabel },
  });
}

export async function processPaymentUpload(
  slug: PaymentUploadSlug,
  rows: Record<string, unknown>[]
): Promise<number> {
  const { rows: dedupedRows } = dedupeRowsByTransactionId(rows);
  const ctx = await preparePaymentUploadContext(dedupedRows, slug);
  let count = 0;

  for (const row of dedupedRows) {
    const payload = buildPaymentPayloadFromRow(row, ctx, slug);
    if (!payload) continue;
    await upsertPaymentRecords(slug, payload, ctx);
    count++;
  }

  return count;
}
