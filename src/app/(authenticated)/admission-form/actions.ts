'use server'

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { formatDateForDisplay, parseDateInput } from '@/lib/dates';
import {
  buildLegacyAdmissionWhere,
  countLegacyAdmissionForms,
  deleteLegacyAdmissionForm,
  fetchLegacyAdmissionFormById,
  fetchLegacyAdmissionForms,
  legacyRowToFeeInput,
  loadLegacyLookupMaps,
  mapLegacyRowToForm,
  saveLegacyAdmissionForm,
} from '@/lib/legacy-admission-form';
import { resolveAdmissionFormLookups } from '@/lib/lookups';

export async function getPlacementStatuses() {
  return prisma.placementStatus.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, placedStatus: true },
  });
}

export async function getFeeStructure(batch: string, paymentOption: string, program: string) {
  if (!batch || !paymentOption || !program) return null;

  const { batchId, paymentOptionId, programId } = await resolveAdmissionFormLookups({
    batch,
    paymentOption,
    program,
  });
  if (!batchId || !paymentOptionId || !programId) return 0;

  const feeStructure = await prisma.feeStructure.findUnique({
    where: {
      batchId_paymentOptionId_programId: {
        batchId,
        paymentOptionId,
        programId,
      },
    },
  });

  return feeStructure?.semFee ?? 0;
}

async function getSemFeeMapForForms(
  forms: { batchId: number | null; programId: number | null; paymentOptionId: number | null }[]
) {
  const keys = new Set<string>();
  for (const form of forms) {
    if (form.batchId && form.programId && form.paymentOptionId) {
      keys.add(`${form.batchId}:${form.paymentOptionId}:${form.programId}`);
    }
  }
  if (keys.size === 0) return new Map<string, number>();

  const feeRows = await prisma.feeStructure.findMany({
    select: { batchId: true, paymentOptionId: true, programId: true, semFee: true },
  });

  const map = new Map<string, number>();
  for (const row of feeRows) {
    const key = `${row.batchId}:${row.paymentOptionId}:${row.programId}`;
    if (keys.has(key)) map.set(key, row.semFee);
  }
  return map;
}

function resolveFeeFieldsFromStructure(
  form: {
    batchId: number | null;
    programId: number | null;
    paymentOptionId: number | null;
    feeAsPerStructure?: number | null;
    currentSem?: number | null;
    semFeeAfterDisc?: number | null;
    totalFee?: number | null;
    scholarship?: number | null;
  },
  semFeeMap: Map<string, number>
) {
  const key =
    form.batchId && form.programId && form.paymentOptionId
      ? `${form.batchId}:${form.paymentOptionId}:${form.programId}`
      : null;
  const semFee = key ? semFeeMap.get(key) : undefined;
  const feeAsPerStructure =
    form.feeAsPerStructure && form.feeAsPerStructure > 0
      ? form.feeAsPerStructure
      : (semFee ?? form.feeAsPerStructure ?? 0);
  const currentSem = form.currentSem || 0;
  const totalFee =
    form.totalFee && form.totalFee > 0 ? form.totalFee : feeAsPerStructure * currentSem;
  const feeAfterDisc = form.semFeeAfterDisc ?? 0;
  const scholarship =
    form.scholarship && form.scholarship > 0
      ? form.scholarship
      : feeAsPerStructure - feeAfterDisc;

  return { feeAsPerStructure, totalFee, scholarship };
}

export async function getPaymentsForEnrollment(enrollmentNo: string) {
  try {
    const payments = await prisma.consolidatedPayment.findMany({
      where: { enrollment: { enrollment: enrollmentNo } },
      select: { amount: true, sourceName: true }
    });
    
    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    const sources = Array.from(new Set(payments.map(p => p.sourceName).filter(Boolean)));
    const modeOfPayment = sources.join(', ');

    return { total, modeOfPayment };
  } catch (error) {
    console.error('Error fetching payments:', error);
    return { total: 0, modeOfPayment: '' };
  }
}

async function getRecdFeeByEnrollmentIds(enrollmentIds: number[]) {
  if (enrollmentIds.length === 0) return new Map<number, number>();

  const paymentTotals = await prisma.consolidatedPayment.groupBy({
    by: ['enrollmentId'],
    where: { enrollmentId: { in: enrollmentIds } },
    _sum: { amount: true },
  });

  const paymentMap = new Map<number, number>();
  paymentTotals.forEach(p => {
    if (p.enrollmentId) paymentMap.set(p.enrollmentId, p._sum.amount || 0);
  });
  return paymentMap;
}

