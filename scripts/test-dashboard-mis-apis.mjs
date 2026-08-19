import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const years = [2022, 2023, 2024, 2025, 2026];
const replacer = (_, v) => (typeof v === 'bigint' ? Number(v) : v);

try {
  const admissionRows = await prisma.$queryRawUnsafe(`
    SELECT YEAR(af.date_of_admission) AS year, MONTH(af.date_of_admission) AS month, COUNT(*) AS count
    FROM AdmissionForm af
    LEFT JOIN AdmissionStatus ast ON af.status = ast.id
    WHERE af.date_of_admission IS NOT NULL
      AND af.date_of_admission >= '${years[0]}-01-01'
      AND af.date_of_admission < '${years[years.length - 1] + 1}-01-01'
    GROUP BY YEAR(af.date_of_admission), MONTH(af.date_of_admission)
    LIMIT 5
  `);
  console.log('admission-count sample:', JSON.stringify(admissionRows, replacer, 2));

  const pivotRows = await prisma.$queryRawUnsafe(`
    SELECT bif.bifurcation AS category, pr.program AS program, COUNT(*) AS cnt
    FROM AdmissionForm af
    JOIN Program pr ON af.program = pr.id
    JOIN Bifurcation bif ON af.bifurcation = bif.id
    WHERE af.program IS NOT NULL AND af.bifurcation IS NOT NULL
    GROUP BY bif.bifurcation, pr.program
    LIMIT 5
  `);
  console.log('bifurcation-program sample:', JSON.stringify(pivotRows, replacer, 2));
} catch (error) {
  console.error('FAIL:', error.message);
}

await prisma.$disconnect();
