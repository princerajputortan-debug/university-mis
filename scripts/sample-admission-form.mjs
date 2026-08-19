import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const sample = await prisma.$queryRawUnsafe(
  'SELECT id, date_of_admission, enrollment_no, batch, program, payment_option, placed_status FROM AdmissionForm LIMIT 3'
);
const replacer = (_, v) => (typeof v === 'bigint' ? Number(v) : v);
console.log('AdmissionForm sample:', JSON.stringify(sample, replacer, 2));
const enroll = await prisma.$queryRawUnsafe('SELECT id, enrollment FROM enrollment_id LIMIT 3');
console.log('enrollment_id sample:', JSON.stringify(enroll, replacer, 2));
const join = await prisma.$queryRawUnsafe(`
  SELECT af.id, af.enrollment_no, e.enrollment
  FROM AdmissionForm af
  LEFT JOIN enrollment_id e ON e.id = af.enrollment_no
  LIMIT 3
`);
console.log('join sample:', JSON.stringify(join, replacer, 2));
const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM AdmissionForm');
console.log(cols.map((c) => `${c.Field}:${c.Type}`).join('\n'));
await prisma.$disconnect();
