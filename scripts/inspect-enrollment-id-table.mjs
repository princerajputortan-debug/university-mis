import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM enrollment_id');
const count = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM enrollment_id');
const sample = await prisma.$queryRawUnsafe('SELECT * FROM enrollment_id ORDER BY id ASC LIMIT 8');

console.log('enrollment_id columns:', cols);
console.log('count:', Number(count[0].c));
console.log('sample:', sample);

const paymentTables = ['RazorpayPayment', 'JodoPayment', 'EarlyPayment', 'PropelldPayment'];
for (const table of paymentTables) {
  const pcols = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\``);
  const total = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${table}\``);
  console.log(`\n${table} columns:`, pcols.map((c) => c.Field));
  console.log(`${table} count:`, Number(total[0].c));
  const psample = await prisma.$queryRawUnsafe(`SELECT * FROM \`${table}\` LIMIT 2`);
  console.log(`${table} sample:`, psample);
}

const admissionSample = await prisma.$queryRawUnsafe('SELECT id, enrollment_no, batch FROM AdmissionForm LIMIT 5');
console.log('\nAdmissionForm sample:', admissionSample);

const batches = await prisma.$queryRawUnsafe('SELECT id, batch FROM Batch ORDER BY id');
console.log('\nBatches:', batches);

await prisma.$disconnect();
