import { prisma } from '@/lib/prisma';
import {
  enrollmentJoinSql,
  findLegacyAdmissionFormIdByEnrollment,
  getEnrollmentTextById as getEnrollmentTextFromTable,
} from '@/lib/enrollment-source';
import {
  resolveAdmissionFormLookups,
  resolveBatchFk,
  resolvePlacementStatusFk,
  resolveProgramFk,
} from '@/lib/lookups';

export type LegacyAdmissionRow = {
  id: number;
  sno: number | null;
  date_of_admission: Date | string | null;
  enrollment_no: number | null;
  name: string | null;
  batch: number | null;
  payment_option: number | null;
  type: number | null;
  status: number | null;
  placed_status: number | null;
  program: number | null;
  lead_source: number | null;
  councellor: number | null;
  team: number | null;
  bifurcation: number | null;
  location: number | null;
  nationality: number | null;
  ugc_status: number | null;
  adhar: number | null;
  enrollment_text: string | null;
};

export async function getLegacyBatchByEnrollmentId(enrollmentId: number): Promise<number | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ batch: number | null }>>(
    `SELECT batch FROM AdmissionForm WHERE enrollment_no = ? LIMIT 1`,
    enrollmentId
  );
  return rows[0]?.batch != null ? Number(rows[0].batch) : null;
}

export async function getEnrollmentTextById(enrollmentId: number): Promise<string | null> {
  return getEnrollmentTextFromTable(enrollmentId);
}

export type AdmissionFormFilters = {
  search?: string;
  program?: string;
  batch?: string;
  category?: string;
  placedStatus?: string;
};

const LEGACY_SELECT = `
  SELECT
    af.id,
    af.sno,
    af.date_of_admission,
    af.enrollment_no,
    af.name,
    af.batch,
    af.payment_option,
    af.type,
    af.status,
    af.placed_status,
    af.program,
    af.lead_source,
    af.councellor,
    af.team,
    af.bifurcation,
    af.location,
    af.nationality,
    af.ugc_status,
    af.adhar,
    e.enrollment AS enrollment_text
  FROM AdmissionForm af
  ${enrollmentJoinSql('af')}
`;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, '\\$&');
}

async function resolveFilterId(
  value: string | undefined,
  resolver: (v: string) => Promise<number | null>
): Promise<number | null> {
  if (!value?.trim()) return null;
  return resolver(value.trim());
}

export async function buildLegacyAdmissionWhere(filters: AdmissionFormFilters = {}) {
  const clauses: string[] = ['1 = 1'];

  if (filters.search?.trim()) {
    const term = escapeLike(filters.search.trim());
    clauses.push(`e.enrollment LIKE '%${term}%'`);
  }

  const [programId, batchId, placedStatusId] = await Promise.all([
    resolveFilterId(filters.program, resolveProgramFk),
    resolveFilterId(filters.batch, resolveBatchFk),
    resolveFilterId(filters.placedStatus, resolvePlacementStatusFk),
  ]);

  if (programId != null) clauses.push(`af.program = ${programId}`);
  if (batchId != null) clauses.push(`af.batch = ${batchId}`);
  if (placedStatusId != null) clauses.push(`af.placed_status = ${placedStatusId}`);

  return clauses.join(' AND ');
}

export async function countLegacyAdmissionForms(filters: AdmissionFormFilters = {}) {
  const where = await buildLegacyAdmissionWhere(filters);
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(`
    SELECT COUNT(*) AS cnt
    FROM AdmissionForm af
    ${enrollmentJoinSql('af')}
    WHERE ${where}
  `);
  return Number(rows[0]?.cnt ?? 0);
}

export async function fetchLegacyAdmissionForms(options: {
  skip?: number;
  limit?: number;
  filters?: AdmissionFormFilters;
  orderBy?: 'id' | 'date_of_admission';
}) {
  const { skip = 0, limit = 50, filters = {}, orderBy = 'id' } = options;
  const where = await buildLegacyAdmissionWhere(filters);
  const orderClause = orderBy === 'date_of_admission' ? 'af.date_of_admission DESC' : 'af.id DESC';

  const rows = await prisma.$queryRawUnsafe<LegacyAdmissionRow[]>(`
    ${LEGACY_SELECT}
    WHERE ${where}
    ORDER BY ${orderClause}
    LIMIT ${limit} OFFSET ${skip}
  `);

  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    sno: toNumber(row.sno),
    enrollment_no: toNumber(row.enrollment_no),
    batch: toNumber(row.batch),
    payment_option: toNumber(row.payment_option),
    type: toNumber(row.type),
    status: toNumber(row.status),
    placed_status: toNumber(row.placed_status),
    program: toNumber(row.program),
    lead_source: toNumber(row.lead_source),
    councellor: toNumber(row.councellor),
    team: toNumber(row.team),
    bifurcation: toNumber(row.bifurcation),
    location: toNumber(row.location),
    nationality: toNumber(row.nationality),
    ugc_status: toNumber(row.ugc_status),
    adhar: toNumber(row.adhar),
    enrollment_text: row.enrollment_text ?? null,
  }));
}

