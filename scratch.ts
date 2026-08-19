import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const enrollment = await prisma.enrollment.upsert({
      where: { enrollment: "ENR123" },
      update: {},
      create: { enrollment: "ENR123" },
    });

    const res = await prisma.razorpayPayment.upsert({
      where: { transactionId: "TEST_123" },
      update: { amount: 100 },
      create: { 
        transactionId: "TEST_123",
        enrollmentId: enrollment.id,
        amount: 100,
      }
    });
    console.log("Success:", res);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
