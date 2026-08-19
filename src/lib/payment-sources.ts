/** Payment upload types → ConsolidatedPayment.sourceName */
export const PAYMENT_SOURCES = {
  razorpay: {
    slug: 'razorpay',
    label: 'Razorpay',
    delegate: 'razorpayPayment' as const,
    mapsToEnrollment: true,
    writesToConsolidated: true,
  },
  jodo: {
    slug: 'jodo',
    label: 'Jodo',
    delegate: 'jodoPayment' as const,
    mapsToEnrollment: true,
    writesToConsolidated: true,
  },
  early: {
    slug: 'early',
    label: 'Early',
    delegate: 'earlyPayment' as const,
    mapsToEnrollment: true,
    writesToConsolidated: true,
  },
  propelld: {
    slug: 'propelld',
    label: 'Propelld',
    delegate: 'propelldPayment' as const,
    mapsToEnrollment: true,
    writesToConsolidated: true,
  },
  offline: {
    slug: 'offline',
    label: 'Offline',
    delegate: 'offlinePayment' as const,
    mapsToEnrollment: true,
    writesToConsolidated: true,
  },
  bank: {
    slug: 'bank',
    label: 'Bank',
    delegate: 'bankPayment' as const,
    mapsToEnrollment: true,
    writesToConsolidated: true,
  },
  others: {
    slug: 'others',
    label: 'Corp Inst',
    delegate: 'othersPayment' as const,
    mapsToEnrollment: true,
    writesToConsolidated: true,
  },
  /** Overall-collection only; never mapped to student enrollment; not written to ConsolidatedPayment. */
  misc: {
    slug: 'misc',
    label: 'Misc',
    delegate: 'miscPayment' as const,
    mapsToEnrollment: false,
    writesToConsolidated: false,
  },
} as const;

export type PaymentUploadSlug = keyof typeof PAYMENT_SOURCES;

export const PRIMARY_PAYMENT_SLUGS: PaymentUploadSlug[] = [
  'razorpay',
  'jodo',
  'propelld',
  'early',
];

export function getPaymentSource(slug: string) {
  return PAYMENT_SOURCES[slug as PaymentUploadSlug] ?? null;
}

/** Labels used in ConsolidatedPayment.sourceName and overall collection dashboards */
export const PAYMENT_SOURCE_LABELS = Object.values(PAYMENT_SOURCES).map((s) => s.label);

/** Sources that can map to student enrollment (fee MIS / per-student filters). */
export const ENROLLMENT_MAPPED_PAYMENT_SOURCE_LABELS = Object.values(PAYMENT_SOURCES)
  .filter((s) => s.mapsToEnrollment)
  .map((s) => s.label);

export const OVERALL_COLLECTION_SOURCE_LABELS = [...PAYMENT_SOURCE_LABELS];

export function parsePaymentSourceFilter(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase();
  // Legacy alias: "Others" was renamed to "Corp Inst"
  if (normalized === 'others') return PAYMENT_SOURCES.others.label;
  return PAYMENT_SOURCE_LABELS.find((label) => label.toLowerCase() === normalized) ?? null;
}

/** Student fee MIS should only offer enrollment-mapped sources. */
export function parseEnrollmentMappedPaymentSourceFilter(
  value: string | null | undefined
): string | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'others') return PAYMENT_SOURCES.others.label;
  return (
    ENROLLMENT_MAPPED_PAYMENT_SOURCE_LABELS.find((label) => label.toLowerCase() === normalized) ??
    null
  );
}
