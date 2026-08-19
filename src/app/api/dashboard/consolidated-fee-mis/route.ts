import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  addConsolidatedFeeMisTotals,
  buildStudentConsolidatedSummary,
  createConsolidatedFeeMisRow,
  currentSemForBatch,
  emptyConsolidatedFeeMisTotals,
  resolveLatestBatchId,
  STATUS_IDS_BY_FILTER,
  toNumber,
  type ConsolidatedFeeMisRow,
  type StudentStatusFilter,
} from '@/lib/consolidated-fee-mis';
import {
  parseCategoryFilter,
  sqlCategoryFilterForAdmission,
} from '@/lib/bifurcation-categories';
import {
  ENROLLMENT_MAPPED_PAYMENT_SOURCE_LABELS,
  parseEnrollmentMappedPaymentSourceFilter,
} from '@/lib/payment-sources';

const TYPE_ORDER = [
  { id: 2, label: 'UG' },
  { id: 1, label: 'PG' },
];

function parseStatusFilter(value: string | null): StudentStatusFilter {
  if (
    value === 'pursuing' ||
    value === 'passout' ||
    value === 'refund' ||
    value === 'cancelled' ||
    value === 'pursuing-passout'
  ) {
    return value;
  }
  return 'pursuing-passout';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusFilter = parseStatusFilter(searchParams.get('status'));
  const statusIds = STATUS_IDS_BY_FILTER[statusFilter];
  const category = parseCategoryFilter(searchParams.get('category'));
  const categoryFilter = sqlCategoryFilterForAdmission('af', category);
  const paymentSource = parseEnrollmentMappedPaymentSourceFilter(searchParams.get('paymentSource'));

  try {
    const latestBatchId = await resolveLatestBatchId((sql) => prisma.$queryRawUnsafe(sql));
    const batchIds = Array.from({ length: latestBatchId }, (_, i) => i + 1);

    const [batchRows, feeRows, studentRows, paymentGroups] = await Promise.all([
      prisma.batch.findMany({
        where: { id: { in: batchIds } },
        select: { id: true, batch: true },
        orderBy: { id: 'asc' },
      }),
      prisma.feeStructure.findMany({
        select: { batchId: true, paymentOptionId: true, programId: true, semFee: true },
      }),
      prisma.$queryRawUnsafe<
        Array<{
          enrollmentId: number;
          batchId: number;
          typeId: number | null;
          typeLabel: string | null;
          currentSem: number | null;
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
          sfs.currentSem,
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
        WHERE af.batch IN (${batchIds.join(',')})
          AND af.status IN (${statusIds.join(',')})
          ${categoryFilter}
      `),
      prisma.consolidatedPayment.groupBy({
        by: ['enrollmentId'],
        where: {
          sourceName: paymentSource
            ? paymentSource
            : { in: [...ENROLLMENT_MAPPED_PAYMENT_SOURCE_LABELS] },
          enrollmentId: { not: null },
        },
        _sum: { amount: true },
      }),
    ]);

    const baseFeeMap = new Map(
      feeRows.map((row) => [`${row.batchId}:${row.paymentOptionId}:${row.programId}`, Number(row.semFee) || 0])
    );
    const paidByEnrollment = new Map(
      paymentGroups.map((row) => [Number(row.enrollmentId), Number(row._sum.amount ?? 0)])
    );

    const typeRowMap = new Map<string, ConsolidatedFeeMisRow>();
    for (const batch of batchRows) {
      for (const type of TYPE_ORDER) {
        const key = `${batch.id}:${type.id}`;
        typeRowMap.set(
          key,
          createConsolidatedFeeMisRow(batch.batch, batch.id, type.label, type.id, latestBatchId)
        );
      }
    }

    for (const student of studentRows) {
      const batchId = toNumber(student.batchId);
      const typeId = toNumber(student.typeId);
      const typeLabel =
        student.typeLabel?.trim().toUpperCase() === 'UG'
          ? 'UG'
          : student.typeLabel?.trim().toUpperCase() === 'PG'
            ? 'PG'
            : typeId === 2
              ? 'UG'
              : 'PG';
      const normalizedTypeId = typeLabel === 'UG' ? 2 : 1;
      const key = `${batchId}:${normalizedTypeId}`;
      const row = typeRowMap.get(key);
      if (!row) continue;

      const feeBatchId = toNumber(student.feeBatchId);
      const programId = toNumber(student.programId);
      const paymentOptionId = toNumber(student.paymentOptionId);
      const feeKey =
        feeBatchId && paymentOptionId && programId
          ? `${feeBatchId}:${paymentOptionId}:${programId}`
          : null;
      const baseSemFee = feeKey ? (baseFeeMap.get(feeKey) ?? 0) : 0;
      const batchCurrentSem = currentSemForBatch(
        batchId,
        typeLabel,
        normalizedTypeId,
        latestBatchId
      );
      const enrollmentId = toNumber(student.enrollmentId);
      const summary = buildStudentConsolidatedSummary({
        batchCurrentSem,
        type: typeLabel,
        typeId: normalizedTypeId,
        baseSemFee,
        studentFeeRow: student,
        totalPaid: paidByEnrollment.get(enrollmentId) ?? 0,
      });

      row.studentCount += 1;
      addConsolidatedFeeMisTotals(row, summary);
    }

    // One consolidated row per batch (UG + PG summed), with expandable children
    const rows: ConsolidatedFeeMisRow[] = batchRows.map((batch) => {
      const ug = typeRowMap.get(`${batch.id}:2`)!;
      const pg = typeRowMap.get(`${batch.id}:1`)!;
      const combined = emptyConsolidatedFeeMisTotals();
      for (const part of [ug, pg]) {
        combined.studentCount += part.studentCount;
        combined.feeStructure += part.feeStructure;
        combined.feeCurrentSem += part.feeCurrentSem;
        combined.recdTillDate += part.recdTillDate;
        combined.pending += part.pending;
        combined.grossFee += part.grossFee;
        combined.scholarshipCurrentSem += part.scholarshipCurrentSem;
        combined.grossScholarship += part.grossScholarship;
      }
      return {
        batch: batch.batch,
        batchId: batch.id,
        type: '',
        currentSem: 0,
        currentSemLabel: `UG ${ug.currentSem} · PG ${pg.currentSem}`,
        ...combined,
        children: [ug, pg],
      };
    });

    const total = emptyConsolidatedFeeMisTotals();
    for (const row of rows) {
      total.studentCount += row.studentCount;
      total.feeStructure += row.feeStructure;
      total.feeCurrentSem += row.feeCurrentSem;
      total.recdTillDate += row.recdTillDate;
      total.pending += row.pending;
      total.grossFee += row.grossFee;
      total.scholarshipCurrentSem += row.scholarshipCurrentSem;
      total.grossScholarship += row.grossScholarship;
    }

    return NextResponse.json({
      statusFilter,
      category: category || null,
      paymentSource,
      rows,
      total: {
        batch: 'Total',
        type: '',
        currentSem: 0,
        ...total,
      },
    });
  } catch (error) {
    console.error('API Error (consolidated-fee-mis):', error);
    return NextResponse.json({ error: 'Failed to fetch consolidated fee MIS' }, { status: 500 });
  }
}
