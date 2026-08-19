/**
 * Import new admission forms + enrollment_id rows from CSV exports.
 *
 * Usage:
 *   node scripts/import-admission-form-csv.mjs [admission-csv] [enrollment-csv]
 *
 * Defaults:
 *   admission: Downloads/admission_form_main_data_base_2026-06-18.csv
 *   enrollment: Downloads/enrollment-template (1).csv
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const downloads = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads');

const admissionPath =
  process.argv[2] ||
  path.join(downloads, 'admission_form_main_data_base_2026-06-18.csv');
const enrollmentPath =
  process.argv[3] || path.join(downloads, 'enrollment-template (1).csv');

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const parsed = Papa.parse(fs.readFileSync(filePath, 'utf8').trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) {
    console.warn('CSV warnings:', parsed.errors.slice(0, 3));
  }
  return parsed.data;
}

function pick(row, ...keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function parseIntOrNull(value) {
  const raw = String(value ?? '').trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  return parseInt(raw, 10);
}

function parseFloatOrNull(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function parseDate(value) {
  const raw = pick({ v: value }, 'v');
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }
  const dmy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function importEnrollments(rows) {
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const id = parseIntOrNull(pick(row, 'id', 'Id', 'ID'));
    const enrollment = pick(row, 'enrollment', 'Enrollment');
    if (!id || !enrollment) continue;

    const existing = await prisma.$queryRawUnsafe(
      `SELECT id, enrollment FROM enrollment_id WHERE id = ${id} LIMIT 1`
    );
    if (existing.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE enrollment_id SET enrollment = ? WHERE id = ?`,
        enrollment,
        id
      );
      updated++;
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO enrollment_id (id, enrollment) VALUES (?, ?)`,
        id,
        enrollment
      );
      inserted++;
    }
  }

  return { inserted, updated };
}

async function importAdmissionForms(rows) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const enrollmentNo = parseIntOrNull(
      pick(row, 'Enrollment_No', 'Enrollment No', 'enrollment_no', 'enrollmentId')
    );
    if (!enrollmentNo) {
      skipped++;
      continue;
    }

    const sno = parseIntOrNull(pick(row, 'Sno', 'sno')) ?? enrollmentNo;
    const id = enrollmentNo;
    const dateOfAdmission = parseDate(
      pick(row, 'Date_of_Admission', 'Date of Admission', 'doa')
    );
    const name = pick(row, 'Name', 'name') || null;
    const batch = parseIntOrNull(pick(row, 'Batch', 'batch'));
    const paymentOption = parseIntOrNull(
      pick(row, 'Payment_option', 'Payment Option', 'payment_option')
    );
    const type = parseIntOrNull(pick(row, 'Type', 'type'));
    const status = parseIntOrNull(pick(row, 'Status', 'status'));
    const placedStatus = parseIntOrNull(
      pick(row, 'Placed Status', 'Placed_Status', 'placed_status')
    );
    const program = parseIntOrNull(pick(row, 'Program', 'program'));
    const leadSource = parseIntOrNull(
      pick(row, 'Lead_source', 'Lead Source', 'lead_source')
    );
    const councellor = parseFloatOrNull(pick(row, 'Councellor', 'Counselor', 'councellor'));
    const team = parseIntOrNull(pick(row, 'Team', 'team'));
    const bifurcation = parseIntOrNull(pick(row, 'Bifurcation', 'bifurcation'));
    const location = parseIntOrNull(pick(row, 'Location', 'location'));
    const nationality = parseIntOrNull(pick(row, 'nationality', 'Nationality'));
    const ugcStatus = parseIntOrNull(
      pick(row, 'UGC_Status', 'UGC Status', 'ugc_status')
    );
    const adhar = parseFloatOrNull(pick(row, 'Adhar', 'Aadhaar', 'adhar'));

    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM AdmissionForm WHERE enrollment_no = ${enrollmentNo} OR id = ${id} LIMIT 1`
    );

    if (existing.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE AdmissionForm SET
          sno = ?,
          date_of_admission = ?,
          enrollment_no = ?,
          name = ?,
          batch = ?,
          payment_option = ?,
          type = ?,
          status = ?,
          placed_status = ?,
          program = ?,
          lead_source = ?,
          councellor = ?,
          team = ?,
          bifurcation = ?,
          location = ?,
          nationality = ?,
          ugc_status = ?,
          adhar = ?
        WHERE id = ?`,
        sno,
        dateOfAdmission,
        enrollmentNo,
        name,
        batch,
        paymentOption,
        type,
        status,
        placedStatus,
        program,
        leadSource,
        councellor,
        team,
        bifurcation,
        location,
        nationality,
        ugcStatus,
        adhar,
        Number(existing[0].id)
      );
      updated++;
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO AdmissionForm (
          id, sno, date_of_admission, enrollment_no, name, batch, payment_option,
          type, status, placed_status, program, lead_source, councellor, team,
          bifurcation, location, nationality, ugc_status, adhar
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        sno,
        dateOfAdmission,
        enrollmentNo,
        name,
        batch,
        paymentOption,
        type,
        status,
        placedStatus,
        program,
        leadSource,
        councellor,
        team,
        bifurcation,
        location,
        nationality,
        ugcStatus,
        adhar
      );
      inserted++;
    }
  }

  return { inserted, updated, skipped };
}

async function syncEnrollmentPrismaTable() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT id, TRIM(enrollment) AS enrollment
    FROM enrollment_id
    WHERE id IS NOT NULL AND TRIM(enrollment) != ''
    ORDER BY id ASC
  `);

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Enrollment (
      id INT NOT NULL AUTO_INCREMENT,
      enrollment VARCHAR(191) NOT NULL,
      prefix VARCHAR(191) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY Enrollment_enrollment_key (enrollment)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE Enrollment');

  const seen = new Set();
  const prepared = [];
  for (const row of rows) {
    let label = String(row.enrollment).slice(0, 191);
    const norm = label.toLowerCase();
    if (seen.has(norm)) {
      label = `${label} (#${row.id})`.slice(0, 191);
    } else {
      seen.add(norm);
    }
    prepared.push({ id: Number(row.id), label });
  }

  for (let i = 0; i < prepared.length; i += 1000) {
    const chunk = prepared.slice(i, i + 1000);
    const values = chunk
      .map((r) => `(${r.id}, '${r.label.replace(/'/g, "''")}')`)
      .join(',');
    await prisma.$executeRawUnsafe(`INSERT INTO Enrollment (id, enrollment) VALUES ${values}`);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');

  return prepared.length;
}

async function main() {
  console.log('Admission CSV:', admissionPath);

  const admissionRows = readCsv(admissionPath);

  const [{ c: formsBefore }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS c FROM AdmissionForm'
  );
  const [{ c: enrollBefore }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS c FROM enrollment_id'
  );

  console.log(`Before: ${Number(enrollBefore)} enrollments, ${Number(formsBefore)} admission forms`);

  if (fs.existsSync(enrollmentPath)) {
    console.log('Enrollment CSV:', enrollmentPath);
    const enrollmentRows = readCsv(enrollmentPath);
    const enrollResult = await importEnrollments(enrollmentRows);
    console.log(
      `enrollment_id: inserted ${enrollResult.inserted}, updated ${enrollResult.updated}`
    );
    const enrollmentSynced = await syncEnrollmentPrismaTable();
    console.log(`Enrollment (Prisma) synced: ${enrollmentSynced} rows`);
  } else {
    console.log('Enrollment CSV not found — skipping enrollment_id import');
  }

  const formResult = await importAdmissionForms(admissionRows);
  console.log(
    `AdmissionForm: inserted ${formResult.inserted}, updated ${formResult.updated}, skipped ${formResult.skipped}`
  );

  const [{ c: formsAfter }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS c FROM AdmissionForm'
  );
  const [{ c: enrollAfter }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS c FROM enrollment_id'
  );

  console.log(`After: ${Number(enrollAfter)} enrollments, ${Number(formsAfter)} admission forms`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
