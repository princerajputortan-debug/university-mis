import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveLatestBatchId, STATUS_IDS_BY_FILTER } from '@/lib/consolidated-fee-mis';
import { ENROLLMENT_MAPPED_PAYMENT_SOURCE_LABELS } from '@/lib/payment-sources';
import {
  addStudentToBatchRow,
  createBatchFeeCommissionRow,
  emptyBatchFeeCommissionTotals,
  summarizeStudentForBatchFeeCommission,
  toNumber,
  type BatchFeeCommissionMisRow,
} from '@/lib/batch-fee-commission-mis';

function esc(value: string) {
  return value.replace(/'/g, "''");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leadSource = (searchParams.get('leadSource') || '').trim();
  const batchRaw = (searchParams.get('batch') || '').trim();
  const batchFilterId = batchRaw ? Number(batchRaw) : NaN;

  try {
    const latestBatchId = await resolveLatestBatchId((sql) => prisma.$queryRawUnsafe(sql));
    const allBatchIds = Array.from({ length: latestBatchId }, (_, i) => i + 1);
    const batchIds =
      Number.isFinite(batchFilterId) && batchFilterId >= 1 && batchFilterId <= latestBatchId
        ? [batchFilterId]
        : allBatchIds;

    const statusIds = STATUS_IDS_BY_FILTER['pursuing-passout'];

    const leadFilter = leadSource
      ? `AND ls.\`lead\` = '${esc(leadSource)}'`
      : '';

    const payoutLeadCodeIds = Array.from(
      new Set(
        (
          await prisma.$queryRawUnsafe<Array<{ leadSourceCode: number | bigint }>>(`
            SELECT DISTINCT lead_source_code AS leadSourceCode
            FROM consolidated_payout
            WHERE lead_source_code IS NOT NULL
          `)
        ).map((r) => Number(r.leadSourceCode)).filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    const channelPartnerRows =
      payoutLeadCodeIds.length > 0
        ? await prisma.leadSource.findMany({
            where: { id: { in: payoutLeadCodeIds } },
            select: { lead: true },
            orderBy: { lead: 'asc' },
          })
        : [];

    const [
      batchRows,
      feeRows,
      studentRows,
      paymentGroups,
      payoutPctRows,
      payoutPaidRows,
      payoutDistinctCounts,
      rrRows,
    ] = await Promise.all([
      prisma.batch.findMany({
        where: { id: { in: allBatchIds } },
        select: { id: true, batch: true },
        orderBy: { id: 'asc' },
      }),
      prisma.feeStructure.findMany({
        select: { batchId: true, paymentOptionId: true, programId: true, semFee: true },
      }),
      prisma.$queryRawUnsafe<
        Array<{
          enrollmentId: number | bigint;
          batchId: number | bigint;
          typeId: number | null;
          typeLabel: string | null;
          leadSourceId: number | null;
          feeBatchId: number | null;
          programId: number | null;
          paymentOptionId: number | null;
          sem1Fee: number | null;
          sem1Scholarship: number | null;
          sem2Fee: number | null;
          sem2Scholarship: number | null;
          sem3Fee: number | null;
          sem3Scholarship: number | null;
          sem4Fee: number | null;
          sem4Scholarship: number | null;
          sem5Fee: number | null;
          sem5Scholarship: number | null;
          sem6Fee: number | null;
          sem6Scholarship: number | null;
        }>
      >(`
        SELECT
          sfs.enrollmentId,
          af.batch AS batchId,
          COALESCE(sfs.typeId, af.type) AS typeId,
          at.type AS typeLabel,
          af.lead_source AS leadSourceId,
          COALESCE(sfs.batchId, af.batch) AS feeBatchId,
          sfs.programId,
          sfs.paymentOptionId,
          sfs.sem1Fee, sfs.sem1Scholarship,
          sfs.sem2Fee, sfs.sem2Scholarship,
          sfs.sem3Fee, sfs.sem3Scholarship,
          sfs.sem4Fee, sfs.sem4Scholarship,
          sfs.sem5Fee, sfs.sem5Scholarship,
          sfs.sem6Fee, sfs.sem6Scholarship
        FROM StudentFeeStructure sfs
        INNER JOIN Enrollment e ON e.id = sfs.enrollmentId
        INNER JOIN AdmissionForm af ON af.enrollment_no = e.id
        LEFT JOIN AdmissionType at ON at.id = COALESCE(sfs.typeId, af.type)
        LEFT JOIN LeadSource ls ON ls.id = af.lead_source
        WHERE af.batch IN (${batchIds.join(',')})
          AND af.status IN (${statusIds.join(',')})
          ${leadFilter}
      `),
      prisma.consolidatedPayment.groupBy({
        by: ['enrollmentId'],
        where: {
          sourceName: { in: [...ENROLLMENT_MAPPED_PAYMENT_SOURCE_LABELS] },
          enrollmentId: { not: null },
        },
        _sum: { amount: true },
      }),
      prisma.$queryRawUnsafe<
        Array<{ enrollmentId: number | bigint; commissionPct: number | null }>
      >(`
        SELECT enrollment_id AS enrollmentId, commission_pct AS commissionPct
        FROM consolidated_payout
        WHERE enrollment_id IS NOT NULL
          AND commission_pct IS NOT NULL
        ORDER BY id DESC
      `),
      prisma.$queryRawUnsafe<
        Array<{ enrollmentId: number | bigint; paid: number | bigint | null }>
      >(`
        SELECT enrollment_id AS enrollmentId, COALESCE(SUM(payout_amount), 0) AS paid
        FROM consolidated_payout
        WHERE enrollment_id IS NOT NULL
        GROUP BY enrollment_id
      `),
      prisma.$queryRawUnsafe<
        Array<{ batchId: number | bigint; studentCount: number | bigint }>
      >(`
        SELECT
          af.batch AS batchId,
          COUNT(DISTINCT cp.enrollment_id) AS studentCount
        FROM consolidated_payout cp
        INNER JOIN AdmissionForm af ON af.enrollment_no = cp.enrollment_id
        LEFT JOIN LeadSource ls ON ls.id = af.lead_source
        WHERE cp.enrollment_id IS NOT NULL
          AND af.batch IN (${batchIds.join(',')})
          ${leadFilter}
        GROUP BY af.batch
      `),
      prisma.$queryRawUnsafe<
        Array<{
          leadSourceId: number | bigint;
          batchId: number | bigint;
          commissionPct: number | null;
        }>
      >(`
        SELECT leadSourceId, batchId, commissionPct
        FROM comission_table_rr
        WHERE commissionPct IS NOT NULL
      `).catch(() => []),
    ]);

    const baseFeeMap = new Map(
      feeRows.map((row) => [
        `${row.batchId}:${row.paymentOptionId}:${row.programId}`,
        Number(row.semFee) || 0,
      ])
    );
    const paidByEnrollment = new Map(
      paymentGroups.map((row) => [Number(row.enrollmentId), Number(row._sum.amount ?? 0)])
    );

    const pctByEnrollment = new Map<number, number>();
    for (const row of payoutPctRows) {
      const id = Number(row.enrollmentId);
      if (!pctByEnrollment.has(id) && row.commissionPct != null) {
        pctByEnrollment.set(id, Number(row.commissionPct));
      }
    }

    const commissionPaidByEnrollment = new Map(
      payoutPaidRows.map((row) => [Number(row.enrollmentId), Number(row.paid ?? 0)])
    );

    const distinctStudentCountByBatch = new Map(
      payoutDistinctCounts.map((row) => [Number(row.batchId), Number(row.studentCount) || 0])
    );

    const rrPctMap = new Map(
      rrRows.map((row) => [
        `${Number(row.leadSourceId)}:${Number(row.batchId)}`,
        Number(row.commissionPct),
      ])
    );

    const rowMap = new Map<number, BatchFeeCommissionMisRow>();
    const visibleBatches =
      Number.isFinite(batchFilterId) && batchFilterId >= 1
        ? batchRows.filter((b) => b.id === batchFilterId)
        : batchRows;

    for (const batch of visibleBatches) {
      const row = createBatchFeeCommissionRow(batch.id, batch.batch);
      row.studentCount = distinctStudentCountByBatch.get(batch.id) || 0;
      rowMap.set(batch.id, row);
    }

    for (const student of studentRows) {
      const batchId = toNumber(student.batchId);
      const row = rowMap.get(batchId);
      if (!row) continue;

      const enrollmentId = toNumber(student.enrollmentId);
      const feeBatchId = toNumber(student.feeBatchId) || batchId;
      const programId = toNumber(student.programId);
      const paymentOptionId = toNumber(student.paymentOptionId);
      const baseSemFee =
        baseFeeMap.get(`${feeBatchId}:${paymentOptionId}:${programId}`) || 0;

      let commissionPct = pctByEnrollment.get(enrollmentId) ?? null;
      if (commissionPct == null) {
        const leadSourceId = toNumber(student.leadSourceId);
        const fromRr = rrPctMap.get(`${leadSourceId}:${batchId}`);
        if (fromRr != null) commissionPct = fromRr;
      }

      const summary = summarizeStudentForBatchFeeCommission({
        batchId,
        typeLabel: student.typeLabel || '',
        typeId: student.typeId != null ? toNumber(student.typeId) : null,
        latestBatchId,
        baseSemFee,
        studentFeeRow: student as unknown as Record<string, unknown>,
        totalPaid: paidByEnrollment.get(enrollmentId) || 0,
        commissionPct,
        commissionPaid: commissionPaidByEnrollment.get(enrollmentId) || 0,
      });

      addStudentToBatchRow(row, summary);
    }

    const rows = visibleBatches.map(
      (b) => rowMap.get(b.id) || createBatchFeeCommissionRow(b.id, b.batch)
    );

    const totals = emptyBatchFeeCommissionTotals();
    for (const row of rows) {
      totals.studentCount += row.studentCount;
      totals.totalFee += row.totalFee;
      totals.totalCurrentFee += row.totalCurrentFee;
      totals.feeCollected += row.feeCollected;
      totals.totalCommissionPayable += row.totalCommissionPayable;
      totals.commissionPaid += row.commissionPaid;
    }

    const roundMoney = (n: number) => Math.round(n * 100) / 100;
    const finalize = (row: BatchFeeCommissionMisRow): BatchFeeCommissionMisRow => ({
      ...row,
      totalFee: roundMoney(row.totalFee),
      totalCurrentFee: roundMoney(row.totalCurrentFee),
      feeCollected: roundMoney(row.feeCollected),
      totalCommissionPayable: roundMoney(row.totalCommissionPayable),
      commissionPaid: roundMoney(row.commissionPaid),
    });

    const leadSources = Array.from(
      new Set(channelPartnerRows.map((r) => (r.lead || '').trim()).filter(Boolean))
    );

    return NextResponse.json({
      latestBatchId,
      filters: {
        leadSources,
        batches: batchRows.map((b) => ({ id: b.id, label: b.batch })),
      },
      rows: rows.map(finalize),
      totals: {
        studentCount: totals.studentCount,
        totalFee: roundMoney(totals.totalFee),
        totalCurrentFee: roundMoney(totals.totalCurrentFee),
        feeCollected: roundMoney(totals.feeCollected),
        totalCommissionPayable: roundMoney(totals.totalCommissionPayable),
        commissionPaid: roundMoney(totals.commissionPaid),
      },
    });
  } catch (error) {
    console.error('API Error (batch-fee-commission-mis):', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch fee commission MIS' },
      { status: 500 }
    );
  }
}