function resolveRecdAndPendingFees(form: {
  enrollmentId: number | null;
  recdFee?: number | null;
  totalFee?: number | null;
}, paymentMap: Map<number, number>) {
  const recdFromPayments = form.enrollmentId ? paymentMap.get(form.enrollmentId) || 0 : 0;
  const totalFee = form.totalFee || 0;
  const recdFee = recdFromPayments > 0 ? recdFromPayments : (form.recdFee || 0);
  const pendingFee = totalFee - recdFee;
  return { recdFee, pendingFee: pendingFee > 0 ? pendingFee : 0 };
}

export async function saveAdmissionForm(data: any) {
  const {
    id,
    enrollmentNo,
    program,
    paymentOption,
    batch,
    type,
    status,
    team,
    bifurcation,
    location,
    nationality,
    placedStatus,
    leadSource,
    ugcStatus,
    name,
    counselor,
    aadhaar,
    ...restData
  } = data;

  const parsedDoa = parseDateInput(restData.doa);
  if (parsedDoa) restData.doa = parsedDoa;
  else delete restData.doa;

  try {
    const allowedFields = [
      'doa', 'sno',
      'totalFeeWithDiscount', 'currentSem', 'feeAsPerStructure', 'scholarship',
      'semFeeAfterDisc', 'totalFee', 'recdFee', 'pendingFee', 'category',
      'modeOfPayment',
    ];

    const scalars: Record<string, unknown> = {
      name: name ?? restData.name ?? null,
      aadhaar: aadhaar ?? restData.aadhaar ?? null,
    };

    for (const key of allowedFields) {
      if (key in restData && restData[key] !== undefined) {
        scalars[key] = restData[key];
      }
    }

    await saveLegacyAdmissionForm(id && id !== 'new' ? Number(id) : null, {
      enrollmentNo,
      program,
      paymentOption,
      batch,
      type,
      status,
      team,
      bifurcation,
      location,
      nationality,
      placedStatus,
      leadSource,
      ugcStatus,
      counselor: counselor ?? restData.counselor,
      name: name ?? restData.name ?? undefined,
      aadhaar: aadhaar ?? restData.aadhaar ?? undefined,
      sno: scalars.sno as number | null | undefined,
      doa: scalars.doa as Date | null | undefined,
    });
    revalidatePath('/admission-form');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { error: (error instanceof Error ? error.message : String(error)) };
  }
}

export async function getForms(page = 1, limit = 50, filters: Record<string, unknown> = {}) {
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    fetchLegacyAdmissionForms({ skip, limit, filters }),
    countLegacyAdmissionForms(filters),
  ]);
  const lookupMaps = await loadLegacyLookupMaps(rows);

  const enrollmentIds = rows.map((row) => row.enrollment_no).filter(Boolean) as number[];
  const feeInputs = rows.map(legacyRowToFeeInput);

  const [paymentMap, semFeeMap] = await Promise.all([
    getRecdFeeByEnrollmentIds(enrollmentIds),
    getSemFeeMapForForms(feeInputs),
  ]);

  let mappedData = rows.map((row) => {
    const feeInput = legacyRowToFeeInput(row);
    const { feeAsPerStructure, totalFee, scholarship } = resolveFeeFieldsFromStructure(feeInput, semFeeMap);
    const { recdFee, pendingFee } = resolveRecdAndPendingFees(
      { enrollmentId: row.enrollment_no, totalFee },
      paymentMap
    );

    return mapLegacyRowToForm(row, lookupMaps, {
      feeAsPerStructure,
      totalFee,
      scholarship,
      recdFee,
      pendingFee,
    });
  });

  if (filters.category) {
    mappedData = mappedData.filter((form) => form.category === filters.category);
  }

  return {
    data: mappedData,
    total: filters.category ? mappedData.length : total,
    page,
    totalPages: Math.ceil((filters.category ? mappedData.length : total) / limit),
  };
}


