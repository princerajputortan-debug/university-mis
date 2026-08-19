require('dotenv/config');

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DEFAULT_CSV = 'C:/Users/Mahesh Singh bhati/Downloads/Software.csv';
const csvPath = process.argv.find((arg) => /\.csv$/i.test(arg)) || DEFAULT_CSV;
const shouldApply = process.argv.includes('--apply');
const shouldReplace = process.argv.includes('--replace');
const CHUNK_SIZE = 1000;

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function readRows(filePath) {
  const csv = fs.readFileSync(path.resolve(filePath), 'utf8').replace(/^\uFEFF/, '');
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift() || '').map((header) => header.trim());
  const idIndex = headers.indexOf('id');
  const enrollmentIndex = headers.indexOf('enrollment');

  if (idIndex === -1 || enrollmentIndex === -1) {
    throw new Error('CSV must contain id and enrollment columns.');
  }

  return lines
    .map((line) => {
      const cells = parseCsvLine(line);
      const id = Number(cells[idIndex]);
      const enrollment = String(cells[enrollmentIndex] || '').trim();
      return { id, enrollment };
    })
    .filter((row) => Number.isInteger(row.id) && row.enrollment);
}

async function main() {
  const rows = readRows(csvPath);

  if (shouldApply) {
    if (shouldReplace) {
      await prisma.enrollment.deleteMany();
    }

    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
      const chunk = rows.slice(index, index + CHUNK_SIZE);
      await prisma.enrollment.createMany({
        data: chunk,
        skipDuplicates: true,
      });
    }
  }

  console.log(JSON.stringify({
    csv: csvPath,
    mode: shouldApply ? (shouldReplace ? 'replace' : 'apply') : 'dry-run',
    rows: rows.length,
    sample: rows.slice(0, 10),
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
