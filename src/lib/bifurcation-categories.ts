export const BIFURCATION_CATEGORY_FILTERS = [
  'Channel Partner',
  'Corporate',
  'DS',
  'HP',
  'Insides',
  'International',
  'Referral',
] as const;

export type BifurcationCategory = (typeof BIFURCATION_CATEGORY_FILTERS)[number];

export function parseCategoryFilter(value: string | null | undefined): string {
  if (!value) return '';
  const normalized = value.trim();
  return BIFURCATION_CATEGORY_FILTERS.includes(normalized as BifurcationCategory)
    ? normalized
    : '';
}

/** SQL fragment filtering AdmissionForm rows by bifurcation category name. */
export function sqlCategoryFilterForAdmission(
  admissionAlias = 'af',
  category?: string | null
): string {
  const parsed = parseCategoryFilter(category);
  if (!parsed) return '';
  const escaped = parsed.replace(/'/g, "''");
  return `AND EXISTS (
    SELECT 1 FROM Bifurcation bif_cat
    WHERE bif_cat.id = ${admissionAlias}.bifurcation
      AND TRIM(bif_cat.bifurcation) = '${escaped}'
  )`;
}

/** SQL fragment filtering ConsolidatedPayment rows via linked admission bifurcation. */
export function sqlCategoryFilterForPayment(
  category?: string | null,
  paymentAlias = 'cp'
): string {
  const parsed = parseCategoryFilter(category);
  if (!parsed) return '';
  const escaped = parsed.replace(/'/g, "''");
  return `AND EXISTS (
    SELECT 1
    FROM Enrollment e_cat
    INNER JOIN AdmissionForm af_cat ON af_cat.enrollment_no = e_cat.id
    INNER JOIN Bifurcation bif_cat ON bif_cat.id = af_cat.bifurcation
    WHERE e_cat.id = ${paymentAlias}.enrollmentId
      AND TRIM(bif_cat.bifurcation) = '${escaped}'
  )`;
}
