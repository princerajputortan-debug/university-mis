import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const years = [2022, 2023, 2024, 2025, 2026];

try {
  await prisma.$queryRawUnsafe('SELECT 1');

  const [{ cnt: totalForms }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS cnt FROM AdmissionForm'
  );
  const [{ cnt: totalPayments }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS cnt FROM ConsolidatedPayment'
  );

  const admissionRows = await prisma.$queryRawUnsafe(`
    SELECT YEAR(date_of_admission) AS year, MONTH(date_of_admission) AS month, COUNT(*) AS count
    FROM AdmissionForm
    WHERE date_of_admission >= '${years[0]}-01-01'
      AND date_of_admission < '${years[years.length - 1] + 1}-01-01'
    GROUP BY YEAR(date_of_admission), MONTH(date_of_admission)
    LIMIT 5
  `);

  const programRows = await prisma.$queryRawUnsafe(`
    SELECT program AS name, COUNT(*) AS cnt
    FROM AdmissionForm
    WHERE program IS NOT NULL AND program != ''
    GROUP BY program
    ORDER BY cnt DESC
    LIMIT 5
  `);

  console.log('Dashboard queries OK');
  console.log('totalForms:', Number(totalForms));
  console.log('totalPayments:', Number(totalPayments));
  console.log('admission sample rows:', admissionRows.length);
  console.log('top programs:', programRows.map((r) => `${r.name}: ${r.cnt}`).join(', '));
} catch (error) {
  console.error('Dashboard query FAIL:', error.code, error.message);
}

await prisma.$disconnect();
