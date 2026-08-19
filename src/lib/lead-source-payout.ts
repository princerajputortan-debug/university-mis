import { prisma } from '@/lib/prisma';

/** Rebuild consolidated payout totals from detail payout rows. */
export async function refreshLeadSourcePayoutSummaries(enrollmentId?: number) {
  const enrollmentFilter =
    enrollmentId != null ? `WHERE enrollmentId = ${Number(enrollmentId)}` : '';

  await prisma.$executeRawUnsafe(`
    DELETE FROM LeadSourcePayoutSummary ${enrollmentFilter}
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO LeadSourcePayoutSummary (enrollmentId, leadSourceId, payoutPaid, createdAt, updatedAt)
    SELECT
      enrollmentId,
      leadSourceId,
      COALESCE(SUM(payoutAmount), 0) AS payoutPaid,
      NOW(),
      NOW()
    FROM LeadSourcePayout
    ${enrollmentFilter}
    GROUP BY enrollmentId, leadSourceId
  `);
}

export async function upsertLeadSourcePayoutSummary(
  enrollmentId: number,
  leadSourceId: number
) {
  const rows = await prisma.$queryRawUnsafe<Array<{ total: number | bigint }>>(
    `SELECT COALESCE(SUM(payoutAmount), 0) AS total
     FROM LeadSourcePayout
     WHERE enrollmentId = ? AND leadSourceId = ?`,
    enrollmentId,
    leadSourceId
  );
  const payoutPaid = Number(rows[0]?.total ?? 0);

  await prisma.leadSourcePayoutSummary.upsert({
    where: {
      enrollmentId_leadSourceId: { enrollmentId, leadSourceId },
    },
    create: { enrollmentId, leadSourceId, payoutPaid },
    update: { payoutPaid },
  });

  return payoutPaid;
}
