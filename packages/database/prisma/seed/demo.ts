import {
  AppointmentStatus,
  PaymentMethod,
  PrismaClient,
  ServiceStatus,
  StaffStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "kaan.demo.2026@beautystudio.local";
const DEMO_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$ROhiOj8CgmUjiUSahQXwlg$4Td77Rki0zkxHAULL5RZhBMagGoDbQjCZwkJn0eeP08";
const DEMO_TENANT_SLUG = "valoo-demo";
const DEMO_COMPANY_SLUG = "valoo-beauty-istanbul";
const DEMO_APPOINTMENT_PREFIX = "VALOO_DEMO:";
const DEMO_CRM_SOURCE = "VALOO_DEMO";

const PERMISSIONS = [
  ["customers", "read"],
  ["customers", "create"],
  ["customers", "update"],
  ["customers", "delete"],
  ["appointments", "read"],
  ["appointments", "create"],
  ["appointments", "update"],
  ["appointments", "cancel"],
  ["payments", "read"],
  ["payments", "create"],
  ["payments", "refund"],
  ["reports", "read"],
  ["roles", "read"],
  ["roles", "update"],
  ["staff", "read"],
  ["staff", "create"],
  ["staff", "update"],
  ["staff", "delete"],
  ["services", "read"],
  ["services", "create"],
  ["services", "update"],
  ["services", "delete"],
  ["inventory", "read"],
  ["inventory", "write"],
  ["crm", "read"],
  ["crm", "manage"],
  ["training", "read"],
  ["training", "manage"],
  ["quality", "read"],
  ["finance", "read"],
  ["finance", "manage"],
  ["accounting", "read"],
  ["accounting", "manage"],
  ["hr", "read"],
  ["hr", "manage"],
] as const;

const CUSTOMER_FIXTURES = [
  ["Zeynep", "Kaya", "+905551112233", "zeynep.kaya@valoo-demo.local"],
  ["Ayşe", "Yılmaz", "+905552223344", "ayse.yilmaz@valoo-demo.local"],
  ["Elif", "Çelik", "+905553334455", "elif.celik@valoo-demo.local"],
  ["Derya", "Aydın", "+905554445566", "derya.aydin@valoo-demo.local"],
  ["Buse", "Şahin", "+905555556677", "buse.sahin@valoo-demo.local"],
  ["Ceren", "Öztürk", "+905556667788", "ceren.ozturk@valoo-demo.local"],
  ["Selin", "Arslan", "+905557778899", "selin.arslan@valoo-demo.local"],
  ["İrem", "Koç", "+905558889900", "irem.koc@valoo-demo.local"],
  ["Melis", "Kurt", "+905559990011", "melis.kurt@valoo-demo.local"],
  ["Ece", "Demir", "+905551234890", "ece.demir@valoo-demo.local"],
  ["Seda", "Aksoy", "+905552345901", "seda.aksoy@valoo-demo.local"],
  ["Nazlı", "Ergin", "+905553456012", "nazli.ergin@valoo-demo.local"],
  ["Gizem", "Polat", "+905554567123", "gizem.polat@valoo-demo.local"],
  ["Merve", "Kara", "+905555678234", "merve.kara@valoo-demo.local"],
  ["Damla", "Özdemir", "+905556789345", "damla.ozdemir@valoo-demo.local"],
  ["Pelin", "Aksu", "+905557890456", "pelin.aksu@valoo-demo.local"],
  ["Sibel", "Güneş", "+905558901567", "sibel.gunes@valoo-demo.local"],
  ["Nehir", "Yalçın", "+905559012678", "nehir.yalcin@valoo-demo.local"],
  ["Aslı", "Eren", "+905550123789", "asli.eren@valoo-demo.local"],
  ["Burcu", "Taş", "+905551234791", "burcu.tas@valoo-demo.local"],
] as const;

const STAFF_FIXTURES = [
  ["Elif", "Demir", "+905551000001", "elif.demir@valoo-demo.local", "Cilt Bakım Uzmanı"],
  ["Merve", "Kara", "+905551000002", "merve.kara.staff@valoo-demo.local", "Nail Artist"],
  ["Sinem", "Yıldız", "+905551000003", "sinem.yildiz@valoo-demo.local", "Kaş & Kirpik Uzmanı"],
  ["Bahar", "Acar", "+905551000004", "bahar.acar@valoo-demo.local", "Güzellik Uzmanı"],
  ["Aslı", "Özkan", "+905551000005", "asli.ozkan@valoo-demo.local", "Nail Artist"],
  ["Deniz", "Korkmaz", "+905551000006", "deniz.korkmaz@valoo-demo.local", "Cilt Bakım Uzmanı"],
] as const;

const SERVICE_FIXTURES = [
  ["Manikür", "Klasik manikür bakımı", 60, 750],
  ["Pedikür", "Klasik pedikür bakımı", 75, 900],
  ["Kalıcı Oje", "Profesyonel kalıcı oje uygulaması", 75, 1100],
  ["Jel Tırnak", "Doğal görünümlü jel tırnak uygulaması", 120, 1800],
  ["Nail Art", "Özel tasarım nail art", 45, 650],
  ["Hydrafacial Cilt Bakımı", "Derinlemesine profesyonel cilt bakımı", 90, 2250],
  ["Kaş Tasarımı", "Kaş şekillendirme ve tasarım", 30, 600],
  ["Kirpik Lifting", "Kirpik lifting ve bakım uygulaması", 60, 1250],
  ["İpek Kirpik", "Doğal görünüm ipek kirpik uygulaması", 120, 1900],
  ["Leke Bakımı", "Cilt tonu eşitlemeye yönelik profesyonel bakım", 90, 2500],
] as const;

function dayAt(dayOffset: number, hour: number, minute = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function ensureCrmTables() {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>(
    `SELECT to_regclass('public.crm_leads')::text AS name`,
  );
  if (!rows[0]?.name) {
    throw new Error(
      "CRM tabloları bulunamadı. Önce migration deploy çalıştırın: pnpm --filter @beauty-erp/database migrate:deploy",
    );
  }
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_TENANT_SLUG },
    update: { name: "VALOO Demo Güzellik Grubu" },
    create: {
      name: "VALOO Demo Güzellik Grubu",
      slug: DEMO_TENANT_SLUG,
    },
  });

  const company = await prisma.company.upsert({
    where: {
      tenantId_slug: {
        tenantId: tenant.id,
        slug: DEMO_COMPANY_SLUG,
      },
    },
    update: {
      name: "VALOO Beauty İstanbul",
      status: "ACTIVE",
    },
    create: {
      tenantId: tenant.id,
      name: "VALOO Beauty İstanbul",
      slug: DEMO_COMPANY_SLUG,
      status: "ACTIVE",
    },
  });

  const nisantasi = await prisma.branch.upsert({
    where: {
      companyId_code: {
        companyId: company.id,
        code: "NIS",
      },
    },
    update: {
      name: "Nişantaşı",
      status: "ACTIVE",
      address: "Teşvikiye, Şişli / İstanbul",
      phone: "+90 212 555 20 26",
      email: "nisantasi@valoo-demo.local",
    },
    create: {
      companyId: company.id,
      name: "Nişantaşı",
      code: "NIS",
      address: "Teşvikiye, Şişli / İstanbul",
      phone: "+90 212 555 20 26",
      email: "nisantasi@valoo-demo.local",
    },
  });

  const atasehir = await prisma.branch.upsert({
    where: {
      companyId_code: {
        companyId: company.id,
        code: "ATA",
      },
    },
    update: {
      name: "Ataşehir",
      status: "ACTIVE",
      address: "Barbaros, Ataşehir / İstanbul",
      phone: "+90 216 555 20 26",
      email: "atasehir@valoo-demo.local",
    },
    create: {
      companyId: company.id,
      name: "Ataşehir",
      code: "ATA",
      address: "Barbaros, Ataşehir / İstanbul",
      phone: "+90 216 555 20 26",
      email: "atasehir@valoo-demo.local",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      passwordHash: DEMO_PASSWORD_HASH,
      firstName: "Kaan",
      lastName: "Demo",
    },
    create: {
      email: DEMO_EMAIL,
      passwordHash: DEMO_PASSWORD_HASH,
      firstName: "Kaan",
      lastName: "Demo",
    },
  });

  const ownerRole = await prisma.role.upsert({
    where: {
      tenantId_slug: {
        tenantId: tenant.id,
        slug: "owner",
      },
    },
    update: {
      companyId: company.id,
      name: "Owner",
      description: "VALOO demo hesabı tam yetkili yönetici rolü.",
      scope: "CENTRAL",
    },
    create: {
      tenantId: tenant.id,
      companyId: company.id,
      name: "Owner",
      slug: "owner",
      description: "VALOO demo hesabı tam yetkili yönetici rolü.",
      scope: "CENTRAL",
    },
  });

  const membership = await prisma.membership.upsert({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId: tenant.id,
      },
    },
    update: {
      companyId: company.id,
      roleId: ownerRole.id,
      status: "ACTIVE",
    },
    create: {
      userId: user.id,
      tenantId: tenant.id,
      companyId: company.id,
      roleId: ownerRole.id,
      status: "ACTIVE",
    },
  });

  for (const branch of [nisantasi, atasehir]) {
    await prisma.membershipBranchAccess.upsert({
      where: {
        membershipId_branchId: {
          membershipId: membership.id,
          branchId: branch.id,
        },
      },
      update: {},
      create: {
        membershipId: membership.id,
        branchId: branch.id,
      },
    });
  }

  for (const [resource, action] of PERMISSIONS) {
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

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: ownerRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: ownerRole.id,
        permissionId: permission.id,
      },
    });
  }

  const customerRecords = [];
  for (let i = 0; i < CUSTOMER_FIXTURES.length; i += 1) {
    const [firstName, lastName, phone, email] = CUSTOMER_FIXTURES[i];
    const branchId = i < 14 ? nisantasi.id : atasehir.id;
    const existing = await prisma.customer.findFirst({
      where: { tenantId: tenant.id, email },
    });
    const customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: { branchId, firstName, lastName, phone },
        })
      : await prisma.customer.create({
          data: {
            tenantId: tenant.id,
            branchId,
            firstName,
            lastName,
            phone,
            email,
          },
        });
    customerRecords.push(customer);
  }

  const staffRecords = [];
  for (let i = 0; i < STAFF_FIXTURES.length; i += 1) {
    const [firstName, lastName, phone, email, title] = STAFF_FIXTURES[i];
    const branchId = i < 4 ? nisantasi.id : atasehir.id;
    const existing = await prisma.staff.findFirst({
      where: { tenantId: tenant.id, email },
    });
    const member = existing
      ? await prisma.staff.update({
          where: { id: existing.id },
          data: {
            branchId,
            firstName,
            lastName,
            phone,
            status: StaffStatus.ACTIVE,
            profile: { title },
          },
        })
      : await prisma.staff.create({
          data: {
            tenantId: tenant.id,
            branchId,
            firstName,
            lastName,
            phone,
            email,
            status: StaffStatus.ACTIVE,
            profile: { title },
          },
        });
    staffRecords.push(member);
  }

  const serviceRecords = [];
  for (let i = 0; i < SERVICE_FIXTURES.length; i += 1) {
    const [name, description, durationMinutes, price] = SERVICE_FIXTURES[i];
    const branchId = i < 8 ? nisantasi.id : atasehir.id;
    const existing = await prisma.service.findFirst({
      where: { tenantId: tenant.id, branchId, name },
    });
    const service = existing
      ? await prisma.service.update({
          where: { id: existing.id },
          data: {
            description,
            durationMinutes,
            price,
            status: ServiceStatus.ACTIVE,
          },
        })
      : await prisma.service.create({
          data: {
            tenantId: tenant.id,
            branchId,
            name,
            description,
            durationMinutes,
            price,
            status: ServiceStatus.ACTIVE,
          },
        });
    serviceRecords.push(service);
  }

  const oldDemoAppointments = await prisma.appointment.findMany({
    where: {
      tenantId: tenant.id,
      notes: { startsWith: DEMO_APPOINTMENT_PREFIX },
    },
    select: { id: true },
  });
  if (oldDemoAppointments.length) {
    await prisma.payment.deleteMany({
      where: {
        tenantId: tenant.id,
        appointmentId: { in: oldDemoAppointments.map((item) => item.id) },
      },
    });
    await prisma.appointment.deleteMany({
      where: { id: { in: oldDemoAppointments.map((item) => item.id) } },
    });
  }

  const appointmentPlan = [
    [-10, 10, 0, 0, 0, AppointmentStatus.COMPLETED],
    [-9, 11, 1, 1, 1, AppointmentStatus.COMPLETED],
    [-8, 14, 2, 2, 2, AppointmentStatus.COMPLETED],
    [-7, 16, 3, 3, 3, AppointmentStatus.COMPLETED],
    [-6, 10, 0, 4, 4, AppointmentStatus.COMPLETED],
    [-5, 12, 1, 5, 5, AppointmentStatus.COMPLETED],
    [-4, 15, 2, 6, 6, AppointmentStatus.COMPLETED],
    [-3, 11, 3, 7, 7, AppointmentStatus.COMPLETED],
    [-2, 13, 0, 8, 0, AppointmentStatus.COMPLETED],
    [-1, 17, 1, 9, 1, AppointmentStatus.COMPLETED],
    [0, 9, 0, 10, 2, AppointmentStatus.COMPLETED],
    [0, 10, 1, 11, 3, AppointmentStatus.COMPLETED],
    [0, 13, 2, 12, 5, AppointmentStatus.CONFIRMED],
    [0, 15, 3, 13, 6, AppointmentStatus.SCHEDULED],
    [0, 17, 0, 0, 7, AppointmentStatus.CONFIRMED],
    [1, 9, 1, 1, 0, AppointmentStatus.CONFIRMED],
    [1, 11, 2, 2, 1, AppointmentStatus.SCHEDULED],
    [1, 14, 3, 3, 2, AppointmentStatus.SCHEDULED],
    [1, 17, 0, 4, 3, AppointmentStatus.CONFIRMED],
    [2, 10, 1, 5, 4, AppointmentStatus.SCHEDULED],
    [2, 12, 2, 6, 5, AppointmentStatus.SCHEDULED],
    [2, 15, 3, 7, 6, AppointmentStatus.CONFIRMED],
    [3, 9, 0, 8, 7, AppointmentStatus.SCHEDULED],
    [3, 11, 1, 9, 0, AppointmentStatus.SCHEDULED],
    [3, 14, 2, 10, 1, AppointmentStatus.SCHEDULED],
    [4, 10, 3, 11, 2, AppointmentStatus.CONFIRMED],
    [4, 13, 0, 12, 3, AppointmentStatus.SCHEDULED],
    [4, 16, 1, 13, 4, AppointmentStatus.SCHEDULED],
    [5, 10, 4, 14, 8, AppointmentStatus.SCHEDULED],
    [5, 13, 5, 15, 9, AppointmentStatus.CONFIRMED],
    [6, 11, 4, 16, 8, AppointmentStatus.SCHEDULED],
    [6, 15, 5, 17, 9, AppointmentStatus.SCHEDULED],
  ] as const;

  const createdAppointments = [];
  for (let i = 0; i < appointmentPlan.length; i += 1) {
    const [dayOffset, hour, staffIndex, customerIndex, serviceIndex, status] =
      appointmentPlan[i];
    const staffMember = staffRecords[staffIndex];
    const customer = customerRecords[customerIndex];
    const service = serviceRecords[serviceIndex];
    const startAt = dayAt(dayOffset, hour, i % 2 ? 30 : 0);
    const endAt = new Date(startAt);
    endAt.setMinutes(endAt.getMinutes() + service.durationMinutes);

    const appointment = await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        branchId: customer.branchId,
        customerId: customer.id,
        staffId: staffMember.id,
        serviceId: service.id,
        startAt,
        endAt,
        status,
        notes: `${DEMO_APPOINTMENT_PREFIX} ${service.name}`,
      },
    });
    createdAppointments.push({ appointment, service, status });
  }

  let paymentIndex = 0;
  for (const item of createdAppointments) {
    if (item.status !== AppointmentStatus.COMPLETED) continue;
    const methods = [PaymentMethod.CARD, PaymentMethod.CASH, PaymentMethod.TRANSFER];
    await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        appointmentId: item.appointment.id,
        amount: item.service.price,
        method: methods[paymentIndex % methods.length],
        status: "COMPLETED",
        paidAt: item.appointment.endAt,
      },
    });
    paymentIndex += 1;
  }

  await ensureCrmTables();

  const leadFixtures = [
    ["Eylül", "Acar", "+905532220001", "eylul.acar@valoo-demo.local", "NEW", "Hydrafacial ve leke bakımıyla ilgileniyor."],
    ["İlayda", "Gür", "+905532220002", "ilayda.gur@valoo-demo.local", "CONTACTED", "Düğün öncesi bakım paketi soruyor."],
    ["Tuğçe", "Sezer", "+905532220003", "tugce.sezer@valoo-demo.local", "QUALIFIED", "6 seanslık cilt bakım paketi istiyor."],
    ["Beste", "Can", "+905532220004", "beste.can@valoo-demo.local", "QUALIFIED", "Kalıcı oje + aylık bakım paketi."],
    ["Nisa", "Önal", "+905532220005", "nisa.onal@valoo-demo.local", "QUALIFIED", "VIP yıllık bakım paketi teklif aşamasında."],
    ["Yağmur", "Tunç", "+905532220006", "yagmur.tunc@valoo-demo.local", "CONTACTED", "Kirpik lifting için fiyat aldı."],
    ["Derin", "Soylu", "+905532220007", "derin.soylu@valoo-demo.local", "NEW", "Instagram reklamından geldi."],
    ["Lara", "Ersoy", "+905532220008", "lara.ersoy@valoo-demo.local", "LOST", "Lokasyon uzak olduğu için vazgeçti."],
  ] as const;

  const leadIds: string[] = [];
  for (let i = 0; i < leadFixtures.length; i += 1) {
    const [firstName, lastName, phone, email, status, note] = leadFixtures[i];
    const id = `valoo-demo-lead-${i + 1}`;
    const branchId = i < 6 ? nisantasi.id : atasehir.id;
    await prisma.$executeRawUnsafe(
      `INSERT INTO crm_leads(
         id,tenant_id,company_id,branch_id,owner_user_id,first_name,last_name,phone,email,
         source,status,interest_note,lost_reason,created_by_user_id,version,created_at,updated_at
       ) VALUES(
         $1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11,$12,$13,$5::text,1,
         NOW() - ($14::int * INTERVAL '1 day'),NOW() - ($14::int * INTERVAL '1 day')
       )
       ON CONFLICT (id) DO UPDATE SET
         branch_id=EXCLUDED.branch_id,
         owner_user_id=EXCLUDED.owner_user_id,
         first_name=EXCLUDED.first_name,
         last_name=EXCLUDED.last_name,
         phone=EXCLUDED.phone,
         email=EXCLUDED.email,
         source=EXCLUDED.source,
         status=EXCLUDED.status,
         interest_note=EXCLUDED.interest_note,
         lost_reason=EXCLUDED.lost_reason,
         updated_at=NOW()`,
      id,
      tenant.id,
      company.id,
      branchId,
      user.id,
      firstName,
      lastName,
      phone,
      email,
      DEMO_CRM_SOURCE,
      status,
      note,
      status === "LOST" ? "Lokasyon uygun değil" : null,
      8 - i,
    );
    leadIds.push(id);

    await prisma.$executeRawUnsafe(
      `INSERT INTO crm_events(
         id,tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'LEAD_CREATED',$6::text,$7::jsonb,NOW() - INTERVAL '2 day')
       ON CONFLICT (id) DO NOTHING`,
      `valoo-demo-event-lead-created-${i + 1}`,
      tenant.id,
      company.id,
      branchId,
      id,
      user.id,
      JSON.stringify({ source: DEMO_CRM_SOURCE }),
    );
  }

  const opportunityFixtures = [
    [2, "Premium Cilt Bakım Paketi", 13500, "PROPOSAL", 65, 10],
    [3, "Yıllık Nail Care Paketi", 9800, "NEGOTIATION", 80, 7],
    [4, "VIP Yıllık Beauty Plan", 26500, "NEEDS_ANALYSIS", 40, 18],
  ] as const;
  const opportunityIds: string[] = [];
  for (let i = 0; i < opportunityFixtures.length; i += 1) {
    const [leadIndex, title, value, stage, probability, closeInDays] = opportunityFixtures[i];
    const id = `valoo-demo-opportunity-${i + 1}`;
    const leadBranch = leadIndex < 6 ? nisantasi.id : atasehir.id;
    await prisma.$executeRawUnsafe(
      `INSERT INTO crm_opportunities(
         id,tenant_id,company_id,branch_id,lead_id,owner_user_id,title,estimated_value,currency,
         stage,probability,expected_close_date,created_by_user_id,version,created_at,updated_at
       ) VALUES(
         $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,'TRY',$9,$10,
         NOW() + ($11::int * INTERVAL '1 day'),$6::text,1,NOW(),NOW()
       )
       ON CONFLICT (id) DO UPDATE SET
         branch_id=EXCLUDED.branch_id,
         owner_user_id=EXCLUDED.owner_user_id,
         title=EXCLUDED.title,
         estimated_value=EXCLUDED.estimated_value,
         currency=EXCLUDED.currency,
         stage=EXCLUDED.stage,
         probability=EXCLUDED.probability,
         expected_close_date=EXCLUDED.expected_close_date,
         updated_at=NOW()`,
      id,
      tenant.id,
      company.id,
      leadBranch,
      leadIds[leadIndex],
      user.id,
      title,
      value,
      stage,
      probability,
      closeInDays,
    );
    opportunityIds.push(id);
  }

  const followUps = [
    [leadIds[0], null, "WHATSAPP", 0, 14, "İlk ihtiyaç analizi mesajı gönderilecek."],
    [leadIds[1], null, "CALL", 1, 11, "Düğün tarihini ve paket kapsamını netleştir."],
    [leadIds[5], null, "SMS", 1, 16, "Kirpik lifting uygunluk hatırlatması."],
    [null, opportunityIds[0], "CALL", 2, 10, "Teklif geri bildirimi alınacak."],
    [null, opportunityIds[1], "IN_PERSON", 3, 13, "Paket sözleşmesi için merkezde görüşme."],
    [null, opportunityIds[2], "EMAIL", 4, 12, "VIP plan teklif PDF'i takip edilecek."],
  ] as const;

  for (let i = 0; i < followUps.length; i += 1) {
    const [leadId, opportunityId, channel, dayOffset, hour, note] = followUps[i];
    const subjectLeadIndex = leadId ? leadIds.indexOf(leadId) : 2;
    const branchId = subjectLeadIndex >= 6 ? atasehir.id : nisantasi.id;
    await prisma.$executeRawUnsafe(
      `INSERT INTO crm_follow_ups(
         id,tenant_id,company_id,branch_id,lead_id,opportunity_id,assigned_user_id,channel,due_at,note,
         created_by_user_id,version,created_at,updated_at
       ) VALUES(
         $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8,$9,$10,$7::text,1,NOW(),NOW()
       )
       ON CONFLICT (id) DO UPDATE SET
         branch_id=EXCLUDED.branch_id,
         lead_id=EXCLUDED.lead_id,
         opportunity_id=EXCLUDED.opportunity_id,
         assigned_user_id=EXCLUDED.assigned_user_id,
         channel=EXCLUDED.channel,
         due_at=EXCLUDED.due_at,
         note=EXCLUDED.note,
         updated_at=NOW()`,
      `valoo-demo-follow-up-${i + 1}`,
      tenant.id,
      company.id,
      branchId,
      leadId,
      opportunityId,
      user.id,
      channel,
      dayAt(dayOffset, hour),
      note,
    );
  }

  console.log("");
  console.log("✅ VALOO demo hesabı ve verileri hazır.");
  console.log(`🏢 Tenant: ${tenant.name}`);
  console.log(`🏬 Şube: 2 (Nişantaşı, Ataşehir)`);
  console.log(`👤 Demo kullanıcı: ${DEMO_EMAIL}`);
  console.log(`👥 Müşteri: ${customerRecords.length}`);
  console.log(`👩‍💼 Personel: ${staffRecords.length}`);
  console.log(`✨ Hizmet: ${serviceRecords.length}`);
  console.log(`📅 Randevu: ${createdAppointments.length}`);
  console.log(`💳 Ödeme: ${paymentIndex}`);
  console.log(`🎯 CRM lead: ${leadIds.length}`);
  console.log(`💼 CRM fırsat: ${opportunityIds.length}`);
  console.log(`📞 CRM takip: ${followUps.length}`);
}

main()
  .catch((error) => {
    console.error("❌ Demo seed başarısız:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
