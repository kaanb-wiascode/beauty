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
  ["hr_sensitive", "read"],
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
    create: { name: "VALOO Demo Güzellik Grubu", slug: DEMO_TENANT_SLUG },
  });

  const company = await prisma.company.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: DEMO_COMPANY_SLUG } },
    update: { name: "VALOO Beauty İstanbul", status: "ACTIVE" },
    create: { tenantId: tenant.id, name: "VALOO Beauty İstanbul", slug: DEMO_COMPANY_SLUG, status: "ACTIVE" },
  });

  const nisantasi = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: "NIS" } },
    update: { name: "Nişantaşı", status: "ACTIVE", address: "Teşvikiye, Şişli / İstanbul", phone: "+90 212 555 20 26", email: "nisantasi@valoo-demo.local" },
    create: { companyId: company.id, name: "Nişantaşı", code: "NIS", address: "Teşvikiye, Şişli / İstanbul", phone: "+90 212 555 20 26", email: "nisantasi@valoo-demo.local" },
  });

  const atasehir = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: "ATA" } },
    update: { name: "Ataşehir", status: "ACTIVE", address: "Barbaros, Ataşehir / İstanbul", phone: "+90 216 555 20 26", email: "atasehir@valoo-demo.local" },
    create: { companyId: company.id, name: "Ataşehir", code: "ATA", address: "Barbaros, Ataşehir / İstanbul", phone: "+90 216 555 20 26", email: "atasehir@valoo-demo.local" },
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash: DEMO_PASSWORD_HASH, firstName: "Kaan", lastName: "Demo" },
    create: { email: DEMO_EMAIL, passwordHash: DEMO_PASSWORD_HASH, firstName: "Kaan", lastName: "Demo" },
  });

  const ownerRole = await prisma.role.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "owner" } },
    update: { companyId: company.id, name: "Owner", description: "VALOO demo hesabı tam yetkili yönetici rolü.", scope: "CENTRAL" },
    create: { tenantId: tenant.id, companyId: company.id, name: "Owner", slug: "owner", description: "VALOO demo hesabı tam yetkili yönetici rolü.", scope: "CENTRAL" },
  });

  const membership = await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    update: { companyId: company.id, roleId: ownerRole.id, status: "ACTIVE" },
    create: { userId: user.id, tenantId: tenant.id, companyId: company.id, roleId: ownerRole.id, status: "ACTIVE" },
  });

  for (const branch of [nisantasi, atasehir]) {
    await prisma.membershipBranchAccess.upsert({
      where: { membershipId_branchId: { membershipId: membership.id, branchId: branch.id } },
      update: {},
      create: { membershipId: membership.id, branchId: branch.id },
    });
  }

  for (const [resource, action] of PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      update: {},
      create: { resource, action, description: `${resource} ${action} permission` },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: ownerRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: ownerRole.id, permissionId: permission.id },
    });
  }

  const customerRecords = [];
  for (let i = 0; i < CUSTOMER_FIXTURES.length; i += 1) {
    const [firstName, lastName, phone, email] = CUSTOMER_FIXTURES[i];
    const branchId = i < 14 ? nisantasi.id : atasehir.id;
    const existing = await prisma.customer.findFirst({ where: { tenantId: tenant.id, email } });
    const customer = existing
      ? await prisma.customer.update({ where: { id: existing.id }, data: { branchId, firstName, lastName, phone } })
      : await prisma.customer.create({ data: { tenantId: tenant.id, branchId, firstName, lastName, phone, email } });
    customerRecords.push(customer);
  }

  const staffRecords = [];
  for (let i = 0; i < STAFF_FIXTURES.length; i += 1) {
    const [firstName, lastName, phone, email, title] = STAFF_FIXTURES[i];
    const branchId = i < 4 ? nisantasi.id : atasehir.id;
    const existing = await prisma.staff.findFirst({ where: { tenantId: tenant.id, email } });
    const member = existing
      ? await prisma.staff.update({ where: { id: existing.id }, data: { branchId, firstName, lastName, phone, status: StaffStatus.ACTIVE, profile: { title } } })
      : await prisma.staff.create({ data: { tenantId: tenant.id, branchId, firstName, lastName, phone, email, status: StaffStatus.ACTIVE, profile: { title } } });
    staffRecords.push(member);
  }

  const serviceRecords = [];
  for (let i = 0; i < SERVICE_FIXTURES.length; i += 1) {
    const [name, description, durationMinutes, price] = SERVICE_FIXTURES[i];
    const branchId = i < 8 ? nisantasi.id : atasehir.id;
    const existing = await prisma.service.findFirst({ where: { tenantId: tenant.id, branchId, name } });
    const service = existing
      ? await prisma.service.update({ where: { id: existing.id }, data: { description, durationMinutes, price, status: ServiceStatus.ACTIVE } })
      : await prisma.service.create({ data: { tenantId: tenant.id, branchId, name, description, durationMinutes, price, status: ServiceStatus.ACTIVE } });
    serviceRecords.push(service);
  }

  const inventory = [
    ["SKU-VALOO-001", "Profesyonel Cilt Temizleme Jeli", "Cilt Bakımı", 68, 12, 420],
    ["SKU-VALOO-002", "Hydrafacial Solüsyonu", "Cilt Bakımı", 34, 8, 980],
    ["SKU-VALOO-003", "Kalıcı Oje - Nude", "Tırnak", 92, 18, 210],
    ["SKU-VALOO-004", "Jel Tırnak Builder", "Tırnak", 45, 10, 390],
    ["SKU-VALOO-005", "Kirpik Lifting Seti", "Kirpik", 28, 6, 850],
    ["SKU-VALOO-006", "İpek Kirpik C-Curl", "Kirpik", 51, 12, 630],
  ] as const;
  for (let i = 0; i < inventory.length; i += 1) {
    const [sku, name, category, quantity, minStock, unitCost] = inventory[i];
    const branchId = i < 4 ? nisantasi.id : atasehir.id;
    const existing = await prisma.inventoryItem.findFirst({ where: { tenantId: tenant.id, branchId, sku } });
    if (existing) await prisma.inventoryItem.update({ where: { id: existing.id }, data: { name, category, quantity, minStock, unitCost, status: "ACTIVE" } });
    else await prisma.inventoryItem.create({ data: { tenantId: tenant.id, branchId, sku, name, category, quantity, minStock, unitCost, status: "ACTIVE" } });
  }

  for (let i = 0; i < serviceRecords.length; i += 1) {
    const service = serviceRecords[i];
    const staff = staffRecords[i % staffRecords.length];
    await prisma.staffService.upsert({
      where: { staffId_serviceId: { staffId: staff.id, serviceId: service.id } },
      update: {},
      create: { staffId: staff.id, serviceId: service.id },
    });
  }

  await prisma.appointment.deleteMany({ where: { tenantId: tenant.id, notes: { startsWith: DEMO_APPOINTMENT_PREFIX } } });
  const appointmentPlan = [
    [0, 9, 0, 0, 0, 0, AppointmentStatus.CONFIRMED], [0, 10, 30, 1, 1, 1, AppointmentStatus.CONFIRMED], [0, 12, 0, 2, 2, 2, AppointmentStatus.PENDING], [0, 14, 0, 3, 3, 3, AppointmentStatus.CONFIRMED], [0, 16, 0, 4, 4, 0, AppointmentStatus.PENDING], [0, 17, 30, 5, 5, 1, AppointmentStatus.CONFIRMED],
    [1, 9, 30, 6, 0, 2, AppointmentStatus.CONFIRMED], [1, 11, 0, 7, 1, 3, AppointmentStatus.PENDING], [1, 13, 30, 8, 2, 4, AppointmentStatus.CONFIRMED], [1, 15, 0, 9, 3, 5, AppointmentStatus.CONFIRMED],
    [-1, 10, 0, 10, 4, 6, AppointmentStatus.COMPLETED], [-1, 12, 0, 11, 5, 7, AppointmentStatus.COMPLETED], [-1, 15, 0, 12, 0, 8, AppointmentStatus.COMPLETED], [-2, 11, 0, 13, 1, 9, AppointmentStatus.COMPLETED], [-2, 16, 0, 14, 2, 0, AppointmentStatus.COMPLETED],
    [2, 10, 0, 15, 3, 1, AppointmentStatus.CONFIRMED], [2, 14, 0, 16, 4, 2, AppointmentStatus.PENDING], [3, 11, 0, 17, 5, 3, AppointmentStatus.CONFIRMED], [3, 16, 0, 18, 0, 4, AppointmentStatus.CONFIRMED], [4, 13, 0, 19, 1, 5, AppointmentStatus.PENDING],
  ] as const;
  for (let i = 0; i < appointmentPlan.length; i += 1) {
    const [dayOffset, hour, minute, customerIndex, staffIndex, serviceIndex, status] = appointmentPlan[i];
    const service = serviceRecords[serviceIndex];
    const startAt = dayAt(dayOffset, hour, minute);
    await prisma.appointment.create({ data: { tenantId: tenant.id, branchId: service.branchId, customerId: customerRecords[customerIndex].id, staffId: staffRecords[staffIndex].id, serviceId: service.id, startAt, endAt: new Date(startAt.getTime() + service.durationMinutes * 60_000), status, notes: `${DEMO_APPOINTMENT_PREFIX} seed appointment ${i + 1}` } });
  }

  const completedAppointments = await prisma.appointment.findMany({ where: { tenantId: tenant.id, status: AppointmentStatus.COMPLETED, notes: { startsWith: DEMO_APPOINTMENT_PREFIX } }, orderBy: { startAt: "asc" } });
  for (let i = 0; i < completedAppointments.length; i += 1) {
    const appointment = completedAppointments[i];
    const existingPayment = await prisma.payment.findFirst({ where: { tenantId: tenant.id, appointmentId: appointment.id } });
    if (existingPayment) continue;
    const service = serviceRecords.find((item) => item.id === appointment.serviceId);
    if (!service) continue;
    await prisma.payment.create({ data: { tenantId: tenant.id, branchId: appointment.branchId, appointmentId: appointment.id, amount: service.price, method: i % 2 === 0 ? PaymentMethod.CARD : PaymentMethod.CASH, note: "VALOO demo tahsilatı" } });
  }

  await ensureCrmTables();
  await prisma.$executeRawUnsafe(`DELETE FROM crm_lead_activities WHERE lead_id IN (SELECT id FROM crm_leads WHERE tenant_id = $1 AND source = $2)`, tenant.id, DEMO_CRM_SOURCE);
  await prisma.$executeRawUnsafe(`DELETE FROM crm_lead_status_history WHERE lead_id IN (SELECT id FROM crm_leads WHERE tenant_id = $1 AND source = $2)`, tenant.id, DEMO_CRM_SOURCE);
  await prisma.$executeRawUnsafe(`DELETE FROM crm_leads WHERE tenant_id = $1 AND source = $2`, tenant.id, DEMO_CRM_SOURCE);
  const crmLeads = [["Sude","Kara","+905554441100","sude.kara@lead.local","Instagram","Botoks danışmanlığı","NEW",0],["Eylül","Akın","+905554441101","eylul.akin@lead.local","Google Ads","Hydrafacial","CONTACTED",1],["İlayda","Şen","+905554441102","ilayda.sen@lead.local","Referans","Kalıcı oje","QUALIFIED",2],["Cansu","Yalın","+905554441103","cansu.yalin@lead.local","Web","Leke bakımı","PROPOSAL",0],["Selin","Acar","+905554441104","selin.acar@lead.local","Instagram","İpek kirpik","WON",1],["Dila","Öz","+905554441105","dila.oz@lead.local","TikTok","Kaş tasarımı","LOST",2]] as const;
  for (let i=0;i<crmLeads.length;i+=1){const [firstName,lastName,phone,email,sourceDetail,interest,status,staffIndex]=crmLeads[i];const leadId=`demo-lead-${i+1}`;const branch=i<4?nisantasi:atasehir;await prisma.$executeRawUnsafe(`INSERT INTO crm_leads (id,tenant_id,branch_id,first_name,last_name,phone,email,source,source_detail,interest,status,owner_staff_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()-($13::int*INTERVAL '1 day'),NOW())`,leadId,tenant.id,branch.id,firstName,lastName,phone,email,DEMO_CRM_SOURCE,sourceDetail,interest,status,staffRecords[staffIndex].id,i);await prisma.$executeRawUnsafe(`INSERT INTO crm_lead_status_history (id,lead_id,from_status,to_status,note,created_at) VALUES ($1,$2,NULL,$3,$4,NOW()-($5::int*INTERVAL '1 day'))`,`demo-status-${i+1}`,leadId,status,"Demo lead başlangıç durumu",i);await prisma.$executeRawUnsafe(`INSERT INTO crm_lead_activities (id,lead_id,activity_type,summary,details,due_at,completed_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,NOW()+($6::int*INTERVAL '1 day'),$7,NOW(),NOW())`,`demo-activity-${i+1}`,leadId,i%2===0?"CALL":"FOLLOW_UP",`${firstName} ${lastName} takip`,`Demo CRM aktivitesi`,i+1,status==="WON"?new Date():null);}

  console.log(`\nDemo seed hazır.\nE-posta: ${DEMO_EMAIL}\nŞifre: BeautyDemo2026!\nTenant: ${tenant.name}\nŞirket: ${company.name}\nŞubeler: ${nisantasi.name}, ${atasehir.name}\n`);
}

main().catch((error)=>{console.error("Demo seed oluşturulamadı:");console.error(error);process.exit(1)}).finally(async()=>{await prisma.$disconnect()});
