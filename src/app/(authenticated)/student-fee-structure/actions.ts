'use server'

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { resolveStudentFeeLookups } from '@/lib/lookups';

import { buildStudentConsolidatedSummary } from '@/lib/consolidated-fee-mis';
import { batchIdFromLabel, currentSemForBatch, FALLBACK_LATEST_BATCH_ID } from '@/lib/student-fee-calculations';
import { resolveLatestBatchId } from '@/lib/consolidated-fee-mis';

function mapStudentFeeRow(item: Awaited<ReturnType<typeof prisma.studentFeeStructure.findFirst>> & object) {
  if (!item) return null;
  const row = item as any;
  return {
    ...row,
    enrollmentNo: row.enrollment?.enrollment || '',
    program: row.program?.program || '',
    paymentOption: row.paymentOption?.paymentOption || '',
    batch: row.batch?.batch || '',
    type: row.type?.type || '',
  };
}

export type StudentFeeEnrollmentContext = {
  found: boolean;
  enrollmentNo: string;
  status: string;
  bifurcation: string;
  leadSource: string;
  leadSourceId: number | null;
  team: string;
  batchId: number | null;
  batch: string;
  program: string;
  paymentOption: string;
  type: string;
  paymentSource: string;
  totalPaid: number;
  commissionPct: number | null;
  commissionTableId: number | null;
  commissionPaidTillDate: number;
  currentSem: number;
  feeStructure: StudentFeeStructureValues | null;
};

export type StudentFeeStructureValues = {
  couponName: string;
  couponName2: string;
  couponName3: string;
  sem1Fee: number | null; sem2Fee: number | null; sem3Fee: number | null;
  sem4Fee: number | null; sem5Fee: number | null; sem6Fee: number | null;
  sem1Scholarship: number | null; sem2Scholarship: number | null; sem3Scholarship: number | null;
  sem4Scholarship: number | null; sem5Scholarship: number | null; sem6Scholarship: number | null;
};

