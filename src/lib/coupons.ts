export type CouponFrequency = 'overall' | 'annual' | 'first_sem';
export type CouponEligibilityType = 'General' | 'DS' | 'CSC' | 'Ambuja' | 'Shobit';

export type CouponDefinition = {
  code: string;
  frequency: CouponFrequency;
  type: CouponEligibilityType;
  /** Flat discount in ₹; mutually exclusive with percent */
  amountInr?: number;
  /** Percent of remaining fee after earlier coupons in the sequence */
  percent?: number;
};

/** Apply Overall → Annual → 1st Sem */
export const FREQUENCY_ORDER: CouponFrequency[] = ['overall', 'annual', 'first_sem'];

export const FREQUENCY_LABEL: Record<CouponFrequency, string> = {
  overall: 'Overall',
  annual: 'Annual',
  first_sem: '1st Sem',
};

/** Full catalog (28 coupons) from business table. */
export const COUPON_CATALOG: CouponDefinition[] = [
  { code: 'RES3000', frequency: 'first_sem', type: 'General', amountInr: 3000 },
  { code: 'RES3500', frequency: 'first_sem', type: 'General', amountInr: 3500 },
  { code: 'DS-EARLYBIRDOFFE2K', frequency: 'first_sem', type: 'DS', amountInr: 2000 },
  { code: 'DS-EARLYBIRDOFFE1K', frequency: 'first_sem', type: 'DS', amountInr: 1000 },
  { code: 'FIRSTSEM15', frequency: 'first_sem', type: 'General', percent: 15 },
  { code: 'FIRSTSEM10', frequency: 'first_sem', type: 'General', percent: 10 },
  { code: 'ANNUAL5', frequency: 'annual', type: 'General', percent: 5 },
  { code: 'HP30OFF', frequency: 'overall', type: 'General', percent: 30 },
  { code: 'CSC30', frequency: 'overall', type: 'CSC', percent: 30 },
  { code: 'LUMSUM10', frequency: 'overall', type: 'General', percent: 10 },
  { code: 'EMP50', frequency: 'overall', type: 'General', percent: 50 },
  { code: 'DEFENCE50', frequency: 'overall', type: 'General', percent: 50 },
  { code: '100% Consession', frequency: 'overall', type: 'General', percent: 100 },
  { code: 'CONVERSION5K', frequency: 'overall', type: 'General', amountInr: 5000 },
  { code: 'CSC_CORP45', frequency: 'overall', type: 'CSC', percent: 45 },
  { code: 'FEE-RECOVERY', frequency: 'overall', type: 'General', percent: 10 },
  { code: 'AMBUJA_STU40', frequency: 'overall', type: 'Ambuja', percent: 40 },
  { code: 'CRED_CONVERSION7350', frequency: 'overall', type: 'General', amountInr: 7350 },
  { code: 'HP25OFF', frequency: 'overall', type: 'General', percent: 25 },
  { code: 'CSC25', frequency: 'overall', type: 'CSC', percent: 25 },
  { code: 'MILIFESTYLE30KOFF', frequency: 'overall', type: 'DS', amountInr: 30000 },
  { code: 'DS-EARLYBIRDOFFER', frequency: 'overall', type: 'DS', percent: 10 },
  { code: 'HERBALIFE15', frequency: 'overall', type: 'DS', percent: 15 },
  { code: 'SHOBHIT_CORP25', frequency: 'overall', type: 'Shobit', percent: 25 },
  { code: 'DSREC10', frequency: 'overall', type: 'DS', percent: 10 },
  { code: 'MERIT10', frequency: 'overall', type: 'DS', percent: 10 },
  { code: 'AMBUJA_EMP15', frequency: 'overall', type: 'Ambuja', percent: 15 },
  { code: 'CSC40', frequency: 'overall', type: 'CSC', percent: 40 },
];

export const COUPON_BY_CODE = new Map(COUPON_CATALOG.map((c) => [c.code, c]));

export type CouponStudentContext = {
  leadSource?: string | null;
  team?: string | null;
  paymentOption?: string | null;
  bifurcation?: string | null;
};

