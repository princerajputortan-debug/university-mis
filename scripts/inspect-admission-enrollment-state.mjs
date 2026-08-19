import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function showTable(name) {
  try {
    const cols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${name}\``);
    const [{ c }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${name}\``);
    console.log(`\n=== ${name} (${Number(c)} rows) ===`);
    console.log(cols.map((col) => col.Field).join(', '));
    const sample = await prisma.$queryRawUnsafe(`SELECT * FROM \`${name}\` ORDER BY id DESC LIMIT 2`);
    console.log('Latest sample:', JSON.stringify(sample, null, 2));
  } catch (e) {
    console.log(`\n=== ${name}: ERROR ===`, e.message.split('\n')[0]);
  }
}

for (const t of ['AdmissionForm', 'Enrollment', 'enrollment_id']) {
  await showTable(t);
}

const afOnly = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM AdmissionForm af
  LEFT JOIN enrollment_id e ON e.id = af.enrollment_no
  WHERE e.id IS NULL
`);
const enrOnly = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM enrollment_id e
  LEFT JOIN AdmissionForm af ON af.enrollment_no = e.id
  WHERE af.id IS NULL
`);
const prismaEnr = await prisma.enrollment.count();
console.log('\n=== Cross-checks ===');
console.log('AdmissionForm without enrollment_id match:', Number(afOnly[0].c));
console.log('enrollment_id without AdmissionForm:', Number(enrOnly[0].c));
console.log('Prisma Enrollment count:', prismaEnr);

await prisma.$disconnect();
