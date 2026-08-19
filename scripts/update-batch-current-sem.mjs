/**
 * Sync StudentFeeStructure.currentSem from sliding-window batch logic, and
 * mark Pursuing students as Passout when they hit UG=6 / PG=4.
 *
 * Formula (latest admission batch = Sem 1):
 *   currentSem = min(latestBatch - batchId + 1, maxSem)
 *
 * Usage: node scripts/update-batch-current-sem.mjs
 */
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const FALLBACK_LATEST = 9;
const STATUS_PURSUING = 2;
const STATUS_PASSOUT = 1;
const TYPE_UG = 2;
const TYPE_PG = 1;

function maxSemForType(typeId) {
  return Number(typeId) === TYPE_UG ? 6 : 4;
}

function currentSem(batchId, typeId, latest) {
  const id = Number(batchId) || 0;
  if (id <= 0) return 1;
  const progressed = Math.max(1, latest - id + 1);
  return Math.min(progressed, maxSemForType(typeId));
}

async function main() {
  const maxRows = await prisma.$queryRawUnsafe(
    `SELECT MAX(batch) AS m FROM AdmissionForm`
  );
  const latest = Number(maxRows?.[0]?.m) || FALLBACK_LATEST;
  console.log(`Latest admission batch: ${latest}`);

  // Preview map
  for (let b = 1; b <= latest; b++) {
    console.log(
      `  Batch ${b}: UG Sem ${currentSem(b, TYPE_UG, latest)}, PG Sem ${currentSem(b, TYPE_PG, latest)}`
    );
  }

  // Update currentSem on StudentFeeStructure from AdmissionForm batch/type
  let sfsUpdated = 0;
  for (let batchId = 1; batchId <= latest; batchId++) {
    for (const typeId of [TYPE_UG, TYPE_PG]) {
      const sem = currentSem(batchId, typeId, latest);
      const result = await prisma.$executeRawUnsafe(
        `
        UPDATE StudentFeeStructure sfs
        INNER JOIN AdmissionForm af ON af.enrollment_no = sfs.enrollmentId
        SET sfs.currentSem = ?,
            sfs.batchId = COALESCE(sfs.batchId, af.batch),
            sfs.typeId = COALESCE(sfs.typeId, af.type)
        WHERE af.batch = ?
          AND COALESCE(sfs.typeId, af.type) = ?
        `,
        sem,
        batchId,
        typeId
      );
      sfsUpdated += Number(result);
    }
  }
  console.log(`StudentFeeStructure.currentSem rows touched: ${sfsUpdated}`);

  // Pursuing → Passout when current semester has reached max
  // UG max 6 → batches where (latest - batch + 1) >= 6 → batch <= latest - 5
  // PG max 4 → batches where (latest - batch + 1) >= 4 → batch <= latest - 3
  const ugPassoutMaxBatch = latest - 5; // e.g. latest 9 → batches 1–4
  const pgPassoutMaxBatch = latest - 3; // e.g. latest 9 → batches 1–6

  let statusUpdated = 0;
  if (ugPassoutMaxBatch >= 1) {
    const r = await prisma.$executeRawUnsafe(
      `
      UPDATE AdmissionForm
      SET status = ?
      WHERE status = ?
        AND type = ?
        AND batch BETWEEN 1 AND ?
      `,
      STATUS_PASSOUT,
      STATUS_PURSUING,
      TYPE_UG,
      ugPassoutMaxBatch
    );
    statusUpdated += Number(r);
    console.log(
      `UG Pursuing→Passout (batches 1–${ugPassoutMaxBatch}): ${Number(r)}`
    );
  }

  if (pgPassoutMaxBatch >= 1) {
    const r = await prisma.$executeRawUnsafe(
      `
      UPDATE AdmissionForm
      SET status = ?
      WHERE status = ?
        AND type = ?
        AND batch BETWEEN 1 AND ?
      `,
      STATUS_PASSOUT,
      STATUS_PURSUING,
      TYPE_PG,
      pgPassoutMaxBatch
    );
    statusUpdated += Number(r);
    console.log(
      `PG Pursuing→Passout (batches 1–${pgPassoutMaxBatch}): ${Number(r)}`
    );
  }

  // Also PG batch at exactly max when progressed == 4 includes batch (latest-3)
  // already covered. Batch 6 PG with latest=9: progressed=4 → passout via pgPassoutMaxBatch=5? 
  // Wait: batch 6: 9-6+1=4 >= 4 → should passout. pgPassoutMaxBatch = 9-3 = 6.
  // Formula: batch <= latest - (maxSem - 1) = latest - 3 for PG → batches 1..6
  // I used latest - 3 which for latest=9 is 6. Good!
  // UG: batch <= latest - 5 → 1..4. Batch 4: 9-4+1=6 >= 6. Batch 5: 5 < 6. Good.

  console.log(`Total status rows updated: ${statusUpdated}`);

  const remaining = await prisma.$queryRawUnsafe(
    `
    SELECT af.batch, af.type, COUNT(*) AS cnt
    FROM AdmissionForm af
    WHERE af.status = ?
    GROUP BY af.batch, af.type
    ORDER BY af.batch, af.type
    `,
    STATUS_PURSUING
  );
  console.log('Remaining Pursuing by batch/type:', remaining);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
