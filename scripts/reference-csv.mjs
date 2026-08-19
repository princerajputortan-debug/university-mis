import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

export const REFERENCE_DIR = path.join(process.cwd(), 'prisma', 'reference-data');

export function readReferenceCsv(filename) {
  const filePath = path.join(REFERENCE_DIR, filename);
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) {
    console.warn(`CSV warnings in ${filename}:`, parsed.errors.slice(0, 3));
  }
  return parsed.data;
}

export function pickField(row, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
  }
  return '';
}

export function parseIntId(value) {
  const s = String(value ?? '').trim();
  if (!s || !/^\d+$/.test(s)) return null;
  return parseInt(s, 10);
}
