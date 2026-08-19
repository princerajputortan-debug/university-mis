import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const rows = await prisma.program.findMany({ orderBy: { id: 'asc' } });
for (const row of rows) console.log(`${row.id}: ${row.program}`);
await prisma.$disconnect();