export async function getStudentFeeEnrollmentContext(
  enrollmentNo: string
): Promise<StudentFeeEnrollmentContext | null> {
  const normalized = enrollmentNo?.trim();
  if (!normalized) return null;

  // Resolve by numeric Enrollment.id (main_data_base style) OR by text code.
  let enrollment: { id: number; enrollment: string } | null = null;
  if (/^\d+$/.test(normalized)) {
    enrollment = await prisma.enrollment.findUnique({
      where: { id: parseInt(normalized, 10) },
      select: { id: true, enrollment: true },
    });
  }
  if (!enrollment) {
    enrollment = await prisma.enrollment.findUnique({
      where: { enrollment: normalized },
      select: { id: true, enrollment: true },
    });
  }
  if (!enrollment) {
    return {
      found: false,
      enrollmentNo: normalized,
      status: '',
      bifurcation: '',
      leadSource: '',
      leadSourceId: null,
      team: '',
      batchId: null,
      batch: '',
      program: '',
      paymentOption: '',
      type: '',
      paymentSource: '',
      totalPaid: 0,
      commissionPct: null,
      commissionTableId: null,
      commissionPaidTillDate: 0,
      currentSem: 0,
      feeStructure: null,
    };
  }

  // Load any previously-saved fee structure so the semester table auto-fills.
  const savedFee = await prisma.studentFeeStructure.findUnique({
    where: { enrollmentId: enrollment.id },
  });
  const feeStructure: StudentFeeStructureValues | null = savedFee
    ? {
        couponName: savedFee.couponName ?? '',
        couponName2: savedFee.couponName2 ?? '',
        couponName3: savedFee.couponName3 ?? '',
        sem1Fee: savedFee.sem1Fee, sem2Fee: savedFee.sem2Fee, sem3Fee: savedFee.sem3Fee,
        sem4Fee: savedFee.sem4Fee, sem5Fee: savedFee.sem5Fee, sem6Fee: savedFee.sem6Fee,
        sem1Scholarship: savedFee.sem1Scholarship, sem2Scholarship: savedFee.sem2Scholarship,
        sem3Scholarship: savedFee.sem3Scholarship, sem4Scholarship: savedFee.sem4Scholarship,
        sem5Scholarship: savedFee.sem5Scholarship, sem6Scholarship: savedFee.sem6Scholarship,
      }
    : null;

  const formRows = await prisma.$queryRawUnsafe<
    Array<{
      status: string | null;
      bifurcation: string | null;
      leadSource: string | null;
      lead_source: number | null;
      batch: number | null;
      batchLabel: string | null;
      program: string | null;
      paymentOption: string | null;
      type: string | null;
      team: string | null;
    }>
  >(
    `SELECT
      ast.status,
      bif.bifurcation,
      ls.lead AS leadSource,
      af.lead_source,
      af.batch,
      b.batch AS batchLabel,
      pr.program,
      po.paymentOption,
      at.type,
      tm.team
    FROM AdmissionForm af
    LEFT JOIN AdmissionStatus ast ON af.status = ast.id
    LEFT JOIN Bifurcation bif ON af.bifurcation = bif.id
    LEFT JOIN LeadSource ls ON af.lead_source = ls.id
    LEFT JOIN Batch b ON af.batch = b.id
    LEFT JOIN Program pr ON af.program = pr.id
    LEFT JOIN PaymentOption po ON af.payment_option = po.id
    LEFT JOIN AdmissionType at ON af.type = at.id
    LEFT JOIN Team tm ON af.team = tm.id
    WHERE af.enrollment_no = ?
    LIMIT 1`,
    enrollment.id
  );

  const form = formRows[0];

  const payments = await prisma.consolidatedPayment.findMany({
    where: { enrollmentId: enrollment.id },
    select: { amount: true, sourceName: true },
  });
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const paymentSource = Array.from(
    new Set(payments.map((p) => p.sourceName).filter(Boolean))
  ).join(', ');

  let commissionPct: number | null = null;
  let commissionTableId: number | null = null;

  // Prefer consolidated_payout by enrollment (latest non-null commission, else latest row)
  const commissionRows = await prisma.$queryRawUnsafe<
    Array<{ id: number; commissionPct: number | null }>
  >(
    `SELECT
      id,
      commission_pct AS commissionPct
    FROM consolidated_payout
    WHERE enrollment_id = ?
    ORDER BY
      CASE WHEN commission_pct IS NULL THEN 1 ELSE 0 END,
      id DESC
    LIMIT 1`,
    enrollment.id
  );

  if (commissionRows[0]) {
    commissionTableId = Number(commissionRows[0].id);
    if (commissionRows[0].commissionPct != null) {
      const pct = Number(commissionRows[0].commissionPct);
      // Normalize legacy decimals (0.49) to percent (49)
      commissionPct = pct > 0 && pct <= 1 ? pct * 100 : pct;
    }
  }

  // Fallback: legacy lead+batch commission when payout row has no % yet
  if (commissionPct == null && form?.lead_source != null && form?.batch != null) {
    try {
      const legacyRows = await prisma.$queryRawUnsafe<
        Array<{ commissionPct: number | null }>
      >(
        `SELECT commissionPct FROM comission_table_rr
         WHERE leadSourceId = ? AND batchId = ?
         LIMIT 1`,
        form.lead_source,
        form.batch
      );
      if (legacyRows[0]?.commissionPct != null) {
        const pct = Number(legacyRows[0].commissionPct);
        commissionPct = pct > 0 && pct <= 1 ? pct * 100 : pct;

        // Persist onto consolidated_payout so future reads come from the new table
        if (commissionTableId != null) {
          await prisma.$executeRawUnsafe(
            `UPDATE consolidated_payout SET commission_pct = ? WHERE id = ?`,
            commissionPct,
            commissionTableId
          );
        }
      }
    } catch {
      // Legacy table may be absent — ignore
    }
  }

  const payoutTotalRows = await prisma.$queryRawUnsafe<Array<{ total: number | bigint }>>(
    `SELECT COALESCE(SUM(payout_amount), 0) AS total
     FROM consolidated_payout
     WHERE enrollment_id = ?`,
    enrollment.id
  );
  const commissionPaidTillDate = Number(payoutTotalRows[0]?.total ?? 0);

  const latestBatchId = await resolveLatestBatchId((sql) => prisma.$queryRawUnsafe(sql)).catch(
    () => FALLBACK_LATEST_BATCH_ID
  );

  return {
    found: !!form,
    // Return the canonical text code so a numeric-id lookup normalizes the field.
    enrollmentNo: enrollment.enrollment || normalized,
    feeStructure,
    status: form?.status?.trim() || '',
    bifurcation: form?.bifurcation?.trim() || '',
    leadSource: form?.leadSource?.trim() || '',
    leadSourceId: form?.lead_source ?? null,
    team: form?.team?.trim() || '',
    batchId: form?.batch ?? null,
    batch: form?.batchLabel?.trim() || '',
    program: form?.program?.trim() || '',
    paymentOption: form?.paymentOption?.trim() || '',
    type: form?.type?.trim() || '',
    paymentSource,
    totalPaid,
    commissionPct,
    commissionTableId,
    commissionPaidTillDate,
    currentSem: currentSemForBatch(
      form?.batch ?? 0,
      form?.type?.trim() || '',
      form?.type?.trim().toUpperCase() === 'UG' ? 2 : form?.type?.trim().toUpperCase() === 'PG' ? 1 : null,
      latestBatchId
    ),
  };
}

