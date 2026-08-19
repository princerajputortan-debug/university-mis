import { prisma } from '@/lib/prisma';
import { enrollmentJoinOnNumericId } from '@/lib/enrollment-source';

const LEGACY_PAYMENT_MODELS = new Set([
  'razorpayPayment',
  'jodoPayment',
  'earlyPayment',
  'propelldPayment',
  'offlinePayment',
  'bankPayment',
  'othersPayment',
]);

const TX_LEGACY = 'settlement_utr_/_transaction_id';

const columnCache = new Map<string, Set<string>>();
const amountColumnCache = new Map<string, string>();
const normalizedColsCache = new Map<string, NormalizedPaymentCols>();

type NormalizedPaymentCols = {
  transactionId: string;
  enrollmentId: string;
  amount: string;
  batchId: string;
  discountedCourseFee: string;
  firstEmi: string;
  tenure: string;
};

function colByLower(cols: Set<string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  return [...cols].find((c) => c.toLowerCase() === lower);
}

async function getNormalizedPaymentCols(table: string): Promise<NormalizedPaymentCols> {
  if (normalizedColsCache.has(table)) return normalizedColsCache.get(table)!;
  const cols = await getTableColumns(table);
  const transactionId = colByLower(cols, 'transactionId');
  const amount = colByLower(cols, 'amount');
  if (!transactionId || !amount) {
    throw new Error(`Missing normalized payment columns on ${table}`);
  }
  const resolved: NormalizedPaymentCols = {
    transactionId,
    enrollmentId: colByLower(cols, 'enrollmentId') ?? 'enrollmentId',
    amount,
    batchId: colByLower(cols, 'batchId') ?? 'batchId',
    discountedCourseFee: colByLower(cols, 'discountedCourseFee') ?? 'discountedCourseFee',
    firstEmi: colByLower(cols, 'firstEmi') ?? 'firstEmi',
    tenure: colByLower(cols, 'tenure') ?? 'tenure',
  };
  normalizedColsCache.set(table, resolved);
  return resolved;
}

export async function usesNormalizedRawPaymentSchema(modelName: string): Promise<boolean> {
  if (!isLegacyPaymentModel(modelName)) return false;
  if (await usesLegacyPaymentSchema(modelName)) return false;
  const table = legacyPaymentTableName(modelName);
  const cols = await getTableColumns(table);
  const txLower = colByLower(cols, 'transactionId');
  const amountLower = colByLower(cols, 'amount');
  if (!txLower || !amountLower) return false;
  return !cols.has('transactionId');
}

export async function usesPaymentRawQueries(modelName: string): Promise<boolean> {
  return (
    (await usesLegacyPaymentSchema(modelName)) ||
    (await usesNormalizedRawPaymentSchema(modelName))
  );
}

export function isLegacyPaymentModel(modelName: string): boolean {
  return LEGACY_PAYMENT_MODELS.has(modelName);
}

export function legacyPaymentTableName(modelName: string): string {
  return modelName.charAt(0).toUpperCase() + modelName.slice(1);
}

async function getTableColumns(table: string): Promise<Set<string>> {
  if (columnCache.has(table)) return columnCache.get(table)!;
  const cols = await prisma.$queryRawUnsafe<Array<{ Field: string }>>(
    `SHOW COLUMNS FROM \`${table}\``
  );
  const set = new Set(cols.map((c) => c.Field));
  columnCache.set(table, set);
  return set;
}

export async function usesLegacyPaymentSchema(modelName: string): Promise<boolean> {
  if (!isLegacyPaymentModel(modelName)) return false;
  const table = legacyPaymentTableName(modelName);
  const cols = await getTableColumns(table);
  return cols.has(TX_LEGACY) && !cols.has('transactionId');
}

