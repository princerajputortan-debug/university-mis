import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS FeeStructure (
    id INT NOT NULL AUTO_INCREMENT,
    batchId INT NOT NULL,
    paymentOptionId INT NOT NULL,
    programId INT NOT NULL,
    semFee DOUBLE NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY FeeStructure_batchId_paymentOptionId_programId_key (batchId, paymentOptionId, programId),
    CONSTRAINT FeeStructure_batchId_fkey FOREIGN KEY (batchId) REFERENCES Batch(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FeeStructure_paymentOptionId_fkey FOREIGN KEY (paymentOptionId) REFERENCES PaymentOption(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FeeStructure_programId_fkey FOREIGN KEY (programId) REFERENCES Program(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

console.log('FeeStructure table recreated with integer id');
await prisma.$disconnect();
