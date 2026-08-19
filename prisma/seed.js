const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Create Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@univ.edu' },
    update: {},
    create: {
      email: 'admin@univ.edu',
      password: 'password123',
      role: 'ADMIN',
    },
  });

  // Create 4 Viewers
  for (let i = 1; i <= 4; i++) {
    await prisma.user.upsert({
      where: { email: `viewer${i}@univ.edu` },
      update: {},
      create: {
        email: `viewer${i}@univ.edu`,
        password: 'password123',
        role: 'VIEWER',
      },
    });
  }

  console.log('Seed completed: 1 Admin, 4 Viewers created.');
  console.log('Run "npm run seed:lookups" to load Software-* reference lookup tables.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