async function getAmountColumn(table: string): Promise<string> {
  if (amountColumnCache.has(table)) return amountColumnCache.get(table)!;
  const cols = await getTableColumns(table);
  const amountCol = [...cols].find((c) => c.toLowerCase().startsWith('transaction_amount'));
  if (!amountCol) throw new Error(`No amount column on ${table}`);
  amountColumnCache.set(table, amountCol);
  return amountCol;
}

export async function getLegacyPaymentAmountColumn(modelName: string): Promise<string> {
  return getAmountColumn(legacyPaymentTableName(modelName));
}

export type LegacyPaymentUpsertPayload = {
  transactionId: string;
  amount: number;
  date: Date | null;
  enrollmentId: number | null;
  enrollmentText: string | null;
  batchId: number | null;
  mode: string | null;
  discountedCourseFee: number | null;
  firstEmi: number | null;
  tenure: number | null;
};

export async function upsertLegacyPaymentRow(
  modelName: string,
  payload: LegacyPaymentUpsertPayload
) {
  const table = legacyPaymentTableName(modelName);
  const tableCols = await getTableColumns(table);
  const amountCol = await getAmountColumn(table);
  const enrollmentRef =
    payload.enrollmentText ??
    (payload.enrollmentId != null ? String(payload.enrollmentId) : null);
  const dateStr = payload.date ? payload.date.toISOString().slice(0, 10) : null;

  const dataFields: Array<[string, unknown]> = [
    ['enrollment_id', enrollmentRef],
    [amountCol, payload.amount],
    ['mode', payload.mode],
    ['discounted_course_fee', payload.discountedCourseFee],
    ['1st_emi', payload.firstEmi],
    ['tenure', payload.tenure],
  ];
  if (tableCols.has('enrollmentId')) {
    dataFields.push(['enrollmentId', payload.enrollmentId]);
  }
  if (tableCols.has('batchId')) {
    dataFields.push(['batchId', payload.batchId]);
  }

  const existing = await prisma.$queryRawUnsafe<Array<{ id: bigint }>>(
    `SELECT id FROM \`${table}\` WHERE \`${TX_LEGACY}\` = ? LIMIT 1`,
    payload.transactionId
  );

  if (existing.length) {
    const setClause = [`\`date\` = ?`, ...dataFields.map(([col]) => `\`${col}\` = ?`)].join(', ');
    await prisma.$executeRawUnsafe(
      `UPDATE \`${table}\` SET ${setClause} WHERE id = ?`,
      dateStr,
      ...dataFields.map(([, value]) => value),
      Number(existing[0].id)
    );
    return;
  }

  const insertCols = ['date', TX_LEGACY, ...dataFields.map(([col]) => col)];
  const placeholders = insertCols.map(() => '?').join(', ');
  const insertValues = [dateStr, payload.transactionId, ...dataFields.map(([, value]) => value)];
  const colList = insertCols.map((col) => `\`${col}\``).join(', ');

  await prisma.$executeRawUnsafe(
    `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders})`,
    ...insertValues
  );
}

export type NormalizedPaymentUpsertPayload = {
  transactionId: string;
  amount: number;
  date: Date | null;
  enrollmentId: number | null;
  batchId: number | null;
  mode: string | null;
  discountedCourseFee: number | null;
  firstEmi: number | null;
  tenure: number | null;
};

