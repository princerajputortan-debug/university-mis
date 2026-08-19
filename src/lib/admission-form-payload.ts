import type { Prisma } from '@/generated/prisma';

export type AdmissionFormLookupIds = {
  enrollmentId: number | null;
  programId: number | null;
  paymentOptionId: number | null;
  batchId: number | null;
  typeId: number | null;
  statusId: number | null;
  placedStatusId: number | null;
  teamId: number | null;
  bifurcationId: number | null;
  locationId: number | null;
  nationalityId: number | null;
  leadSourceId: number | null;
  ugcStatusId: number | null;
  counselorId: number | null;
};

function connectFk(id: number | null | undefined) {
  if (id == null) return undefined;
  return { connect: { id } };
}

/** Prisma relation connects — works with checked create/update inputs. */
export function buildAdmissionFormRelationData(
  lookups: AdmissionFormLookupIds
): Prisma.AdmissionFormCreateInput {
  const data: Prisma.AdmissionFormCreateInput = {};

  if (lookups.enrollmentId) {
    data.enrollment = { connect: { id: lookups.enrollmentId } };
  }
  if (lookups.programId) data.program = connectFk(lookups.programId);
  if (lookups.paymentOptionId) data.paymentOption = connectFk(lookups.paymentOptionId);
  if (lookups.batchId) data.batch = connectFk(lookups.batchId);
  if (lookups.typeId) data.type = connectFk(lookups.typeId);
  if (lookups.statusId) data.status = connectFk(lookups.statusId);
  if (lookups.placedStatusId) data.placedStatus = connectFk(lookups.placedStatusId);
  if (lookups.teamId) data.team = connectFk(lookups.teamId);
  if (lookups.bifurcationId) data.bifurcation = connectFk(lookups.bifurcationId);
  if (lookups.locationId) data.location = connectFk(lookups.locationId);
  if (lookups.nationalityId) data.nationality = connectFk(lookups.nationalityId);
  if (lookups.leadSourceId) data.leadSource = connectFk(lookups.leadSourceId);
  if (lookups.ugcStatusId) data.ugcStatus = connectFk(lookups.ugcStatusId);
  if (lookups.counselorId) data.counselor = connectFk(lookups.counselorId);

  return data;
}

export type AdmissionFormScalarFields = {
  sno?: number | null;
  doa?: Date | null;
  name?: string | null;
  aadhaar?: string | null;
  modeOfPayment?: string | null;
  semFeeAfterDisc?: number | null;
  totalFeeWithDiscount?: number | null;
  currentSem?: number | null;
  feeAsPerStructure?: number | null;
  scholarship?: number | null;
  totalFee?: number | null;
  recdFee?: number | null;
  pendingFee?: number | null;
  category?: string | null;
};

export function buildAdmissionFormUpsertPayload(
  lookups: AdmissionFormLookupIds,
  scalars: AdmissionFormScalarFields
) {
  const relations = buildAdmissionFormRelationData(lookups);
  return {
    ...scalars,
    ...relations,
  } satisfies Prisma.AdmissionFormCreateInput;
}
