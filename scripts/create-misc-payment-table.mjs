import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS MiscPayment (
    id INT NOT NULL AUTO_INCREMENT,
    date DATETIME(3) NULL,
    transactionId VARCHAR(191) NOT NULL,
    amount DOUBLE NOT NULL,
    mode VARCHAR(191) NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt DATETIME(3) NOT NULL,
    UNIQUE KEY MiscPayment_transactionId_key (transactionId),
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

console.log('MiscPayment table ready');
await prisma.$disconnect();
