import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      _count: {
        select: {
          customers: true,
          staff: true,
          services: true,
          appointments: true,
          payments: true,
          memberships: true,
          roles: true,
          customerDocuments: true,
          customerConsents: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  console.log(JSON.stringify(tenants, null, 2));
}

main().finally(async () => {
  await prisma.$disconnect();
});
