import { prisma } from '@/lib/prisma';

function escapeSqlLike(value: string) {
  return value.replace(/[%_\\']/g, (ch) => (ch === "'" ? "''" : `\\${ch}`));
}

/** MySQL zero/partial dates that Prisma cannot parse (P2020). */
export const SAFE_PAYMENT_DATE_SQL = `
  CASE
    WHEN \`date\` IS NULL THEN NULL
    WHEN CAST(\`date\` AS CHAR(19)) LIKE '0000%' THEN NULL
    WHEN CAST(\`date\` AS CHAR(19)) REGEXP '^[0-9]{4}-00-' THEN NULL
    WHEN CAST(\`date\` AS CHAR(19)) REGEXP '^[0-9]{4}-[0-9]{2}-00' THEN NULL
    ELSE \`date\`
  END
`.trim();

export type ConsolidatedPaymentExportQuery = {
  q?: string;
  start?: string;
  end?: string;
};

/**
 * Fetch ConsolidatedPayment via raw SQL so invalid date values do not crash Prisma.
 */
export async function fetchConsolidatedPaymentsForExport(
  query: ConsolidatedPaymentExportQuery = {}
): Promise<Record<string, unknown>[]> {
  const clauses: string[] = ['1 = 1'];

  if (query.q?.trim()) {
    const term = escapeSqlLike(query.q.trim());
    clauses.push(`(
      transactionId LIKE '%${term}%'
      OR CAST(enrollmentId AS CHAR) LIKE '%${term}%'
      OR sourceName LIKE '%${term}%'
    )`);
  }

  if (query.start) {
    clauses.push(`${SAFE_PAYMENT_DATE_SQL} >= '${query.start}'`);
  }
  if (query.end) {
    clauses.push(`${SAFE_PAYMENT_DATE_SQL} <= '${query.end} 23:59:59'`);
  }

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT
      id,
      ${SAFE_PAYMENT_DATE_SQL} AS date,
      transactionId,
      enrollmentId,
      amount,
      mode,
      batchId,
      discountedCourseFee,
      firstEmi,
      tenure,
      sourceName,
      createdAt,
      updatedAt
    FROM ConsolidatedPayment
    WHERE ${clauses.join(' AND ')}
    ORDER BY id DESC
  `);

  return rows.map((row) => ({
    ...row,
    id: row.id != null ? Number(row.id) : null,
    enrollmentId: row.enrollmentId != null ? Number(row.enrollmentId) : null,
    amount: row.amount != null ? Number(row.amount) : 0,
    batchId: row.batchId != null ? Number(row.batchId) : null,
    discountedCourseFee:
      row.discountedCourseFee != null ? Number(row.discountedCourseFee) : null,
    firstEmi: row.firstEmi != null ? Number(row.firstEmi) : null,
    tenure: row.tenure != null ? Number(row.tenure) : null,
  }));
}

/** Null out invalid ConsolidatedPayment.date values so Prisma can read the table. */
export async function sanitizeConsolidatedPaymentDates(): Promise<number> {
  return prisma.$executeRawUnsafe(`
    UPDATE ConsolidatedPayment
    SET \`date\` = NULL
    WHERE \`date\` IS NOT NULL
      AND (
        CAST(\`date\` AS CHAR(19)) LIKE '0000%'
        OR CAST(\`date\` AS CHAR(19)) REGEXP '^[0-9]{4}-00-'
        OR CAST(\`date\` AS CHAR(19)) REGEXP '^[0-9]{4}-[0-9]{2}-00'
      )
  `);
}
