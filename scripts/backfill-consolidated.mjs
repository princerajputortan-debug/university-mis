/**
 * Backfill ConsolidatedPayment from legacy source payment tables.
 * Source tables use CSV-style column names; ConsolidatedPayment uses Prisma schema.
 *
 * Usage: node scripts/backfill-consolidated.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const CHUNK = 2000;

const SOURCES = [
  { table: 'RazorpayPayment', label: 'Razorpay', kind: 'legacy' },
  { table: 'JodoPayment', label: 'Jodo', kind: 'legacy' },
  { table: 'EarlyPayment', label: 'Early', kind: 'legacy' },
  { table: 'PropelldPayment', label: 'Propelld', kind: 'legacy' },
  { table: 'OthersPayment', label: 'Others', kind: 'normalized' },
];

const TX_COL = 'settlement_utr_/_transaction_id';

async function getAmountColumn(table) {
  const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\``);
  const amountCol = cols.find(c => String(c.Field).toLowerCase().startsWith('transaction_amount'));
  if (!amountCol) throw new Error(`No amount column on ${table}`);
  return amountCol.Field;
}

function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function sqlNum(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isNaN(n) ? 'NULL' : String(n);
}

function sqlDate(v) {
  if (!v) return 'NULL';
  if (v instanceof Date && !isNaN(v.getTime())) {
    return sqlStr(v.toISOString().slice(0, 19).replace('T', ' '));
  }
  const raw = String(v).trim().split(/[ T]/)[0];
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return sqlStr(`${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')} 12:00:00`);
  }
  const dmy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    return sqlStr(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')} 12:00:00`);
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) return 'NULL';
  return sqlStr(d.toISOString().slice(0, 19).replace('T', ' '));
}

async function loadEnrollmentMaps() {
  const enrollments = await prisma.$queryRawUnsafe(`
    SELECT id, enrollment FROM enrollment_id WHERE id IS NOT NULL
  `);
  const idSet = new Set(enrollments.map((e) => Number(e.id)));
  const textToId = new Map(
    enrollments.map((e) => [String(e.enrollment).trim().toUpperCase(), Number(e.id)])
  );

  const forms = await prisma.$queryRawUnsafe(`
    SELECT enrollment_no AS enrollmentId, batch AS batchId
    FROM AdmissionForm
    WHERE enrollment_no IS NOT NULL
  `);
  const batchByEnrollment = new Map(
    forms.map((f) => [Number(f.enrollmentId), f.batchId != null ? Number(f.batchId) : null])
  );

  return { idSet, textToId, batchByEnrollment };
}

function resolveEnrollmentId(raw, { idSet, textToId }) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'reco') return null;
  if (/^\d+$/.test(s)) {
    const id = parseInt(s, 10);
    return idSet.has(id) ? id : null;
  }
  return textToId.get(s.toUpperCase()) ?? null;
}

async function fetchNormalizedSourceRows(table) {
  return prisma.$queryRawUnsafe(`
    SELECT
      id,
      transactionid AS transactionId,
      \`date\`,
      enrollmentid AS enrollmentId,
      amount AS amountRaw,
      mode,
      discountedcoursefee AS discountedCourseFee,
      firstemi AS firstEmi,
      tenure,
      batchid AS batchId
    FROM \`${table}\`
    WHERE transactionid IS NOT NULL AND transactionid != ''
  `);
}

async function fetchSourceRows(source) {
  if (source.kind === 'normalized') {
    return fetchNormalizedSourceRows(source.table);
  }
  const amountCol = await getAmountColumn(source.table);
  return prisma.$queryRawUnsafe(`
    SELECT
      id,
      \`${TX_COL}\` AS transactionId,
      \`date\`,
      enrollment_id AS enrollmentRaw,
      \`${amountCol}\` AS amountRaw,
      mode,
      discounted_course_fee AS discountedCourseFee,
      \`1st_emi\` AS firstEmi,
      tenure
    FROM \`${source.table}\`
    WHERE \`${TX_COL}\` IS NOT NULL AND \`${TX_COL}\` != ''
  `);
}

async function bulkUpsertConsolidated(rows) {
  if (!rows.length) return 0;
  const cols = `(transactionId, \`date\`, enrollmentId, amount, mode, batchId, discountedCourseFee, firstEmi, tenure, sourceName, createdAt, updatedAt)`;
  const updates = `\`date\`=VALUES(\`date\`), enrollmentId=VALUES(enrollmentId), amount=VALUES(amount), mode=VALUES(mode), batchId=VALUES(batchId), discountedCourseFee=VALUES(discountedCourseFee), firstEmi=VALUES(firstEmi), tenure=VALUES(tenure), sourceName=VALUES(sourceName), updatedAt=NOW()`;

  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk
      .map(
        r =>
          `(${sqlStr(r.transactionId)}, ${sqlDate(r.date)}, ${sqlNum(r.enrollmentId)}, ${sqlNum(r.amount)}, ${r.mode ? sqlStr(r.mode) : 'NULL'}, ${sqlNum(r.batchId)}, ${sqlNum(r.discountedCourseFee)}, ${sqlNum(r.firstEmi)}, ${sqlNum(r.tenure)}, ${sqlStr(r.sourceName)}, NOW(), NOW())`
      )
      .join(',\n');
    await prisma.$executeRawUnsafe(
      `INSERT INTO ConsolidatedPayment ${cols} VALUES ${values} ON DUPLICATE KEY UPDATE ${updates}`
    );
    upserted += chunk.length;
    console.log(`  ConsolidatedPayment: ${upserted} / ${rows.length}`);
  }
  return upserted;
}

async function main() {
  const maps = await loadEnrollmentMaps();
  const allRows = [];
  const byTx = new Map();

  for (const source of SOURCES) {
    console.log(`Reading ${source.table} (${source.kind})...`);
    const rawRows = await fetchSourceRows(source);
    console.log(`  ${rawRows.length} rows`);

    for (const row of rawRows) {
      const transactionId = String(row.transactionId).trim();
      if (!transactionId) continue;

      const enrollmentId =
        source.kind === 'normalized'
          ? row.enrollmentId != null
            ? Number(row.enrollmentId)
            : null
          : resolveEnrollmentId(row.enrollmentRaw, maps);
      const batchId =
        source.kind === 'normalized'
          ? row.batchId != null
            ? Number(row.batchId)
            : null
          : enrollmentId
            ? (maps.batchByEnrollment.get(enrollmentId) ?? null)
            : null;
      const amount = parseFloat(String(row.amountRaw ?? '').replace(/,/g, '')) || 0;

      const record = {
        transactionId,
        date: row.date,
        enrollmentId,
        amount,
        mode: row.mode ?? null,
        batchId,
        discountedCourseFee: row.discountedCourseFee != null ? Number(row.discountedCourseFee) : null,
        firstEmi: row.firstEmi != null ? Number(row.firstEmi) : null,
        tenure: row.tenure != null ? Number(row.tenure) : null,
        sourceName: source.label,
      };

      // Last source wins on duplicate transactionId (same as upload dedupe)
      if (byTx.has(transactionId)) {
        const prev = byTx.get(transactionId);
        console.warn(`  Duplicate tx ${transactionId}: ${prev.sourceName} → ${source.label}`);
      }
      byTx.set(transactionId, record);
    }
  }

  const deduped = [...byTx.values()];
  console.log(`Upserting ${deduped.length} unique transactions into ConsolidatedPayment...`);
  await bulkUpsertConsolidated(deduped);

  const [{ c }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ConsolidatedPayment`);
  const bySource = await prisma.$queryRawUnsafe(`
    SELECT sourceName, COUNT(*) AS c FROM ConsolidatedPayment
    WHERE sourceName IN ('Razorpay','Jodo','Early','Propelld','Others')
    GROUP BY sourceName
  `);
  console.log('Done. ConsolidatedPayment total:', Number(c));
  console.log('By source:', bySource.map(r => ({ source: r.sourceName, count: Number(r.c) })));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
