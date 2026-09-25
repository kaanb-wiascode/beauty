import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "kaan.demo.2026@beautystudio.local";
const DEMO_TENANT_SLUG = "valoo-demo";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true },
  });

  if (!user) {
    throw new Error(`Demo kullanıcı bulunamadı: ${DEMO_EMAIL}`);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: DEMO_TENANT_SLUG },
    select: { id: true, name: true },
  });

  if (!tenant) {
    throw new Error(`Demo tenant bulunamadı: ${DEMO_TENANT_SLUG}`);
  }

  const targetMembership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId: tenant.id,
      },
    },
    select: { id: true },
  });

  if (!targetMembership) {
    throw new Error("Demo kullanıcının VALOO Demo tenant membership kaydı bulunamadı.");
  }

  await prisma.$transaction([
    prisma.membership.updateMany({
      where: {
        userId: user.id,
        id: { not: targetMembership.id },
        status: "ACTIVE",
      },
      data: { status: "SUSPENDED" },
    }),
    prisma.membership.update({
      where: { id: targetMembership.id },
      data: { status: "ACTIVE" },
    }),
  ]);

  console.log(`✅ Demo organizasyon context'i düzeltildi: ${tenant.name}`);
}

main()
  .catch((error) => {
    console.error("❌ Demo context düzeltmesi başarısız:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
