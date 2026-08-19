import { prisma } from '@/lib/prisma';
import { parseDateInput } from '@/lib/dates';

export const CONSOLIDATED_PAYOUT_CATEGORIES = [
  'CP',
  'DS',
  'HP',
  'Incentive',
  'Referral',
  'Corp Inst',
] as const;

type PayoutCategory = (typeof CONSOLIDATED_PAYOUT_CATEGORIES)[number];

function parseNumber(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).replace(/[,\s₹%]/g, '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Prefer percent values like 50 / "50%" over fractions like文本到 .5 for display/edit. */
function parseCommissionPct(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const hasPercentSign = text.includes('%');
  const parsed = parseNumber(text);
  if (parsed == null) return null;
  if (hasPercentSign) return parsed;
  // Fractions from legacy uploads (0.49 => 49)
  if (parsed > 0 && parsed <= 1) return parsed * 100;
  return parsed;
}

function pick(row: Record<string, unknown>, keys: string[]) {
  const normalized = new Map<string, string>();
  for (const key of Object.keys(row)) {
    normalized.set(key.toLowerCase().replace(/[^a-z0-9]/g, ''), key);
  }

  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const original = normalized.get(normalizedKey);
    if (!original) continue;
    const value = row[original];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
}

function normalizeCategory(value: unknown): PayoutCategory | null {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  const found = CONSOLIDATED_PAYOUT_CATEGORIES.find((item) => item.toLowerCase() === raw);
  return found ?? null;
}

export async function processConsolidatedPayoutUpload(
  rows: Record<string, unknown>[],
  categoryOverride?: string | null
) {
  const overrideCategory = normalizeCategory(categoryOverride);
  let saved = 0;

  for (const row of rows) {
    const enrollmentId = parseNumber(pick(row, ['Enrollment Id', 'enrollment_id', 'enrollmentId']));
    if (!enrollmentId || enrollmentId <= 0) continue;

    const payoutAmount =
      parseNumber(pick(row, ['Pay Out', 'payoutAmount', 'payout_amount', 'amount'])) ?? 0;
    const leadSourceCode = parseNumber(
      pick(row, ['LeadSource_Code', 'leadSourceCode', 'lead_source_code'])
    );
    const commissionPct = parseCommissionPct(
      pick(row, ['Commission %', 'commissionPct', 'commission_pct'])
    );

    const rowCategory = normalizeCategory(pick(row, ['Category', 'category']));
    const category = overrideCategory ?? rowCategory;
    const doa = parseDateInput(pick(row, ['DOA', 'doa']));
    const releasedOn = parseDateInput(pick(row, ['Released On', 'released_on', 'releasedOn']));

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO consolidated_payout
          (enrollment_id, lead_source_code, payout_amount, invoice_no, payout_month, category, commission_pct, doa, reco_status, released_on, remarks, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        enrollmentId,
        leadSourceCode,
        payoutAmount,
        pick(row, ['Invoice no.', 'Invoice No', 'invoice_no'])?.toString() ?? null,
        pick(row, ['Month', 'month'])?.toString() ?? null,
        category,
        commissionPct,
        doa,
        pick(row, ['Reco Status', 'reco_status', 'status'])?.toString() ?? null,
        releasedOn,
        pick(row, ['Remarks', 'remarks'])?.toString() ?? null
      );
      saved += 1;
    } catch (error) {
      console.error('Failed to insert consolidated payout row', { row, error });
    }
  }

  return saved;
}