export async function fetchLegacyAdmissionFormById(id: number) {
  const rows = await prisma.$queryRawUnsafe<LegacyAdmissionRow[]>(`
    ${LEGACY_SELECT}
    WHERE af.id = ${id}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    id: Number(row.id),
    sno: toNumber(row.sno),
    enrollment_no: toNumber(row.enrollment_no),
    batch: toNumber(row.batch),
    payment_option: toNumber(row.payment_option),
    type: toNumber(row.type),
    status: toNumber(row.status),
    placed_status: toNumber(row.placed_status),
    program: toNumber(row.program),
    lead_source: toNumber(row.lead_source),
    councellor: toNumber(row.councellor),
    team: toNumber(row.team),
    bifurcation: toNumber(row.bifurcation),
    location: toNumber(row.location),
    nationality: toNumber(row.nationality),
    ugc_status: toNumber(row.ugc_status),
    adhar: toNumber(row.adhar),
    enrollment_text: row.enrollment_text ?? null,
  };
}

type LookupMaps = {
  program: Map<number, string>;
  batch: Map<number, string>;
  paymentOption: Map<number, string>;
  placedStatus: Map<number, string>;
  type: Map<number, string>;
  status: Map<number, string>;
  team: Map<number, string>;
  bifurcation: Map<number, string>;
  location: Map<number, string>;
  nationality: Map<number, string>;
  leadSource: Map<number, string>;
  ugcStatus: Map<number, string>;
  counselor: Map<number, string>;
};

function collectIds(rows: LegacyAdmissionRow[]) {
  const ids = {
    program: new Set<number>(),
    batch: new Set<number>(),
    paymentOption: new Set<number>(),
    placedStatus: new Set<number>(),
    type: new Set<number>(),
    status: new Set<number>(),
    team: new Set<number>(),
    bifurcation: new Set<number>(),
    location: new Set<number>(),
    nationality: new Set<number>(),
    leadSource: new Set<number>(),
    ugcStatus: new Set<number>(),
    counselor: new Set<number>(),
  };

  for (const row of rows) {
    if (row.program) ids.program.add(row.program);
    if (row.batch) ids.batch.add(row.batch);
    if (row.payment_option) ids.paymentOption.add(row.payment_option);
    if (row.placed_status) ids.placedStatus.add(row.placed_status);
    if (row.type) ids.type.add(row.type);
    if (row.status) ids.status.add(row.status);
    if (row.team) ids.team.add(row.team);
    if (row.bifurcation) ids.bifurcation.add(row.bifurcation);
    if (row.location) ids.location.add(row.location);
    if (row.nationality) ids.nationality.add(row.nationality);
    if (row.lead_source) ids.leadSource.add(row.lead_source);
    if (row.ugc_status) ids.ugcStatus.add(row.ugc_status);
    if (row.councellor) ids.counselor.add(row.councellor);
  }

  return ids;
}

function toMap<T extends { id: number }>(
  rows: T[],
  labelKey: keyof T
): Map<number, string> {
  return new Map(rows.map((row) => [row.id, String(row[labelKey] ?? '')]));
}

export async function loadLegacyLookupMaps(rows: LegacyAdmissionRow[]): Promise<LookupMaps> {
  const ids = collectIds(rows);
  const [
    programs,
    batches,
    paymentOptions,
    placedStatuses,
    types,
    statuses,
    teams,
    bifurcations,
    locations,
    nationalities,
    leadSources,
    ugcStatuses,
    counselors,
  ] = await Promise.all([
    prisma.program.findMany({ where: { id: { in: [...ids.program] } }, select: { id: true, program: true } }),
    prisma.batch.findMany({ where: { id: { in: [...ids.batch] } }, select: { id: true, batch: true } }),
    prisma.paymentOption.findMany({
      where: { id: { in: [...ids.paymentOption] } },
      select: { id: true, paymentOption: true },
    }),
    prisma.placementStatus.findMany({
      where: { id: { in: [...ids.placedStatus] } },
      select: { id: true, placedStatus: true },
    }),
    prisma.admissionType.findMany({ where: { id: { in: [...ids.type] } }, select: { id: true, type: true } }),
    prisma.admissionStatus.findMany({ where: { id: { in: [...ids.status] } }, select: { id: true, status: true } }),
    prisma.team.findMany({ where: { id: { in: [...ids.team] } }, select: { id: true, team: true } }),
    prisma.bifurcation.findMany({
      where: { id: { in: [...ids.bifurcation] } },
      select: { id: true, bifurcation: true },
    }),
    prisma.location.findMany({ where: { id: { in: [...ids.location] } }, select: { id: true, location: true } }),
    prisma.nationality.findMany({
      where: { id: { in: [...ids.nationality] } },
      select: { id: true, nationality: true },
    }),
    prisma.leadSource.findMany({ where: { id: { in: [...ids.leadSource] } }, select: { id: true, lead: true } }),
    prisma.ugcStatus.findMany({
      where: { id: { in: [...ids.ugcStatus] } },
      select: { id: true, ugcStatus: true },
    }),
    prisma.counselor.findMany({
      where: { id: { in: [...ids.counselor] } },
      select: { id: true, counselor: true },
    }),
  ]);

  return {
    program: toMap(programs, 'program'),
    batch: toMap(batches, 'batch'),
    paymentOption: toMap(paymentOptions, 'paymentOption'),
    placedStatus: toMap(placedStatuses, 'placedStatus'),
    type: toMap(types, 'type'),
    status: toMap(statuses, 'status'),
    team: toMap(teams, 'team'),
    bifurcation: toMap(bifurcations, 'bifurcation'),
    location: toMap(locations, 'location'),
    nationality: toMap(nationalities, 'nationality'),
    leadSource: toMap(leadSources, 'lead'),
    ugcStatus: toMap(ugcStatuses, 'ugcStatus'),
    counselor: toMap(counselors, 'counselor'),
  };
}

export function legacyRowToFeeInput(row: LegacyAdmissionRow) {
  return {
    batchId: row.batch,
    programId: row.program,
    paymentOptionId: row.payment_option,
    feeAsPerStructure: null as number | null,
    currentSem: null as number | null,
    semFeeAfterDisc: null as number | null,
    totalFee: null as number | null,
    scholarship: null as number | null,
  };
}

export function computeFeeCategory(totalFee: number, recdFee: number) {
  if (totalFee <= 0) return '';
  if (recdFee > totalFee) return 'Excess Fee';
  if (recdFee >= totalFee) return 'Full Fee';
  if (recdFee > 0) return 'Partial Fee';
  return 'No Fee';
}

export function mapLegacyRowToForm(
  row: LegacyAdmissionRow,
  maps: LookupMaps,
  fees: {
    feeAsPerStructure: number;
    totalFee: number;
    scholarship: number;
    recdFee: number;
    pendingFee: number;
  }
) {
  const doa = row.date_of_admission ? new Date(row.date_of_admission) : null;

  return {
    id: row.id,
    sno: row.sno,
    doa,
    name: row.name,
    aadhaar: row.adhar != null ? String(row.adhar) : null,
    enrollmentId: row.enrollment_no,
    batchId: row.batch,
    programId: row.program,
    paymentOptionId: row.payment_option,
    typeId: row.type,
    statusId: row.status,
    placedStatusId: row.placed_status,
    teamId: row.team,
    bifurcationId: row.bifurcation,
    locationId: row.location,
    nationalityId: row.nationality,
    leadSourceId: row.lead_source,
    ugcStatusId: row.ugc_status,
    counselorId: row.councellor,
    enrollmentNo: row.enrollment_text || '',
    counselor: row.councellor ? maps.counselor.get(row.councellor) || '' : '',
    program: row.program ? maps.program.get(row.program) || String(row.program) : '',
    paymentOption: row.payment_option
      ? maps.paymentOption.get(row.payment_option) || String(row.payment_option)
      : '',
    batch: row.batch ? maps.batch.get(row.batch) || String(row.batch) : '',
    type: row.type ? maps.type.get(row.type) || String(row.type) : '',
    status: row.status ? maps.status.get(row.status) || String(row.status) : '',
    placedStatus: row.placed_status
      ? maps.placedStatus.get(row.placed_status) || String(row.placed_status)
      : '',
    team: row.team ? maps.team.get(row.team) || String(row.team) : '',
    bifurcation: row.bifurcation ? maps.bifurcation.get(row.bifurcation) || String(row.bifurcation) : '',
    location: row.location ? maps.location.get(row.location) || String(row.location) : '',
    nationality: row.nationality ? maps.nationality.get(row.nationality) || String(row.nationality) : '',
    leadSource: row.lead_source ? maps.leadSource.get(row.lead_source) || String(row.lead_source) : '',
    ugcStatus: row.ugc_status ? maps.ugcStatus.get(row.ugc_status) || String(row.ugc_status) : '',
    feeAsPerStructure: fees.feeAsPerStructure,
    totalFee: fees.totalFee,
    scholarship: fees.scholarship,
    recdFee: fees.recdFee,
    pendingFee: fees.pendingFee,
    category: computeFeeCategory(fees.totalFee, fees.recdFee),
    currentSem: null,
    totalFeeWithDiscount: null,
    semFeeAfterDisc: null,
    modeOfPayment: '',
    createdAt: null,
    updatedAt: null,
  };
}

export async function saveLegacyAdmissionForm(
  id: number | null,
  data: {
    enrollmentNo?: string;
    program?: string;
    paymentOption?: string;
    batch?: string;
    type?: string;
    status?: string;
    team?: string;
    bifurcation?: string;
    location?: string;
    nationality?: string;
    placedStatus?: string;
    leadSource?: string;
    ugcStatus?: string;
    counselor?: string;
    name?: string;
    aadhaar?: string;
    sno?: number | null;
    doa?: Date | null;
  }
) {
  const lookups = await resolveAdmissionFormLookups({
    enrollmentNo: data.enrollmentNo,
    program: data.program,
    paymentOption: data.paymentOption,
    batch: data.batch,
    type: data.type,
    status: data.status,
    team: data.team,
    bifurcation: data.bifurcation,
    location: data.location,
    nationality: data.nationality,
    placedStatus: data.placedStatus,
    leadSource: data.leadSource,
    ugcStatus: data.ugcStatus,
    counselor: data.counselor,
  });

  const dateValue = data.doa ? data.doa.toISOString().slice(0, 10) : null;
  const adhar = data.aadhaar ? Number(data.aadhaar) || null : null;

  let formId = id;
  if (!formId && lookups.enrollmentId) {
    formId = await findLegacyAdmissionFormIdByEnrollment(lookups.enrollmentId);
  }

  if (formId) {
    await prisma.$executeRawUnsafe(
      `UPDATE AdmissionForm SET
        date_of_admission = ?,
        enrollment_no = ?,
        name = ?,
        batch = ?,
        payment_option = ?,
        program = ?,
        type = ?,
        status = ?,
        placed_status = ?,
        team = ?,
        bifurcation = ?,
        location = ?,
        nationality = ?,
        lead_source = ?,
        ugc_status = ?,
        councellor = ?,
        adhar = ?,
        sno = ?
      WHERE id = ?`,
      dateValue,
      lookups.enrollmentId,
      data.name ?? null,
      lookups.batchId,
      lookups.paymentOptionId,
      lookups.programId,
      lookups.typeId,
      lookups.statusId,
      lookups.placedStatusId,
      lookups.teamId,
      lookups.bifurcationId,
      lookups.locationId,
      lookups.nationalityId,
      lookups.leadSourceId,
      lookups.ugcStatusId,
      lookups.counselorId,
      adhar,
      data.sno ?? null,
      formId
    );
    return formId;
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO AdmissionForm (
      date_of_admission, enrollment_no, name, batch, payment_option, program,
      type, status, placed_status, team, bifurcation, location, nationality,
      lead_source, ugc_status, councellor, adhar, sno
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    dateValue,
    lookups.enrollmentId,
    data.name ?? null,
    lookups.batchId,
    lookups.paymentOptionId,
    lookups.programId,
    lookups.typeId,
    lookups.statusId,
    lookups.placedStatusId,
    lookups.teamId,
    lookups.bifurcationId,
    lookups.locationId,
    lookups.nationalityId,
    lookups.leadSourceId,
    lookups.ugcStatusId,
    lookups.counselorId,
    adhar,
    data.sno ?? null
  );

  const inserted = await prisma.$queryRawUnsafe<Array<{ id: bigint }>>(
    'SELECT LAST_INSERT_ID() AS id'
  );
  return Number(inserted[0]?.id ?? 0);
}

export async function deleteLegacyAdmissionForm(id: number) {
  await prisma.$executeRawUnsafe('DELETE FROM AdmissionForm WHERE id = ?', id);
}
