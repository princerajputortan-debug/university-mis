/**
 * Seeds lookup tables from Software-* reference CSVs (fixed ids matching Excel export).
 * Run: node scripts/seed-reference-lookups.mjs
 */
import { PrismaClient } from '@prisma/client';
import { readReferenceCsv, pickField, parseIntId } from './reference-csv.mjs';

const prisma = new PrismaClient();

async function clearLookupTables() {
  console.log('Clearing existing reference data (not users)...');
  await prisma.consolidatedPayment.deleteMany();
  await prisma.razorpayPayment.deleteMany();
  await prisma.jodoPayment.deleteMany();
  await prisma.earlyPayment.deleteMany();
  await prisma.offlinePayment.deleteMany();
  await prisma.bankPayment.deleteMany();
  await prisma.propelldPayment.deleteMany();
  await prisma.othersPayment.deleteMany();
  await prisma.admissionForm.deleteMany();
  await prisma.studentFeeStructure.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.feeStructure.deleteMany();
  await prisma.leadSource.deleteMany();
  await prisma.ugcStatus.deleteMany();
  await prisma.nationality.deleteMany();
  await prisma.location.deleteMany();
  await prisma.bifurcation.deleteMany();
  await prisma.team.deleteMany();
  await prisma.placementStatus.deleteMany();
  await prisma.admissionStatus.deleteMany();
  await prisma.admissionType.deleteMany();
  await prisma.paymentOption.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.program.deleteMany();
}

async function upsertById(delegate, id, data) {
  await delegate.upsert({
    where: { id },
    update: data,
    create: { id, ...data },
  });
}

async function seedLookupTable(filename, delegate, mapRow, uniqueLabelField = null) {
  const rows = readReferenceCsv(filename);
  const seenLabels = new Set();
  let count = 0;
  let skipped = 0;

  for (const row of rows) {
    const mapped = mapRow(row);
    if (!mapped) continue;

    if (uniqueLabelField) {
      const label = mapped.data[uniqueLabelField];
      const norm = label.toLowerCase().trim();
      if (seenLabels.has(norm)) {
        mapped.data[uniqueLabelField] = `${label} (#${mapped.id})`;
      } else {
        seenLabels.add(norm);
      }
    }

    try {
      await upsertById(delegate, mapped.id, mapped.data);
      count++;
    } catch (e) {
      if (e.code === 'P2002' && uniqueLabelField) {
        mapped.data[uniqueLabelField] = `${mapped.data[uniqueLabelField]} (#${mapped.id})`;
        await upsertById(delegate, mapped.id, mapped.data);
        count++;
      } else if (e.code === 'P2002') {
        skipped++;
      } else {
        throw e;
      }
    }
  }

  return { count, skipped };
}

async function main() {
  console.log('Clearing lookup / dependent rows...');
  await clearLookupTables();

  const counts = {};

  counts.program = await seedLookupTable('Software-program_id.csv', prisma.program, (row) => {
    const id = parseIntId(row.id);
    const program = pickField(row, 'program');
    return id && program ? { id, data: { program } } : null;
  }, 'program');

  counts.batch = await seedLookupTable('Software-batch_id.csv', prisma.batch, (row) => {
    const id = parseIntId(row.id);
    const batch = pickField(row, 'batch');
    return id && batch ? { id, data: { batch } } : null;
  }, 'batch');

  counts.paymentOption = await seedLookupTable(
    'Software-paymentoption_id.csv',
    prisma.paymentOption,
    (row) => {
      const id = parseIntId(row.id);
      const paymentOption = pickField(row, 'Paymentoption', 'paymentOption', 'payment_option');
      return id && paymentOption ? { id, data: { paymentOption } } : null;
    },
    'paymentOption'
  );

  counts.type = await seedLookupTable('Software-type_id.csv', prisma.admissionType, (row) => {
    const id = parseIntId(row.id);
    const type = pickField(row, 'type');
    return id && type ? { id, data: { type } } : null;
  }, 'type');

  counts.status = await seedLookupTable('Software-status_id.csv', prisma.admissionStatus, (row) => {
    const id = parseIntId(row.id);
    const status = pickField(row, 'status');
    return id && status ? { id, data: { status } } : null;
  }, 'status');

  counts.placedStatus = await seedLookupTable(
    'Software-placement_id.csv',
    prisma.placementStatus,
    (row) => {
      const id = parseIntId(row.id);
      const placedStatus = pickField(row, 'placed_status', 'placedStatus');
      return id && placedStatus ? { id, data: { placedStatus } } : null;
    },
    'placedStatus'
  );

  counts.leadSource = await seedLookupTable(
    'Software-lead_source_id.csv',
    prisma.leadSource,
    (row) => {
      const id = parseIntId(row.id);
      const lead = pickField(row, 'lead');
      return id && lead ? { id, data: { lead } } : null;
    },
    'lead'
  );

  counts.team = await seedLookupTable('Software-team_id.csv', prisma.team, (row) => {
    const id = parseIntId(row.id);
    const team = pickField(row, 'team');
    return id && team ? { id, data: { team } } : null;
  }, 'team');

  counts.bifurcation = await seedLookupTable(
    'Software-bifurcation_id.csv',
    prisma.bifurcation,
    (row) => {
      const id = parseIntId(row.id);
      const bifurcation = pickField(row, 'bifurcation');
      return id && bifurcation ? { id, data: { bifurcation } } : null;
    },
    'bifurcation'
  );

  counts.location = await seedLookupTable('Software-location_id.csv', prisma.location, (row) => {
    const id = parseIntId(row.id);
    const location = pickField(row, 'location');
    return id && location ? { id, data: { location } } : null;
  }, 'location');

  counts.nationality = await seedLookupTable(
    'Software-nationality_id.csv',
    prisma.nationality,
    (row) => {
      const id = parseIntId(row.id);
      const nationality = pickField(row, 'nationality', 'location');
      return id && nationality ? { id, data: { nationality } } : null;
    },
    'nationality'
  );

  counts.ugcStatus = await seedLookupTable('Software-UGC_Status.csv', prisma.ugcStatus, (row) => {
    const id = parseIntId(row.id);
    const ugcStatus = pickField(row, 'ugcStatus', 'UGC_Status', 'location');
    return id && ugcStatus ? { id, data: { ugcStatus } } : null;
  }, 'ugcStatus');

  console.log('Reference lookup seed completed:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
