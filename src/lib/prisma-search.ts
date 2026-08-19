import { Prisma } from '@/generated/prisma';

/** Build search filters for database model list pages. */
export function buildModelSearchWhere(
  modelName: string,
  q: string,
  _hasField?: (field: string) => boolean
): Record<string, unknown>[] {
  const term = q.trim();
  if (!term) return [];

  const model = Prisma.dmmf.datamodel.models.find(
    (m) => m.name.toLowerCase() === modelName.toLowerCase()
  );
  if (!model) return [];

  const field = (name: string) => model.fields.find((f) => f.name === name);
  const searchConditions: Record<string, unknown>[] = [];

  const transactionId = field('transactionId');
  if (transactionId?.kind === 'scalar' && transactionId.type === 'String') {
    searchConditions.push({ transactionId: { contains: term } });
  }

  const enrollment = field('enrollment');
  if (enrollment?.kind === 'scalar' && enrollment.type === 'String') {
    // e.g. Enrollment.enrollment text code
    searchConditions.push({ enrollment: { contains: term } });
  } else if (enrollment?.kind === 'object') {
    // Relation → Enrollment.enrollment
    searchConditions.push({ enrollment: { enrollment: { contains: term } } });
  }

  const enrollmentId = field('enrollmentId');
  if (enrollmentId?.kind === 'scalar' && /^\d+$/.test(term)) {
    searchConditions.push({ enrollmentId: Number(term) });
  }

  return searchConditions;
}
