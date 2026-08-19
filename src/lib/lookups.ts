import { prisma } from '@/lib/prisma';

/** Enrollment number is stored only on Enrollment; other tables use enrollmentId. */
export async function ensureEnrollmentId(enrollmentNo: string | null | undefined): Promise<number | null> {
  const normalized = enrollmentNo?.trim();
  if (!normalized || normalized.toLowerCase() === 'reco') return null;

  const existing = await prisma.enrollment.findUnique({ where: { enrollment: normalized } });
  if (existing) return existing.id;

  // The live Enrollment.id column has no AUTO_INCREMENT (it is rebuilt via raw SQL
  // by the enrollment sync scripts), so we assign the next id explicitly here —
  // consistent with the other ensure* lookups in this file.
  const id = await nextLookupId(() => prisma.enrollment.aggregate({ _max: { id: true } }));
  const created = await prisma.enrollment.create({ data: { id, enrollment: normalized } });
  return created.id;
}

async function nextLookupId(
  aggregate: () => Promise<{ _max: { id: number | null } }>
): Promise<number> {
  const { _max } = await aggregate();
  return (_max.id ?? 0) + 1;
}

export async function ensureProgramId(name: string | null | undefined): Promise<number | null> {
  const program = name?.trim();
  if (!program) return null;
  const existing = await prisma.program.findFirst({ where: { program } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.program.aggregate({ _max: { id: true } }));
  const created = await prisma.program.create({ data: { id, program } });
  return created.id;
}

export async function ensurePaymentOptionId(name: string | null | undefined): Promise<number | null> {
  const paymentOption = name?.trim();
  if (!paymentOption) return null;
  const existing = await prisma.paymentOption.findFirst({ where: { paymentOption } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.paymentOption.aggregate({ _max: { id: true } }));
  const created = await prisma.paymentOption.create({ data: { id, paymentOption } });
  return created.id;
}

export async function ensureBatchId(name: string | null | undefined): Promise<number | null> {
  const batch = name?.trim();
  if (!batch) return null;
  const existing = await prisma.batch.findFirst({ where: { batch } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.batch.aggregate({ _max: { id: true } }));
  const created = await prisma.batch.create({ data: { id, batch } });
  return created.id;
}

export async function ensureAdmissionTypeId(name: string | null | undefined): Promise<number | null> {
  const type = name?.trim();
  if (!type) return null;
  const existing = await prisma.admissionType.findFirst({ where: { type } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.admissionType.aggregate({ _max: { id: true } }));
  const created = await prisma.admissionType.create({ data: { id, type } });
  return created.id;
}

export async function ensureAdmissionStatusId(name: string | null | undefined): Promise<number | null> {
  const status = name?.trim();
  if (!status) return null;
  const existing = await prisma.admissionStatus.findFirst({ where: { status } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.admissionStatus.aggregate({ _max: { id: true } }));
  const created = await prisma.admissionStatus.create({ data: { id, status } });
  return created.id;
}

export async function ensurePlacementStatusId(name: string | null | undefined): Promise<number | null> {
  const placedStatus = name?.trim();
  if (!placedStatus) return null;
  const existing = await prisma.placementStatus.findFirst({ where: { placedStatus } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.placementStatus.aggregate({ _max: { id: true } }));
  const created = await prisma.placementStatus.create({ data: { id, placedStatus } });
  return created.id;
}

export async function ensureTeamId(name: string | null | undefined): Promise<number | null> {
  const team = name?.trim();
  if (!team) return null;
  const existing = await prisma.team.findFirst({ where: { team } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.team.aggregate({ _max: { id: true } }));
  const created = await prisma.team.create({ data: { id, team } });
  return created.id;
}

export async function ensureBifurcationId(name: string | null | undefined): Promise<number | null> {
  const bifurcation = name?.trim();
  if (!bifurcation) return null;
  const existing = await prisma.bifurcation.findFirst({ where: { bifurcation } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.bifurcation.aggregate({ _max: { id: true } }));
  const created = await prisma.bifurcation.create({ data: { id, bifurcation } });
  return created.id;
}

export async function ensureLocationId(name: string | null | undefined): Promise<number | null> {
  const location = name?.trim();
  if (!location) return null;
  const existing = await prisma.location.findFirst({ where: { location } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.location.aggregate({ _max: { id: true } }));
  const created = await prisma.location.create({ data: { id, location } });
  return created.id;
}

export async function ensureNationalityId(name: string | null | undefined): Promise<number | null> {
  const nationality = name?.trim();
  if (!nationality) return null;
  const existing = await prisma.nationality.findFirst({ where: { nationality } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.nationality.aggregate({ _max: { id: true } }));
  const created = await prisma.nationality.create({ data: { id, nationality } });
  return created.id;
}

export async function ensureCounselorId(name: string | null | undefined): Promise<number | null> {
  const counselor = name?.trim();
  if (!counselor) return null;
  const existing = await prisma.counselor.findFirst({ where: { counselor } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.counselor.aggregate({ _max: { id: true } }));
  const created = await prisma.counselor.create({ data: { id, counselor } });
  return created.id;
}

export async function ensureLeadSourceId(name: string | null | undefined): Promise<number | null> {
  const lead = name?.trim();
  if (!lead) return null;
  const existing = await prisma.leadSource.findFirst({ where: { lead } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.leadSource.aggregate({ _max: { id: true } }));
  const created = await prisma.leadSource.create({ data: { id, lead } });
  return created.id;
}

export async function ensureUgcStatusId(name: string | null | undefined): Promise<number | null> {
  const ugcStatus = name?.trim();
  if (!ugcStatus) return null;
  const existing = await prisma.ugcStatus.findFirst({ where: { ugcStatus } });
  if (existing) return existing.id;
  const id = await nextLookupId(() => prisma.ugcStatus.aggregate({ _max: { id: true } }));
  const created = await prisma.ugcStatus.create({ data: { id, ugcStatus } });
  return created.id;
}

/** Accept numeric FK from reference CSV or a text label from the UI. */
async function resolveFkOrLabel(
  value: string | number | null | undefined,
  findById: (id: number) => Promise<{ id: number } | null>,
  ensureByLabel: (label: string) => Promise<number | null>
): Promise<number | null> {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const id = parseInt(raw, 10);
    const row = await findById(id);
    if (row) return id;
  }
  return ensureByLabel(raw);
}

export async function resolveProgramFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.program.findUnique({ where: { id } }),
    ensureProgramId
  );
}

export async function resolvePaymentOptionFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.paymentOption.findUnique({ where: { id } }),
    ensurePaymentOptionId
  );
}

export async function resolveBatchFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(value, (id) => prisma.batch.findUnique({ where: { id } }), ensureBatchId);
}

export async function resolveAdmissionTypeFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.admissionType.findUnique({ where: { id } }),
    ensureAdmissionTypeId
  );
}

export async function resolveAdmissionStatusFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.admissionStatus.findUnique({ where: { id } }),
    ensureAdmissionStatusId
  );
}

export async function resolvePlacementStatusFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.placementStatus.findUnique({ where: { id } }),
    ensurePlacementStatusId
  );
}

