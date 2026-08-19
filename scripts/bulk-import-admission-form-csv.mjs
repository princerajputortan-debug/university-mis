/**
 * Atomic replace of AdmissionForm from CSV (handles table with no PK).
 * Usage: node scripts/bulk-import-admission-form-csv.mjs <path-to-csv>
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const CHUNK = 500;

const admissionPath = process.argv[2];
if (!admissionPath) {
  console.error('Usage: node scripts/bulk-import-admission-form-csv.mjs <csv>');
  process.exit(1);
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
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function sqlVal(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function main() {
  if (!fs.existsSync(admissionPath)) throw new Error(`File not found: ${admissionPath}`);

  console.log('Admission CSV:', path.resolve(admissionPath));
  const parsed = Papa.parse(fs.readFileSync(admissionPath, 'utf8').trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const byEnrollment = new Map();
  let skipped = 0;
  let csvDupes = 0;
  for (const row of parsed.data) {
    const enrollmentNo = parseIntOrNull(
      pick(row, 'Enrollment_No', 'Enrollment No', 'enrollment_no', 'enrollmentId')
    );
    if (!enrollmentNo) {
      skipped++;
      continue;
    }
    if (byEnrollment.has(enrollmentNo)) csvDupes++;
    const sno = parseIntOrNull(pick(row, 'Sno', 'sno')) ?? enrollmentNo;
    byEnrollment.set(enrollmentNo, {
      id: enrollmentNo,
      sno,
      date_of_admission: parseDate(pick(row, 'Date_of_Admission', 'Date of Admission', 'doa')),
      enrollment_no: enrollmentNo,
      name: pick(row, 'Name', 'name') || null,
      batch: parseIntOrNull(pick(row, 'Batch', 'batch')),
      payment_option: parseIntOrNull(pick(row, 'Payment_option', 'Payment Option', 'payment_option')),
      type: parseIntOrNull(pick(row, 'Type', 'type')),
      status: parseIntOrNull(pick(row, 'Status', 'status')),
      placed_status: parseIntOrNull(pick(row, 'Placed Status', 'Placed_Status', 'placed_status')),
      program: parseIntOrNull(pick(row, 'Program', 'program')),
      lead_source: parseIntOrNull(pick(row, 'Lead_source', 'Lead Source', 'lead_source')),
      councellor: parseFloatOrNull(pick(row, 'Councellor', 'Counselor', 'councellor')),
      team: parseIntOrNull(pick(row, 'Team', 'team')),
      bifurcation: parseIntOrNull(pick(row, 'Bifurcation', 'bifurcation')),
      location: parseIntOrNull(pick(row, 'Location', 'location')),
      nationality: parseIntOrNull(pick(row, 'nationality', 'Nationality')),
      ugc_status: parseIntOrNull(pick(row, 'UGC_Status', 'UGC Status', 'ugc_status')),
      adhar: parseFloatOrNull(pick(row, 'Adhar', 'Aadhaar', 'adhar')),
    });
  }

  const rows = [...byEnrollment.values()].sort((a, b) => a.id - b.id);
  console.log(
    `CSV rows ${parsed.data.length} → ${rows.length} unique enrollment_no (csv dupes overwritten: ${csvDupes}, skipped: ${skipped})`
  );

  // Build into a staging table, then atomically swap
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS AdmissionForm_staging');
  await prisma.$executeRawUnsafe('CREATE TABLE AdmissionForm_staging LIKE AdmissionForm');

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk
      .map(
        (r) =>
          `(${[
            r.id,
            r.sno,
            sqlVal(r.date_of_admission),
            r.enrollment_no,
            sqlVal(r.name),
            sqlVal(r.batch),
            sqlVal(r.payment_option),
            sqlVal(r.type),
            sqlVal(r.status),
            sqlVal(r.placed_status),
            sqlVal(r.program),
            sqlVal(r.lead_source),
            sqlVal(r.councellor),
            sqlVal(r.team),
            sqlVal(r.bifurcation),
            sqlVal(r.location),
            sqlVal(r.nationality),
            sqlVal(r.ugc_status),
            sqlVal(r.adhar),
          ].join(',')})`
      )
      .join(',');

    await prisma.$executeRawUnsafe(`
      INSERT INTO AdmissionForm_staging (
        id, sno, date_of_admission, enrollment_no, name, batch, payment_option,
        type, status, placed_status, program, lead_source, councellor, team,
        bifurcation, location, nationality, ugc_status, adhar
      ) VALUES ${values}
    `);
    console.log(`  Staged ${Math.min(i + CHUNK, rows.length)} / ${rows.length}`);
  }

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS AdmissionForm_old');
  await prisma.$executeRawUnsafe('RENAME TABLE AdmissionForm TO AdmissionForm_old, AdmissionForm_staging TO AdmissionForm');
  await prisma.$executeRawUnsafe('DROP TABLE AdmissionForm_old');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');

  const [{ c: after }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM AdmissionForm');
  const [{ c: distinctEnr }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(DISTINCT enrollment_no) AS c FROM AdmissionForm'
  );
  const [{ m: maxId }] = await prisma.$queryRawUnsafe('SELECT MAX(id) AS m FROM AdmissionForm');
  console.log(`AdmissionForm after: ${Number(after)} (distinct enrollment_no ${Number(distinctEnr)}, max id ${Number(maxId)})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
