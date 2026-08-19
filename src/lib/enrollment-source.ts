import { prisma } from '@/lib/prisma';

/** Canonical enrollment table (Prisma `Enrollment` model). */
export const ENROLLMENT_TABLE = 'Enrollment';

export function enrollmentJoinSql(
  admissionAlias: string,
  enrollmentFkColumn = 'enrollment_no'
): string {
  return `LEFT JOIN \`${ENROLLMENT_TABLE}\` e ON e.id = ${admissionAlias}.${enrollmentFkColumn}`;
}

export function enrollmentJoinOnNumericId(
  tableAlias: string,
  idColumn: string
): string {
  return `LEFT JOIN \`${ENROLLMENT_TABLE}\` e ON e.id = ${tableAlias}.\`${idColumn}\``;
}

/** Join legacy payment enrollment_id column (numeric id or enrollment text). */
export function legacyPaymentEnrollmentJoinSql(paymentAlias: string): string {
  return `LEFT JOIN \`${ENROLLMENT_TABLE}\` e ON (
    (${paymentAlias}.enrollment_id REGEXP '^[0-9]+$' AND e.id = CAST(${paymentAlias}.enrollment_id AS UNSIGNED))
    OR e.enrollment COLLATE utf8mb4_unicode_ci = ${paymentAlias}.enrollment_id COLLATE utf8mb4_unicode_ci
  )`;
}

export async function getEnrollmentTextById(enrollmentId: number): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ enrollment: string }>>(
    `SELECT enrollment FROM \`${ENROLLMENT_TABLE}\` WHERE id = ? LIMIT 1`,
    enrollmentId
  );
  if (rows[0]?.enrollment) return String(rows[0].enrollment);
  const row = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { enrollment: true },
  });
  return row?.enrollment ?? String(enrollmentId);
}

export async function findLegacyAdmissionFormIdByEnrollment(
  enrollmentId: number
): Promise<number | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: bigint }>>(
    `SELECT id FROM AdmissionForm WHERE enrollment_no = ? LIMIT 1`,
    enrollmentId
  );
  return rows[0] != null ? Number(rows[0].id) : null;
}

export async function usesLegacyAdmissionFormSchema(): Promise<boolean> {
  const cols = await prisma.$queryRawUnsafe<Array<{ Field: string }>>(
    'SHOW COLUMNS FROM AdmissionForm'
  );
  const names = new Set(cols.map((c) => c.Field));
  return names.has('enrollment_no') && names.has('date_of_admission') && !names.has('enrollmentId');
}
