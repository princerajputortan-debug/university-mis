require('dotenv/config');

const path = require('path');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEFAULT_WORKBOOK = 'C:/Users/Mahesh Singh bhati/Downloads/Date Change .xlsx';
const workbookPath = process.argv.find((arg) => /\.xlsx$/i.test(arg)) || DEFAULT_WORKBOOK;
const shouldApply = process.argv.includes('--apply');

function buildLocalDate(year, month, day) {
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseDateInput(value) {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return buildLocalDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number') {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    return Number.isNaN(date.getTime())
      ? null
      : buildLocalDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const datePart = raw.split(/[ T]/)[0];
  const isoMatch = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return buildLocalDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const dateMatch = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dateMatch) {
    const first = Number(dateMatch[1]);
    const second = Number(dateMatch[2]);
    const year = Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]);
    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;
    return buildLocalDate(year, month, day);
  }

  const directDate = new Date(raw);
  if (Number.isNaN(directDate.getTime())) return null;

  return buildLocalDate(
    directDate.getFullYear(),
    directDate.getMonth() + 1,
    directDate.getDate()
  );
}

function formatDate(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function readCorrections(filePath) {
  const workbook = XLSX.readFile(path.resolve(filePath), { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  return rows
    .map((row) => {
      const enrollmentNo = String(row.enrollmentNo || row.EnrollmentNo || row.enrollment_no || '').trim();
      const date = parseDateInput(row['Date '] || row.Date || row.date || row.doa || row.DOA);
      return { enrollmentNo, date };
    })
    .filter((row) => row.enrollmentNo && row.date);
}

async function main() {
  const corrections = readCorrections(workbookPath);
  const correctionByEnrollment = new Map(corrections.map((row) => [row.enrollmentNo, row.date]));
  const enrollmentNos = Array.from(correctionByEnrollment.keys());

  const forms = await prisma.admissionForm.findMany({
    where: {
      enrollment: {
        is: {
          enrollment: { in: enrollmentNos },
        },
      },
    },
    select: {
      id: true,
      doa: true,
      enrollment: {
        select: { enrollment: true },
      },
    },
  });

  const matched = forms.filter((form) => form.enrollment?.enrollment);
  const matchedEnrollments = new Set(matched.map((form) => form.enrollment.enrollment));
  const unmatched = enrollmentNos.filter((enrollmentNo) => !matchedEnrollments.has(enrollmentNo));
  const updates = matched.map((form) => ({
    id: form.id,
    enrollmentNo: form.enrollment.enrollment,
    from: formatDate(form.doa),
    to: correctionByEnrollment.get(form.enrollment.enrollment),
  }));

  if (shouldApply) {
    await prisma.$transaction(
      updates.map((update) =>
        prisma.admissionForm.update({
          where: { id: update.id },
          data: { doa: update.to },
        })
      )
    );
  }

  console.log(JSON.stringify({
    workbook: workbookPath,
    mode: shouldApply ? 'apply' : 'dry-run',
    correctionRows: corrections.length,
    matched: matched.length,
    unmatchedCount: unmatched.length,
    unmatched: unmatched.slice(0, 25),
    sampleUpdates: updates.slice(0, 10).map((update) => ({
      enrollmentNo: update.enrollmentNo,
      from: update.from,
      to: formatDate(update.to),
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
