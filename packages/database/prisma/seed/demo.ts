import { PrismaClient, AppointmentStatus, StaffStatus, ServiceStatus } from "@prisma/client";
const prisma = new PrismaClient();

const TENANT_ID = "c189efa4-1e79-4cd7-8a98-2b63b9d16804";

const customers = [
  ["Zeynep", "Kaya", "+905551112233", "zeynep.kaya@example.com"],
  ["Ayşe", "Yılmaz", "+905552223344", "ayse.yilmaz@example.com"],
  ["Elif", "Çelik", "+905553334455", "elif.celik@example.com"],
  ["Derya", "Aydın", "+905554445566", "derya.aydin@example.com"],
  ["Buse", "Şahin", "+905555556677", "buse.sahin@example.com"],
  ["Ceren", "Öztürk", "+905556667788", "ceren.ozturk@example.com"],
  ["Selin", "Arslan", "+905557778899", "selin.arslan@example.com"],
  ["İrem", "Koç", "+905558889900", "irem.koc@example.com"],
  ["Melis", "Kurt", "+905559990011", "melis.kurt@example.com"],
  ["Ece", "Demir", "+905551234890", "ece.demir@example.com"],
  ["Seda", "Aksoy", "+905552345901", "seda.aksoy@example.com"],
  ["Nazlı", "Ergin", "+905553456012", "nazli.ergin@example.com"],
  ["Gizem", "Polat", "+905554567123", "gizem.polat@example.com"],
  ["Merve", "Kara", "+905555678234", "merve.kara@example.com"],
  ["Damla", "Özdemir", "+905556789345", "damla.ozdemir@example.com"],
];

const staff = [
  ["Elif", "Demir", "+905551000001", "elif.demir@beautystudio.example.com"],
  ["Merve", "Kara", "+905551000002", "merve.kara@beautystudio.example.com"],
  ["Sinem", "Yıldız", "+905551000003", "sinem.yildiz@beautystudio.example.com"],
  ["Bahar", "Acar", "+905551000004", "bahar.acar@beautystudio.example.com"],
  ["Aslı", "Özkan", "+905551000005", "asli.ozkan@beautystudio.example.com"],
];