export async function getForm(id: string | number) {
  if (id === 'new' || !id) return null;
  const row = await fetchLegacyAdmissionFormById(Number(id));
  if (!row) return null;

  const [lookupMaps, semFeeMap, paymentMap] = await Promise.all([
    loadLegacyLookupMaps([row]),
    getSemFeeMapForForms([legacyRowToFeeInput(row)]),
    row.enrollment_no
      ? getRecdFeeByEnrollmentIds([row.enrollment_no])
      : Promise.resolve(new Map<number, number>()),
  ]);

  const feeInput = legacyRowToFeeInput(row);
  const { feeAsPerStructure, totalFee, scholarship } = resolveFeeFieldsFromStructure(feeInput, semFeeMap);
  const { recdFee, pendingFee } = resolveRecdAndPendingFees(
    { enrollmentId: row.enrollment_no, totalFee },
    paymentMap
  );

  return mapLegacyRowToForm(row, lookupMaps, {
    feeAsPerStructure,
    totalFee,
    scholarship,
    recdFee,
    pendingFee,
  });
}

export async function exportFormsByDateRange(startDateStr: string, endDateStr: string, filters: Record<string, unknown> = {}) {
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  
  // To include the entire end date, we set it to end of day
  endDate.setUTCHours(23, 59, 59, 999);

  const validFilters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      validFilters[key] = value;
    }
  }

  const where = await buildLegacyAdmissionWhere(validFilters);
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);

  return prisma.$queryRawUnsafe(`
    SELECT af.*, e.enrollment AS enrollment_text
    FROM AdmissionForm af
    LEFT JOIN Enrollment e ON e.id = af.enrollment_no
    WHERE ${where}
      AND af.date_of_admission >= '${start}'
      AND af.date_of_admission <= '${end}'
    ORDER BY af.date_of_admission DESC
  `);
}

export async function exportFilteredForms(filters: Record<string, unknown> = {}) {
  const legacyFilters: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value) legacyFilters[key] = String(value);
  }

  const rows = await fetchLegacyAdmissionForms({
    skip: 0,
    limit: 50000,
    filters: legacyFilters,
  });
  const lookupMaps = await loadLegacyLookupMaps(rows);
  const enrollmentIds = rows.map((row) => row.enrollment_no).filter(Boolean) as number[];
  const [paymentMap, semFeeMap] = await Promise.all([
    getRecdFeeByEnrollmentIds(enrollmentIds),
    getSemFeeMapForForms(rows.map(legacyRowToFeeInput)),
  ]);

  const mapped = rows.map((row) => {
    const feeInput = legacyRowToFeeInput(row);
    const { feeAsPerStructure, totalFee, scholarship } = resolveFeeFieldsFromStructure(feeInput, semFeeMap);
    const { recdFee, pendingFee } = resolveRecdAndPendingFees(
      { enrollmentId: row.enrollment_no, totalFee },
      paymentMap
    );
    return mapLegacyRowToForm(row, lookupMaps, {
      feeAsPerStructure,
      totalFee,
      scholarship,
      recdFee,
      pendingFee,
    });
  });

  const filtered = legacyFilters.category
    ? mapped.filter((form) => form.category === legacyFilters.category)
    : mapped;

  return filtered.map((form, index) => ({
    ID: index + 1,
    'Date of Admission': formatDateForDisplay(form.doa),
    'Enrollment No': form.enrollmentNo,
    Program: form.program,
    'Payment Option': form.paymentOption,
    Batch: form.batch,
    Type: form.type,
    Status: form.status,
    Team: form.team,
    Bifurcation: form.bifurcation,
    Location: form.location,
    'Total Fee With Discount': form.totalFeeWithDiscount || 0,
    'Current Sem': form.currentSem || '',
    'Fee As Per Structure': form.feeAsPerStructure || 0,
    Scholarship: form.scholarship || 0,
    'Sem Fee After Disc': form.semFeeAfterDisc || 0,
    'Total Fee': form.totalFee || 0,
    'Recd Fee': form.recdFee,
    'Pending Fee': form.pendingFee,
    Category: form.category || '',
    'Mode Of Payment': form.modeOfPayment || '',
    'Placed Status': form.placedStatus || '',
    Nationality: form.nationality || '',
    'Lead Source': form.leadSource || '',
    'UGC Status': form.ugcStatus || '',
    Name: form.name || '',
    Counselor: form.counselor || '',
    Aadhaar: form.aadhaar || '',
    'Created At': '',
  }));
}

export async function deleteAdmissionForm(id: string | number) {
  try {
    await deleteLegacyAdmissionForm(Number(id));
    revalidatePath('/admission-form');
    return { success: true };
  } catch (error: unknown) {
    console.error(error);
    return { error: (error instanceof Error ? error.message : String(error)) };
  }
}