export async function upsertNormalizedRawPaymentRow(
  modelName: string,
  payload: NormalizedPaymentUpsertPayload
) {
  const table = legacyPaymentTableName(modelName);
  const cols = await getNormalizedPaymentCols(table);
  const dateStr = payload.date ? payload.date.toISOString().slice(0, 10) : null;

  const existing = await prisma.$queryRawUnsafe<Array<{ id: bigint }>>(
    `SELECT id FROM \`${table}\` WHERE \`${cols.transactionId}\` = ? LIMIT 1`,
    payload.transactionId
  );

  const dataFields: Array<[string, unknown]> = [
    ['date', dateStr],
    [cols.enrollmentId, payload.enrollmentId],
    [cols.amount, payload.amount],
    ['mode', payload.mode],
    [cols.discountedCourseFee, payload.discountedCourseFee],
    [cols.firstEmi, payload.firstEmi],
    [cols.tenure, payload.tenure],
    [cols.batchId, payload.batchId],
  ];

  if (existing.length) {
    const setClause = dataFields.map(([col]) => `\`${col}\` = ?`).join(', ');
    await prisma.$executeRawUnsafe(
      `UPDATE \`${table}\` SET ${setClause} WHERE id = ?`,
      ...dataFields.map(([, value]) => value),
      Number(existing[0].id)
    );
    return;
  }

  const insertCols = [cols.transactionId, ...dataFields.map(([col]) => col)];
  const insertValues = [payload.transactionId, ...dataFields.map(([, value]) => value)];
  const colList = insertCols.map((col) => `\`${col}\``).join(', ');
  const placeholders = insertCols.map(() => '?').join(', ');

  await prisma.$executeRawUnsafe(
    `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders})`,
    ...insertValues
  );
}

function buildNormalizedFromClause(table: string, cols: NormalizedPaymentCols, alias = 'p') {
  return `\`${table}\` ${alias} ${enrollmentJoinOnNumericId(alias, cols.enrollmentId)}`;
}

function buildNormalizedSearchClause(cols: NormalizedPaymentCols, alias: string, q?: string) {
  if (!q?.trim()) return '';
  const term = escapeLike(q.trim());
  return `(
    ${alias}.\`${cols.transactionId}\` LIKE '%${term}%'
    OR CAST(${alias}.\`${cols.enrollmentId}\` AS CHAR) LIKE '%${term}%'
    OR e.enrollment LIKE '%${term}%'
  )`;
}

function buildNormalizedWhereClause(
  cols: NormalizedPaymentCols,
  query: LegacyPaymentQuery,
  alias = 'p'
): string {
  const clauses: string[] = ['1 = 1'];

  if (query.orphansOnly) {
    clauses.push(`(${alias}.id IS NULL OR ${alias}.id = 0)`);
  } else {
    clauses.push(`${alias}.\`${cols.transactionId}\` IS NOT NULL`);
    clauses.push(`${alias}.\`${cols.transactionId}\` != ''`);
  }

  const search = buildNormalizedSearchClause(cols, alias, query.q);
  if (search) clauses.push(search);

  if (query.start) {
    clauses.push(`${alias}.\`date\` >= '${query.start}'`);
  }
  if (query.end) {
    clauses.push(`${alias}.\`date\` <= '${query.end} 23:59:59'`);
  }
  if (query.beforeId != null) {
    clauses.push(`${alias}.id < ${query.beforeId}`);
  }

  return `WHERE ${clauses.join(' AND ')}`;
}

export async function countNormalizedRawPaymentRows(
  modelName: string,
  query: LegacyPaymentQuery = {}
): Promise<number> {
  const table = legacyPaymentTableName(modelName);
  const cols = await getNormalizedPaymentCols(table);
  const where = buildNormalizedWhereClause(cols, query, 'p');
  const from = buildNormalizedFromClause(table, cols, 'p');
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(`
    SELECT COUNT(*) AS cnt FROM ${from} ${where}
  `);
  return Number(rows[0]?.cnt ?? 0);
}

export async function sumNormalizedRawPaymentAmount(
  modelName: string,
  query: LegacyPaymentQuery = {}
): Promise<number> {
  const table = legacyPaymentTableName(modelName);
  const cols = await getNormalizedPaymentCols(table);
  const where = buildNormalizedWhereClause(cols, query, 'p');
  const from = buildNormalizedFromClause(table, cols, 'p');
  const rows = await prisma.$queryRawUnsafe<Array<{ total: number | null }>>(`
    SELECT COALESCE(SUM(p.\`${cols.amount}\`), 0) AS total
    FROM ${from}
    ${where}
  `);
  return Number(rows[0]?.total ?? 0);
}