const services = [
  ["Manikür", "Klasik manikür bakımı", 60, 750],
  ["Pedikür", "Klasik pedikür bakımı", 75, 900],
  ["Kalıcı Oje", "Profesyonel kalıcı oje uygulaması", 75, 1100],
    ["Jel Tırnak", "Doğal görünümlü jel tırnak uygulaması", 120, 1800],
    ["Nail Art", "Özel tasarım nail art", 45, 650],
  ["Cilt Bakımı", "Derinlemesine profesyonel cilt bakımı", 90, 1500],
  ["Kaş Tasarımı", "Kaş şekillendirme ve tasarım", 30, 450],
  ["Kirpik Lifting", "Kirpik lifting ve bakım uygulaması", 60, 950],
] as const;

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
  });

  if (!tenant) {
    throw new Error(`Tenant bulunamadı: ${TENANT_ID}`);
  }

  console.log(`Tenant: ${tenant.name}`);

  const customerRecords = [];

  for (const [firstName, lastName, phone, email] of customers) {
    let customer = await prisma.customer.findFirst({
      where: {
        tenantId: TENANT_ID,
        email,
      },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          tenantId: TENANT_ID,
          firstName,
          lastName,
          phone,
          email,
        },
      });
    }

    customerRecords.push(customer);
  }

  const staffRecords = [];

  for (const [firstName, lastName, phone, email] of staff) {
    let member = await prisma.staff.findFirst({
      where: {
        tenantId: TENANT_ID,
        email,
      },
    });

    if (!member) {
      member = await prisma.staff.create({
        data: {
          tenantId: TENANT_ID,
          firstName,
          lastName,
          phone,
          email,
          status: StaffStatus.ACTIVE,
        },
      });
    }

    staffRecords.push(member);
  }

  const serviceRecords = [];

  for (const [name, description, durationMinutes, price] of services) {
    let service = await prisma.service.findFirst({
      where: {
        tenantId: TENANT_ID,
        name,
      },
    });

    if (!service) {
      service = await prisma.service.create({
        data: {
          tenantId: TENANT_ID,
          name,
          description,
          durationMinutes,
          price,
          status: ServiceStatus.ACTIVE,
        },
      });
    }

    serviceRecords.push(service);
  }

  const existingDemo = await prisma.appointment.count({
    where: {
      tenantId: TENANT_ID,
      notes: {
        startsWith: "DEMO:",
      },
    },
  });

  if (existingDemo === 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointments = [
      [0, 9, 0, 60, 0, 0, AppointmentStatus.COMPLETED],
      [0, 10, 30, 75, 1, 1, AppointmentStatus.COMPLETED],
      [0, 13, 0, 90, 2, 2, AppointmentStatus.CONFIRMED],
      [0, 15, 0, 60, 3, 3, AppointmentStatus.SCHEDULED],
      [0, 17, 0, 75, 4, 4, AppointmentStatus.CONFIRMED],

      [1, 9, 30, 60, 1, 5, AppointmentStatus.CONFIRMED],
      [1, 11, 0, 75, 2, 6, AppointmentStatus.SCHEDULED],
      [1, 13, 30, 120, 3, 7, AppointmentStatus.SCHEDULED],
      [1, 16, 0, 60, 4, 8, AppointmentStatus.CONFIRMED],

      [2, 10, 0, 75, 0, 9, AppointmentStatus.SCHEDULED],
      [2, 11, 30, 60, 1, 10, AppointmentStatus.SCHEDULED],
      [2, 14, 0, 90, 2, 11, AppointmentStatus.SCHEDULED],
      [2, 16, 30, 45, 3, 12, AppointmentStatus.SCHEDULED],

      [3, 9, 0, 60, 4, 13, AppointmentStatus.SCHEDULED],
      [3, 11, 0, 90, 0, 14, AppointmentStatus.SCHEDULED],
      [3, 14, 30, 75, 1, 0, AppointmentStatus.CONFIRMED],
      [3, 17, 0, 60, 2, 1, AppointmentStatus.SCHEDULED],

      [4, 10, 0, 75, 3, 2, AppointmentStatus.SCHEDULED],
      [4, 12, 0, 60, 4, 3, AppointmentStatus.SCHEDULED],
      [4, 15, 0, 120, 0, 4, AppointmentStatus.SCHEDULED],

      [5, 9, 30, 60, 1, 5, AppointmentStatus.SCHEDULED],
      [5, 11, 30, 75, 2, 6, AppointmentStatus.SCHEDULED],
      [5, 14, 0, 90, 3, 7, AppointmentStatus.SCHEDULED],

      [6, 10, 0, 60, 4, 8, AppointmentStatus.SCHEDULED],
      [6, 13, 0, 75, 0, 9, AppointmentStatus.SCHEDULED],
    ] as const;

    for (let i = 0; i < appointments.length; i++) {
      const [
        dayOffset,
        hour,
        minute,
        duration,
        staffIndex,
        customerIndex,
        status,
      ] = appointments[i];

      const startAt = new Date(today);
      startAt.setDate(today.getDate() + dayOffset);
      startAt.setHours(hour, minute, 0, 0);

      const endAt = new Date(startAt);
      endAt.setMinutes(endAt.getMinutes() + duration);

      const staffMember = staffRecords[staffIndex];
      const customer = customerRecords[customerIndex];
      const service = serviceRecords[i % serviceRecords.length];

      await prisma.appointment.create({
        data: {
          tenantId: TENANT_ID,
          customerId: customer.id,
          staffId: staffMember.id,
          serviceId: service.id,
          startAt,
          endAt,
          status,
          notes: `DEMO: ${service.name}`,
        },
      });
    }
  }

  console.log("");
  console.log("✅ Demo verileri hazır.");
  console.log(`👥 Müşteri: ${customerRecords.length}`);
  console.log(`👩‍💼 Personel: ${staffRecords.length}`);
  console.log(`✨ Hizmet: ${serviceRecords.length}`);
  console.log(`📅 Demo randevu: ${existingDemo || 25}`);
}

main()
  .catch((error) => {
    console.error("❌ Seed başarısız:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
