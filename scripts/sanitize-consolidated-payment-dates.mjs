import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const updated = await prisma.$executeRawUnsafe(`
  UPDATE ConsolidatedPayment
  SET \`date\` = NULL
  WHERE \`date\` IS NOT NULL
    AND (
      CAST(\`date\` AS CHAR(19)) LIKE '0000%'
      OR CAST(\`date\` AS CHAR(19)) REGEXP '^[0-9]{4}-00-'
      OR CAST(\`date\` AS CHAR(19)) REGEXP '^[0-9]{4}-[0-9]{2}-00'
    )
`);

console.log('Sanitized invalid dates:', updated);

const count = await prisma.consolidatedPayment.count();
console.log('ConsolidatedPayment rows readable via Prisma:', count);

await prisma.$disconnect();
