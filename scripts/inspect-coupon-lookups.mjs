import { PrismaClient } from '../src/generated/prisma/index.js';
const prisma = new PrismaClient();
const ls = await prisma.$queryRawUnsafe('SELECT id, lead FROM LeadSource ORDER BY id');
const teams = await prisma.$queryRawUnsafe('SELECT id, team FROM Team ORDER BY id');
const po = await prisma.$queryRawUnsafe('SELECT id, paymentOption FROM PaymentOption ORDER BY id');
console.log('lead', ls);
console.log('team', teams);
console.log('po', po);
await prisma.$disconnect();
