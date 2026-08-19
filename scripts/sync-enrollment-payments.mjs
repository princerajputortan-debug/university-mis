/**
 * Sync Enrollment from enrollment_id, map batch on payment tables,
 * and rebuild ConsolidatedPayment from Razorpay/Jodo/Early/Propelld.
 *
 * Usage: node scripts/sync-enrollment-payments.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const CHUNK = 2000;
const TX_COL = 'settlement_utr_/_transaction_id';

const PAYMENT_SOURCES = [
  { table: 'RazorpayPayment', label: 'Razorpay' },
  { table: 'JodoPayment', label: 'Jodo' },
  { table: 'EarlyPayment', label: 'Early' },
  { table: 'PropelldPayment', label: 'Propelld' },
];

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

async function columnNames(table) {
  const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\``);
  return new Set(cols.map((c) => c.Field));
}

async function getAmountColumn(table, cols) {
  const amountCol = [...cols].find((c) =>
    String(c).toLowerCase().startsWith('transaction_amount')
  );
  if (!amountCol) throw new Error(`No amount column on ${table}`);
  return amountCol;
}

async function syncEnrollmentTable() {
  const [{ c: sourceCount }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS c FROM enrollment_id WHERE id IS NOT NULL'
  );

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

  const sourceRows = await prisma.$queryRawUnsafe(`
    SELECT id, TRIM(enrollment) AS enrollment
    FROM enrollment_id
    WHERE id IS NOT NULL AND TRIM(enrollment) != ''
    ORDER BY id ASC
  `);

  const seenLabels = new Set();
  const prepared = [];
  for (const row of sourceRows) {
    let label = String(row.enrollment).slice(0, 191);
    const norm = label.toLowerCase();
    if (seenLabels.has(norm)) {
      label = `${label} (#${row.id})`.slice(0, 191);
    } else {
      seenLabels.add(norm);
    }
    prepared.push({ id: Number(row.id), label });
  }

  for (let i = 0; i < prepared.length; i += CHUNK) {
    const chunk = prepared.slice(i, i + CHUNK);
    const values = chunk.map((r) => `(${r.id}, ${sqlStr(r.label)})`).join(',');
    await prisma.$executeRawUnsafe(`INSERT INTO Enrollment (id, enrollment) VALUES ${values}`);
  }
  console.log(`  Inserted ${prepared.length} enrollment rows`);
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');

  const [{ c: targetCount }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM Enrollment');
  console.log(`Enrollment synced: ${Number(sourceCount)} source → ${Number(targetCount)} rows`);
}

async function loadMaps() {
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

function resolveEnrollmentId(raw, maps) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'reco') return null;
  if (/^\d+$/.test(s)) {
    const id = parseInt(s, 10);
    return maps.idSet.has(id) ? id : null;
  }
  return maps.textToId.get(s.toUpperCase()) ?? null;
}

async function ensurePaymentBatchColumn(table) {
  const cols = await columnNames(table);
  if (!cols.has('batchId')) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN batchId INT NULL`);
    console.log(`${table}: added batchId column`);
  }
  if (!cols.has('enrollmentId') && cols.has('enrollment_id')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${table}\` ADD COLUMN enrollmentId INT NULL`
    );
    console.log(`${table}: added enrollmentId column`);
  }
}

async function mapPaymentTableBatches(table) {
  await ensurePaymentBatchColumn(table);
  const cols = await columnNames(table);
  if (!cols.has('enrollment_id')) {
    console.log(`${table}: skip (no enrollment_id column)`);
    return;
  }

  const enrollmentSetParts = [];
  if (cols.has('enrollmentId')) enrollmentSetParts.push('p.enrollmentId = e.id');
  if (cols.has('batchId')) enrollmentSetParts.push('p.batchId = af.batch');

  const [{ maxId }] = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(MAX(id), 0) AS maxId FROM \`${table}\``
  );
  const step = 2000;

  for (let start = 1; start <= Number(maxId); start += step) {
    const end = start + step - 1;
    await prisma.$executeRawUnsafe(`
      UPDATE \`${table}\` p
      INNER JOIN \`enrollment_id\` e ON e.id = CAST(p.enrollment_id AS UNSIGNED)
      LEFT JOIN AdmissionForm af ON af.enrollment_no = e.id
      SET ${enrollmentSetParts.join(', ')}
      WHERE p.id BETWEEN ${start} AND ${end}
        AND p.enrollment_id REGEXP '^[0-9]+$'
    `);
  }

  const stats = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) AS total,
      SUM(${cols.has('enrollmentId') ? 'enrollmentId IS NOT NULL' : '0'}) AS withEnrollment,
      SUM(${cols.has('batchId') ? 'batchId IS NOT NULL' : '0'}) AS withBatch
    FROM \`${table}\`
  `);

  console.log(`${table}:`, {
    total: Number(stats[0].total),
    withEnrollment: Number(stats[0].withEnrollment),
    withBatch: Number(stats[0].withBatch),
  });
}

async function fetchSourceRows(table, amountCol, cols) {
  const enrollmentRawCol = cols.has('enrollment_id') ? 'enrollment_id' : 'enrollmentId';
  const enrollmentIdSelect = cols.has('enrollmentId') ? 'enrollmentId,' : 'NULL AS enrollmentId,';
  const batchSelect = cols.has('batchId') ? 'batchId' : 'NULL AS batchId';

  return prisma.$queryRawUnsafe(`
    SELECT
      id,
      \`${TX_COL}\` AS transactionId,
      \`date\`,
      ${enrollmentIdSelect}
      \`${enrollmentRawCol}\` AS enrollmentRaw,
      \`${amountCol}\` AS amountRaw,
      mode,
      discounted_course_fee AS discountedCourseFee,
      \`1st_emi\` AS firstEmi,
      tenure,
      ${batchSelect}
    FROM \`${table}\`
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
        (r) =>
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

async function rebuildConsolidated(maps) {
  const allRows = [];
  const byTx = new Map();

  for (const source of PAYMENT_SOURCES) {
    const cols = await columnNames(source.table);
    const amountCol = await getAmountColumn(source.table, cols);
    console.log(`Reading ${source.table}...`);
    const rawRows = await fetchSourceRows(source.table, amountCol, cols);
    console.log(`  ${rawRows.length} rows`);

    for (const row of rawRows) {
      const transactionId = String(row.transactionId).trim();
      if (!transactionId) continue;

      const enrollmentId =
        row.enrollmentId != null
          ? Number(row.enrollmentId)
          : resolveEnrollmentId(row.enrollmentRaw, maps);
      const batchId =
        row.batchId != null
          ? Number(row.batchId)
          : enrollmentId
            ? (maps.batchByEnrollment.get(enrollmentId) ?? null)
            : null;
      const amount = parseFloat(String(row.amountRaw ?? '').replace(/,/g, '')) || 0;

      byTx.set(transactionId, {
        transactionId,
        date: row.date,
        enrollmentId,
        amount,
        mode: row.mode ?? null,
        batchId,
        discountedCourseFee:
          row.discountedCourseFee != null ? Number(row.discountedCourseFee) : null,
        firstEmi: row.firstEmi != null ? Number(row.firstEmi) : null,
        tenure: row.tenure != null ? Number(row.tenure) : null,
        sourceName: source.label,
      });
    }
  }

  const deduped = [...byTx.values()];
  console.log(`Upserting ${deduped.length} unique transactions into ConsolidatedPayment...`);
  await bulkUpsertConsolidated(deduped);
}

async function printSummary() {
  const consolidated = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) AS total,
      SUM(enrollmentId IS NOT NULL) AS withEnrollment,
      SUM(batchId IS NOT NULL) AS withBatch
    FROM ConsolidatedPayment
    WHERE sourceName IN ('Razorpay','Jodo','Early','Propelld')
  `);
  const bySource = await prisma.$queryRawUnsafe(`
    SELECT sourceName, COUNT(*) AS c,
      SUM(enrollmentId IS NOT NULL) AS withEnrollment,
      SUM(batchId IS NOT NULL) AS withBatch
    FROM ConsolidatedPayment
    WHERE sourceName IN ('Razorpay','Jodo','Early','Propelld')
    GROUP BY sourceName
  `);

  console.log('\nConsolidatedPayment summary:', {
    total: Number(consolidated[0].total),
    withEnrollment: Number(consolidated[0].withEnrollment),
    withBatch: Number(consolidated[0].withBatch),
  });
  console.log('By source:', bySource.map((r) => ({
    source: r.sourceName,
    count: Number(r.c),
    withEnrollment: Number(r.withEnrollment),
    withBatch: Number(r.withBatch),
  })));
}

console.log('Step 1: Sync Enrollment from enrollment_id...');
await syncEnrollmentTable();

console.log('\nStep 2: Load enrollment + batch maps...');
const maps = await loadMaps();
console.log(`  Enrollments: ${maps.idSet.size}, batch mappings: ${maps.batchByEnrollment.size}`);

const skipPaymentTableUpdates = process.argv.includes('--consolidated-only');

if (skipPaymentTableUpdates) {
  console.log('\nStep 3: Skipped payment table updates (--consolidated-only)');
} else {
  console.log('\nStep 3: Map batch/enrollment on payment tables...');
  for (const source of PAYMENT_SOURCES) {
    try {
      await mapPaymentTableBatches(source.table);
    } catch (error) {
      console.warn(`${source.table}: update skipped (${error.message})`);
    }
  }
}

console.log('\nStep 4: Rebuild ConsolidatedPayment...');
await rebuildConsolidated(maps);

await printSummary();

await prisma.$disconnect();