export async function resolveTeamFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(value, (id) => prisma.team.findUnique({ where: { id } }), ensureTeamId);
}

export async function resolveBifurcationFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.bifurcation.findUnique({ where: { id } }),
    ensureBifurcationId
  );
}

export async function resolveLocationFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(value, (id) => prisma.location.findUnique({ where: { id } }), ensureLocationId);
}

export async function resolveNationalityFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.nationality.findUnique({ where: { id } }),
    ensureNationalityId
  );
}

export async function resolveLeadSourceFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.leadSource.findUnique({ where: { id } }),
    ensureLeadSourceId
  );
}

export async function resolveCounselorFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.counselor.findUnique({ where: { id } }),
    ensureCounselorId
  );
}

export async function resolveUgcStatusFk(value: string | number | null | undefined) {
  return resolveFkOrLabel(
    value,
    (id) => prisma.ugcStatus.findUnique({ where: { id } }),
    ensureUgcStatusId
  );
}

export async function resolveEnrollmentFk(value: string | number | null | undefined): Promise<number | null> {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const id = parseInt(raw, 10);
    const row = await prisma.enrollment.findUnique({ where: { id } });
    if (row) return id;
  }
  return ensureEnrollmentId(raw);
}

export type AdmissionFormLookupInput = {
  /** Enrollment text (UGL2022…) or numeric enrollment table id from reference CSV */
  enrollmentNo?: string | number | null;
  program?: string | number | null;
  paymentOption?: string | number | null;
  batch?: string | number | null;
  type?: string | number | null;
  status?: string | number | null;
  placedStatus?: string | number | null;
  team?: string | number | null;
  bifurcation?: string | number | null;
  location?: string | number | null;
  nationality?: string | number | null;
  leadSource?: string | number | null;
  ugcStatus?: string | number | null;
  counselor?: string | number | null;
};

/** Resolve CSV/UI labels (or numeric ids from Software-main_data_base) to foreign keys. */
export async function resolveAdmissionFormLookups(input: AdmissionFormLookupInput) {
  const [
    enrollmentId,
    programId,
    paymentOptionId,
    batchId,
    typeId,
    statusId,
    placedStatusId,
    teamId,
    bifurcationId,
    locationId,
    nationalityId,
    leadSourceId,
    ugcStatusId,
    counselorId,
  ] = await Promise.all([
    resolveEnrollmentFk(input.enrollmentNo),
    resolveProgramFk(input.program),
    resolvePaymentOptionFk(input.paymentOption),
    resolveBatchFk(input.batch),
    resolveAdmissionTypeFk(input.type),
    resolveAdmissionStatusFk(input.status),
    resolvePlacementStatusFk(input.placedStatus),
    resolveTeamFk(input.team),
    resolveBifurcationFk(input.bifurcation),
    resolveLocationFk(input.location),
    resolveNationalityFk(input.nationality),
    resolveLeadSourceFk(input.leadSource),
    resolveUgcStatusFk(input.ugcStatus),
    resolveCounselorFk(input.counselor),
  ]);

  return {
    enrollmentId,
    programId,
    paymentOptionId,
    batchId,
    typeId,
    statusId,
    placedStatusId,
    teamId,
    bifurcationId,
    locationId,
    nationalityId,
    leadSourceId,
    ugcStatusId,
    counselorId,
  };
}

export type StudentFeeLookupInput = {
  enrollmentNo?: string | null;
  program?: string | null;
  paymentOption?: string | null;
  batch?: string | null;
  type?: string | null;
};

export async function resolveStudentFeeLookups(input: StudentFeeLookupInput) {
  // Use the FK resolvers (not ensure*) so that numeric lookup ids from the
  // main_data_base-style CSV (e.g. Enrollment No = Enrollment.id, Program = 1,
  // Batch = 1) map to existing rows, while text labels (e.g. "Batch 9",
  // "MBA Online") still resolve/create via the ensure* fallback inside each.
  const [enrollmentId, programId, paymentOptionId, batchId, typeId] = await Promise.all([
    resolveEnrollmentFk(input.enrollmentNo),
    resolveProgramFk(input.program),
    resolvePaymentOptionFk(input.paymentOption),
    resolveBatchFk(input.batch),
    resolveAdmissionTypeFk(input.type),
  ]);

  return { enrollmentId, programId, paymentOptionId, batchId, typeId };
}
