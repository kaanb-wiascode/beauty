import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "kaan.demo.2026@beautystudio.local";
const DEMO_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$OF5f9ckyXX3XNj/fCbgx9g$2ii56BA8AtWcucAH8tKSRPa371ROO+jlNeLSkjC0kL4";

async function main() {
  const user = await prisma.user.update({
    where: { email: DEMO_EMAIL },
    data: { passwordHash: DEMO_PASSWORD_HASH },
    select: { email: true },
  });

  console.log(`✅ Demo giriş parolası düzeltildi: ${user.email}`);
}

main()
  .catch((error) => {
    console.error("❌ Demo giriş parolası düzeltilemedi:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