export async function fetchNormalizedRawPaymentRows(
  modelName: string,
  query: LegacyPaymentQuery = {}
) {
  const table = legacyPaymentTableName(modelName);
  const cols = await getNormalizedPaymentCols(table);
  const where = buildNormalizedWhereClause(cols, query, 'p');
  const from = buildNormalizedFromClause(table, cols, 'p');
  const limit = query.limit ?? 50;

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT
      p.id,
      p.\`date\` AS date,
      p.\`${cols.transactionId}\` AS transactionId,
      p.\`${cols.enrollmentId}\` AS enrollmentId,
      COALESCE(e.enrollment, CAST(p.\`${cols.enrollmentId}\` AS CHAR)) AS enrollmentNo,
      p.\`${cols.amount}\` AS amount,
      p.mode,
      p.\`${cols.discountedCourseFee}\` AS discountedCourseFee,
      p.\`${cols.firstEmi}\` AS firstEmi,
      p.\`${cols.tenure}\` AS tenure
    FROM ${from}
    ${where}
    ORDER BY p.id DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: Number(row.id),
    date: row.date,
    transactionId: row.transactionId ?? '',
    enrollmentId: row.enrollmentId ?? '',
    enrollmentNo: row.enrollmentNo ?? '',
    amount: row.amount != null ? Number(row.amount) : 0,
    mode: row.mode ?? '',
    discountedCourseFee: row.discountedCourseFee != null ? Number(row.discountedCourseFee) : null,
    firstEmi: row.firstEmi != null ? Number(row.firstEmi) : null,
    tenure: row.tenure != null ? Number(row.tenure) : null,
  }));
}

export async function countPaymentTableRows(
  modelName: string,
  query: LegacyPaymentQuery = {}
): Promise<number> {
  if (await usesLegacyPaymentSchema(modelName)) {
    return countLegacyPaymentRows(modelName, query);
  }
  if (await usesNormalizedRawPaymentSchema(modelName)) {
    return countNormalizedRawPaymentRows(modelName, query);
  }
  throw new Error(`No raw count for ${modelName}`);
}

export async function sumPaymentTableAmount(
  modelName: string,
  query: LegacyPaymentQuery = {}
): Promise<number> {
  if (await usesLegacyPaymentSchema(modelName)) {
    return sumLegacyPaymentAmount(modelName, query);
  }
  if (await usesNormalizedRawPaymentSchema(modelName)) {
    return sumNormalizedRawPaymentAmount(modelName, query);
  }
  throw new Error(`No raw sum for ${modelName}`);
}

export async function fetchPaymentTableRows(
  modelName: string,
  query: LegacyPaymentQuery = {}
) {
  if (await usesLegacyPaymentSchema(modelName)) {
    return fetchLegacyPaymentRows(modelName, query);
  }
  if (await usesNormalizedRawPaymentSchema(modelName)) {
    return fetchNormalizedRawPaymentRows(modelName, query);
  }
  throw new Error(`No raw fetch for ${modelName}`);
}

export async function fetchAllPaymentTableRowsForExport(
  modelName: string,
  query: Omit<LegacyPaymentQuery, 'limit' | 'beforeId'> = {}
) {
  const batchSize = 5000;
  const all: Awaited<ReturnType<typeof fetchPaymentTableRows>> = [];
  let beforeId: number | undefined;

  while (true) {
    const batch = await fetchPaymentTableRows(modelName, {
      ...query,
      limit: batchSize,
      beforeId,
    });
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < batchSize) break;
    beforeId = batch[batch.length - 1].id;
  }

  const orphans = await fetchPaymentTableRows(modelName, {
    ...query,
    orphansOnly: true,
    limit: 100000,
  });
  if (orphans.length) {
    all.push(...orphans);
  }

  return all;
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, '\\$&');
}

function buildSearchClause(alias = 'p', q?: string) {
  if (!q?.trim()) return '';
  const term = escapeLike(q.trim());
  return `(
    ${alias}.\`${TX_LEGACY}\` LIKE '%${term}%'
    OR CAST(${alias}.enrollment_id AS CHAR) LIKE '%${term}%'
  )`;
}

export type LegacyPaymentQuery = {
  q?: string;
  start?: string;
  end?: string;
  limit?: number;
  /** Keyset pagination for batched export (rows with id less than this value). */
  beforeId?: number;
  /** Export rows that have no usable numeric id (null or 0). */
  orphansOnly?: boolean;
};

function buildWhereClause(query: LegacyPaymentQuery, alias = 'p'): string {
  const clauses: string[] = ['1 = 1'];

  if (query.orphansOnly) {
    clauses.push(`(${alias}.id IS NULL OR ${alias}.id = 0)`);
  } else {
    clauses.push(`${alias}.\`${TX_LEGACY}\` IS NOT NULL`);
    clauses.push(`${alias}.\`${TX_LEGACY}\` != ''`);
  }

  const search = buildSearchClause(alias, query.q);
  if (search) clauses.push(search);

  if (query.start) {
    clauses.push(`${alias}.\`date\` >= '${query.start}'`);
  }
  if (query.end) {
    clauses.push(`${alias}.\`date\` <= '${query.end} 23:59:59'`);
  }
  if (query.beforeId != null) {
    clauses.push(`${alias}.id < ${query.beforeId}`);
  }

  return `WHERE ${clauses.join(' AND ')}`;
}

export async function countLegacyPaymentRows(
  modelName: string,
  query: LegacyPaymentQuery = {}
): Promise<number> {
  const table = legacyPaymentTableName(modelName);
  const where = buildWhereClause(query, 'p');
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(`
    SELECT COUNT(*) AS cnt
    FROM \`${table}\` p
    ${where}
  `);
  return Number(rows[0]?.cnt ?? 0);
}

export async function sumLegacyPaymentAmount(
  modelName: string,
  query: LegacyPaymentQuery = {}
): Promise<number> {
  const table = legacyPaymentTableName(modelName);
  const amountCol = await getAmountColumn(table);
  const where = buildWhereClause(query, 'p');
  const rows = await prisma.$queryRawUnsafe<Array<{ total: number | null }>>(`
    SELECT COALESCE(SUM(p.\`${amountCol}\`), 0) AS total
    FROM \`${table}\` p
    ${where}
  `);
  return Number(rows[0]?.total ?? 0);
}

export async function fetchLegacyPaymentRows(modelName: string, query: LegacyPaymentQuery = {}) {
  const table = legacyPaymentTableName(modelName);
  const amountCol = await getAmountColumn(table);
  const where = buildWhereClause(query, 'p');
  const limit = query.limit ?? 50;

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT
      p.id,
      p.\`date\` AS date,
      p.\`${TX_LEGACY}\` AS transactionId,
      p.enrollment_id AS enrollmentId,
      COALESCE(e.enrollment, CAST(p.enrollment_id AS CHAR)) AS enrollmentNo,
      p.\`${amountCol}\` AS amount,
      p.mode,
      p.discounted_course_fee AS discountedCourseFee,
      p.\`1st_emi\` AS firstEmi,
      p.tenure
    FROM \`${table}\` p
    ${enrollmentJoinOnNumericId('p', 'enrollment_id')}
    ${where}
    ORDER BY p.id DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: Number(row.id),
    date: row.date,
    transactionId: row.transactionId ?? '',
    enrollmentId: row.enrollmentId ?? '',
    enrollmentNo: row.enrollmentNo ?? '',
    amount: row.amount != null ? Number(row.amount) : 0,
    mode: row.mode ?? '',
    discountedCourseFee: row.discountedCourseFee != null ? Number(row.discountedCourseFee) : null,
    firstEmi: row.firstEmi != null ? Number(row.firstEmi) : null,
    tenure: row.tenure != null ? Number(row.tenure) : null,
  }));
}
