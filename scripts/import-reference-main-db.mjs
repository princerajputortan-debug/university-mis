/**
 * Imports Enrollment + AdmissionForm from Software reference CSVs.
 * Prerequisite: node scripts/seed-reference-lookups.mjs
 */
import { PrismaClient } from '@prisma/client';
import { readReferenceCsv, pickField, parseIntId } from './reference-csv.mjs';

const prisma = new PrismaClient();
const BATCH = 1000;
const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;

function parseDoa(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function importEnrollments() {
  const rows = readReferenceCsv('Software-enrollment_id.csv');
  const slice = limit ? rows.slice(0, limit) : rows;
  let count = 0;

  for (let i = 0; i < slice.length; i += BATCH) {
    const chunk = slice.slice(i, i + BATCH);
    const data = [];
    for (const row of chunk) {
      const id = parseIntId(row.id);
      const enrollment = pickField(row, 'enrollment');
      if (!id || !enrollment) continue;
      data.push({ id, enrollment });
    }
    if (data.length) {
      const result = await prisma.enrollment.createMany({ data, skipDuplicates: true });
      count += result.count;
    }
    console.log(`Enrollments: ${Math.min(i + BATCH, slice.length)} / ${slice.length}`);
  }
  return count;
}

async function importAdmissionForms() {
  const rows = readReferenceCsv('Software-main_data_base.csv');
  const slice = limit ? rows.slice(0, limit) : rows;
  let count = 0;
  let skipped = 0;

  for (let i = 0; i < slice.length; i += BATCH) {
    const chunk = slice.slice(i, i + BATCH);
    const data = [];

    for (const row of chunk) {
      const enrollmentId = parseIntId(pickField(row, 'Enrollment_No', 'Enrollment No', 'enrollmentId'));
      if (!enrollmentId) {
        skipped++;
        continue;
      }

      data.push({
        sno: parseIntId(pickField(row, 'Sno', 'sno')),
        doa: parseDoa(pickField(row, 'Date_of_Admission', 'Date of Admission', 'doa')),
        name: pickField(row, 'Name', 'name') || null,
        counselorId: parseIntId(pickField(row, 'Councellor', 'Counselor', 'counselorId')),
        aadhaar: pickField(row, 'Adhar', 'Aadhaar', 'aadhaar') || null,
        enrollmentId,
        batchId: parseIntId(pickField(row, 'Batch', 'batchId')),
        paymentOptionId: parseIntId(pickField(row, 'Payment_option', 'Payment Option', 'paymentOptionId')),
        typeId: parseIntId(pickField(row, 'Type', 'typeId')),
        statusId: parseIntId(pickField(row, 'Status', 'statusId')),
        placedStatusId: parseIntId(pickField(row, 'Placed Status', 'Placed_Status', 'placedStatusId')),
        programId: parseIntId(pickField(row, 'Program', 'programId')),
        leadSourceId: parseIntId(pickField(row, 'Lead_source', 'Lead Source', 'leadSourceId')),
        teamId: parseIntId(pickField(row, 'Team', 'teamId')),
        bifurcationId: parseIntId(pickField(row, 'Bifurcation', 'bifurcationId')),
        locationId: parseIntId(pickField(row, 'Location', 'locationId')),
        nationalityId: parseIntId(pickField(row, 'nationality', 'Nationality', 'nationalityId')),
        ugcStatusId: parseIntId(pickField(row, 'UGC_Status', 'UGC Status', 'ugcStatusId')),
      });
    }

    if (data.length) {
      const result = await prisma.admissionForm.createMany({ data, skipDuplicates: true });
      count += result.count;
    }
    console.log(`Admission forms: ${Math.min(i + BATCH, slice.length)} / ${slice.length}`);
  }

  return { count, skipped };
}

async function main() {
  console.log('Importing from prisma/reference-data/ ...');
  const enrollments = await importEnrollments();
  const forms = await importAdmissionForms();
  console.log('Import finished:', { enrollments, forms });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
