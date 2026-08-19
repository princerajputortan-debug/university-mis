import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const [{ c: formCount }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM AdmissionForm');
const [{ c: enrollCount }] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM enrollment_id');
const maxEnroll = await prisma.$queryRawUnsafe('SELECT MAX(id) AS m FROM enrollment_id');
const maxForm = await prisma.$queryRawUnsafe('SELECT MAX(id) AS m FROM AdmissionForm');
console.log('AdmissionForm:', Number(formCount), 'max id', Number(maxForm[0].m));
console.log('enrollment_id:', Number(enrollCount), 'max id', Number(maxEnroll[0].m));
const sample = await prisma.$queryRawUnsafe('SELECT id, enrollment FROM enrollment_id WHERE id >= 15521 LIMIT 5');
console.log('enrollment sample 15521+:', sample);
await prisma.$disconnect();