function norm(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export function isCouponEligible(
  coupon: CouponDefinition,
  ctx: CouponStudentContext
): boolean {
  if (coupon.type === 'General') return true;

  const lead = norm(ctx.leadSource);
  const team = norm(ctx.team);
  const payment = norm(ctx.paymentOption);
  const bifurcation = norm(ctx.bifurcation);
  const blob = `${lead} ${team} ${payment} ${bifurcation}`;

  switch (coupon.type) {
    case 'DS':
      return (
        includesAny(payment, ['direct selling', 'directselling']) ||
        includesAny(team, ['direct selling']) ||
        includesAny(bifurcation, ['ds']) ||
        includesAny(lead, ['ds ', ' ds', 'direct selling']) ||
        /\bds\b/.test(blob)
      );
    case 'CSC':
      return includesAny(blob, ['csc']);
    case 'Ambuja':
      return includesAny(blob, ['ambuja']);
    case 'Shobit':
      return includesAny(blob, ['shobit', 'shobhit']);
    default:
      return false;
  }
}

export function couponAppliesToSemester(
  frequency: CouponFrequency,
  semester: number,
  maxSems: number
): boolean {
  if (semester < 1 || semester > maxSems) return false;
  if (frequency === 'first_sem') return semester === 1;
  if (frequency === 'annual') return semester === 1 || semester === 2;
  return true; // overall
}

function frequencyRank(frequency: CouponFrequency): number {
  return FREQUENCY_ORDER.indexOf(frequency);
}

/** Resolve selected codes → definitions, ordered Overall → Annual → 1st Sem. */
export function orderCouponsForCalculation(codes: Array<string | null | undefined>): CouponDefinition[] {
  const seen = new Set<string>();
  const defs: CouponDefinition[] = [];
  for (const raw of codes) {
    const code = (raw || '').trim();
    if (!code || seen.has(code)) continue;
    const def = COUPON_BY_CODE.get(code);
    if (!def) continue;
    seen.add(code);
    defs.push(def);
  }
  return defs.sort((a, b) => {
    const byFreq = frequencyRank(a.frequency) - frequencyRank(b.frequency);
    if (byFreq !== 0) return byFreq;
    return COUPON_CATALOG.indexOf(a) - COUPON_CATALOG.indexOf(b);
  });
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Sequential discount: Overall → Annual → 1st Sem.
 * Each coupon is applied on the remaining fee after earlier coupons.
 * Returns per-semester scholarship amounts (length = maxSems, padded to 6 with 0).
 */
export function calculateCouponScholarships(input: {
  maxSems: number;
  semFees: number[];
  couponCodes: Array<string | null | undefined>;
  student: CouponStudentContext;
  /** If true, skip coupons that fail eligibility (default true). */
  enforceEligibility?: boolean;
}): number[] {
  const maxSems = Math.max(1, Math.min(6, input.maxSems || 6));
  const enforce = input.enforceEligibility !== false;
  const coupons = orderCouponsForCalculation(input.couponCodes).filter((c) =>
    enforce ? isCouponEligible(c, input.student) : true
  );

  const scholarships = Array.from({ length: 6 }, () => 0);

  for (let i = 0; i < maxSems; i++) {
    const sem = i + 1;
    const fee = Math.max(0, Number(input.semFees[i]) || 0);
    let remaining = fee;
    let discount = 0;

    for (const coupon of coupons) {
      if (!couponAppliesToSemester(coupon.frequency, sem, maxSems)) continue;
      if (remaining <= 0) break;

      let slice = 0;
      if (coupon.amountInr != null && coupon.amountInr > 0) {
        slice = Math.min(coupon.amountInr, remaining);
      } else if (coupon.percent != null && coupon.percent > 0) {
        slice = Math.min(remaining, (remaining * coupon.percent) / 100);
      }
      slice = roundMoney(slice);
      discount = roundMoney(discount + slice);
      remaining = roundMoney(Math.max(0, remaining - slice));
    }

    scholarships[i] = Math.min(fee, discount);
  }

  return scholarships;
}

export function couponOptionLabel(coupon: CouponDefinition): string {
  const value =
    coupon.amountInr != null
      ? `₹${coupon.amountInr.toLocaleString('en-IN')}`
      : `${coupon.percent}%`;
  return `${coupon.code} · ${FREQUENCY_LABEL[coupon.frequency]} · ${coupon.type} · ${value}`;
}

export function listCouponOptions(ctx: CouponStudentContext, selectedCodes: string[] = []) {
  const selected = new Set(selectedCodes.map((c) => c.trim()).filter(Boolean));
  return COUPON_CATALOG.map((c) => ({
    ...c,
    eligible: selected.has(c.code) || isCouponEligible(c, ctx),
  }));
}
