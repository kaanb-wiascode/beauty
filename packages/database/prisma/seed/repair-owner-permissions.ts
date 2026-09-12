import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OWNER_PERMISSIONS = [
  ['customers', 'read'],
  ['customers', 'create'],
  ['customers', 'update'],
  ['customers', 'delete'],
  ['appointments', 'read'],
  ['appointments', 'create'],
  ['appointments', 'update'],
  ['appointments', 'cancel'],
  ['payments', 'read'],
  ['payments', 'create'],
  ['payments', 'refund'],
  ['reports', 'read'],
  ['roles', 'read'],
  ['roles', 'update'],
  ['staff', 'read'],
  ['staff', 'create'],
  ['staff', 'update'],
  ['staff', 'delete'],
  ['services', 'read'],
  ['services', 'create'],
  ['services', 'update'],
  ['services', 'delete'],
  ['inventory', 'read'],
  ['inventory', 'write'],
  ['crm', 'read'],
  ['crm', 'manage'],
  ['training', 'read'],
  ['training', 'manage'],
  ['quality', 'read'],
  ['quality', 'manage'],
  ['finance', 'read'],
  ['finance', 'manage'],
  ['accounting', 'read'],
  ['accounting', 'manage'],
  ['hr', 'read'],
  ['hr', 'manage'],
  ['financial_integrations', 'read'],
  ['financial_integrations', 'manage'],
] as const;

async function main() {
  const ownerRoles = await prisma.role.findMany({
    where: { slug: 'owner' },
    select: { id: true },
  });

  if (ownerRoles.length === 0) {
    console.log('ℹ️ Owner rolü bulunamadı; izin onarımı atlandı.');
    return;
  }

  for (const [resource, action] of OWNER_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: {
        resource_action: {
          resource,
          action,
        },
      },
      update: {},
      create: {
        resource,
        action,
        description: `${resource} ${action} permission`,
      },
    });

    await prisma.rolePermission.createMany({
      data: ownerRoles.map((role) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  console.log(
    `✅ ${ownerRoles.length} Owner rolü için ${OWNER_PERMISSIONS.length} izin doğrulandı.`,
  );
}

main()
  .catch((error) => {
    console.error('❌ Owner izinleri onarılamadı:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