export async function updateCommissionPct(data: {
  commissionTableId: number;
  commissionPct: number;
}) {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE consolidated_payout SET commission_pct = ? WHERE id = ?`,
      data.commissionPct,
      data.commissionTableId
    );
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Update failed' };
  }
}

export type StudentFeeDetailedRow = {
  id: number;
  enrollmentId: string;
  name: string;
  paymentOption: string;
  program: string;
  batch: string;
  type: string;
  currentSem: number;
  feeStructurePerSem: number;
  feeCurrentSem: number;
  recdTillDate: number;
  pending: number;
  grossFee: number;
  scholarshipCurrentSem: number;
  grossScholarship: number;
};

export async function getStudentFeeStructuresDetailed(page = 1, limit = 15, filters: Record<string, unknown> = {}) {
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters.program) where.program = { program: filters.program };
  if (filters.batch) where.batch = { batch: filters.batch };

  const [items, total, feeRows] = await Promise.all([
    prisma.studentFeeStructure.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { enrollment: true, program: true, paymentOption: true, batch: true, type: true },
    }),
    prisma.studentFeeStructure.count({ where }),
    prisma.feeStructure.findMany({
      select: { batchId: true, paymentOptionId: true, programId: true, semFee: true },
    }),
  ]);

  const enrollmentIds = items
    .map((item) => item.enrollmentId)
    .filter((id): id is number => id != null);

  const [admissionRows, paymentGroups, latestBatchId] = await Promise.all([
    enrollmentIds.length
      ? prisma.$queryRawUnsafe<
          Array<{ enrollment_no: number; name: string | null; paymentOption: string | null; batchId: number | null }>
        >(
          `SELECT
            af.enrollment_no,
            af.name,
            po.paymentOption,
            af.batch AS batchId
          FROM AdmissionForm af
          LEFT JOIN PaymentOption po ON af.payment_option = po.id
          WHERE af.enrollment_no IN (${enrollmentIds.join(',')})`
        )
      : Promise.resolve([]),
    enrollmentIds.length
      ? prisma.consolidatedPayment.groupBy({
          by: ['enrollmentId'],
          where: { enrollmentId: { in: enrollmentIds } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    resolveLatestBatchId((sql) => prisma.$queryRawUnsafe(sql)).catch(() => FALLBACK_LATEST_BATCH_ID),
  ]);

  const admissionByEnrollment = new Map(
    admissionRows.map((row) => [Number(row.enrollment_no), row])
  );
  const paidByEnrollment = new Map(
    paymentGroups.map((row) => [Number(row.enrollmentId), Number(row._sum.amount ?? 0)])
  );
  const baseFeeMap = new Map(
    feeRows.map((row) => [`${row.batchId}:${row.paymentOptionId}:${row.programId}`, row.semFee])
  );

  const data: StudentFeeDetailedRow[] = items.map((item) => {
    const row = item as any;
    const enrollmentId = row.enrollmentId as number;
    const admission = admissionByEnrollment.get(enrollmentId);
    const feeKey =
      row.batchId && row.paymentOptionId && row.programId
        ? `${row.batchId}:${row.paymentOptionId}:${row.programId}`
        : null;
    const baseSemFee = feeKey ? (baseFeeMap.get(feeKey) ?? 0) : 0;
    const typeLabel = row.type?.type?.trim() || '';
    const batchId =
      row.batchId ||
      (admission?.batchId != null ? Number(admission.batchId) : 0) ||
      batchIdFromLabel(row.batch?.batch);
    const batchCurrentSem = currentSemForBatch(batchId, typeLabel, row.typeId, latestBatchId);
    const summary = buildStudentConsolidatedSummary({
      batchCurrentSem,
      type: typeLabel,
      typeId: row.typeId,
      baseSemFee: Number(baseSemFee) || 0,
      studentFeeRow: row,
      totalPaid: paidByEnrollment.get(enrollmentId) ?? 0,
    });

    return {
      id: row.id,
      enrollmentId: row.enrollment?.enrollment || String(enrollmentId),
      name: admission?.name?.trim() || '-',
      paymentOption: admission?.paymentOption?.trim() || row.paymentOption?.paymentOption || '-',
      program: row.program?.program || '-',
      batch: row.batch?.batch || '-',
      type: typeLabel || '-',
      currentSem: batchCurrentSem,
      ...summary,
    };
  });

  return {
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getStudentFeeStructures(page = 1, limit = 50, filters: Record<string, unknown> = {}) {
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters.program) where.program = { program: filters.program };
  if (filters.batch) where.batch = { batch: filters.batch };

  const [data, total] = await Promise.all([
    prisma.studentFeeStructure.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { enrollment: true, program: true, paymentOption: true, batch: true, type: true },
    }),
    prisma.studentFeeStructure.count({ where }),
  ]);

  return {
    data: data.map(item => mapStudentFeeRow(item)!),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getStudentFeeStructure(id: string | number) {
  if (id === 'new' || !id) return null;
  const item = await prisma.studentFeeStructure.findUnique({
    where: { id: parseInt(String(id), 10) },
    include: { enrollment: true, program: true, paymentOption: true, batch: true, type: true },
  });

  return mapStudentFeeRow(item as any);
}

export async function saveStudentFeeStructure(data: any) {
  const { id, enrollmentNo, program, paymentOption, batch, type, ...restData } = data;

  try {
    const lookups = await resolveStudentFeeLookups({
      enrollmentNo,
      program,
      paymentOption,
      batch,
      type,
    });

    if (!lookups.enrollmentId) {
      return { error: 'Enrollment number is required' };
    }

    const feeFields = [
      'couponName', 'couponName2', 'couponName3',
      'sem1Fee', 'sem2Fee', 'sem3Fee', 'sem4Fee', 'sem5Fee', 'sem6Fee',
      'sem1Scholarship', 'sem2Scholarship', 'sem3Scholarship', 'sem4Scholarship', 'sem5Scholarship', 'sem6Scholarship',
      'sem1FeeAfter', 'sem2FeeAfter', 'sem3FeeAfter', 'sem4FeeAfter', 'sem5FeeAfter', 'sem6FeeAfter',
    ];

    const payload: any = { ...lookups };
    for (const key of feeFields) {
      if (key in restData && restData[key] !== undefined) {
        payload[key] = restData[key];
      }
    }

    if (id && id !== 'new') {
      await prisma.studentFeeStructure.update({
        where: { id: parseInt(String(id), 10) },
        data: payload,
      });
    } else {
      await prisma.studentFeeStructure.upsert({
        where: { enrollmentId: lookups.enrollmentId },
        update: payload,
        create: payload,
      });
    }
    revalidatePath('/student-fee-structure');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { error: (error instanceof Error ? error.message : String(error)) };
  }
}

export async function deleteStudentFeeStructure(id: string | number) {
  try {
    await prisma.studentFeeStructure.delete({
      where: { id: parseInt(String(id), 10) },
    });
    revalidatePath('/student-fee-structure');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { error: (error instanceof Error ? error.message : String(error)) };
  }
}
