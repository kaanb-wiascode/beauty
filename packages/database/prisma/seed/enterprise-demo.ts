import { randomUUID } from "node:crypto";
import {
  AppointmentStatus,
  PaymentMethod,
  PrismaClient,
  RoleScope,
  ServiceStatus,
  StaffStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_TENANT_SLUG = "valoo-enterprise-demo";
const DEMO_COMPANY_SLUG = "valoo-enterprise-group";
const DEMO_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$D5bOeUCU5d/cOI9PFahXhg$7lBErjeCanRH30cpOzjC4zjd6mSA+oFvTabpo51iaNM";
const APPOINTMENT_PREFIX = "VALOO_ENTERPRISE_DEMO:";
const DEMO_DOMAIN = "demo.valoo.com";

type DemoBranch = {
  code: string;
  name: string;
  city: string;
  district: string;
  region: number;
};

type DemoRoleKey =
  | "owner"
  | "general-manager"
  | "hr-manager"
  | "hr-specialist"
  | "accounting-manager"
  | "accounting-specialist"
  | "regional-manager"
  | "coordinator"
  | "branch-manager"
  | "esthetician"
  | "sales"
  | "reception";

const BRANCHES: DemoBranch[] = [
  { code: "IST01", name: "Nişantaşı", city: "İstanbul", district: "Şişli", region: 1 },
  { code: "IST02", name: "Ataşehir", city: "İstanbul", district: "Ataşehir", region: 1 },
  { code: "IST03", name: "Kadıköy", city: "İstanbul", district: "Kadıköy", region: 1 },
  { code: "IST04", name: "Bakırköy", city: "İstanbul", district: "Bakırköy", region: 1 },
  { code: "IST05", name: "Beylikdüzü", city: "İstanbul", district: "Beylikdüzü", region: 1 },
  { code: "ANK01", name: "Çankaya", city: "Ankara", district: "Çankaya", region: 2 },
  { code: "ANK02", name: "Ümitköy", city: "Ankara", district: "Çankaya", region: 2 },
  { code: "IZM01", name: "Alsancak", city: "İzmir", district: "Konak", region: 2 },
  { code: "IZM02", name: "Mavişehir", city: "İzmir", district: "Karşıyaka", region: 2 },
  { code: "BUR01", name: "Nilüfer", city: "Bursa", district: "Nilüfer", region: 3 },
  { code: "ANT01", name: "Lara", city: "Antalya", district: "Muratpaşa", region: 3 },
  { code: "ADA01", name: "Seyhan", city: "Adana", district: "Seyhan", region: 3 },
  { code: "KOC01", name: "İzmit", city: "Kocaeli", district: "İzmit", region: 3 },
  { code: "KON01", name: "Selçuklu", city: "Konya", district: "Selçuklu", region: 4 },
  { code: "MER01", name: "Yenişehir", city: "Mersin", district: "Yenişehir", region: 4 },
  { code: "GAZ01", name: "Şehitkamil", city: "Gaziantep", district: "Şehitkamil", region: 4 },
  { code: "DIY01", name: "Kayapınar", city: "Diyarbakır", district: "Kayapınar", region: 4 },
  { code: "SAM01", name: "Atakum", city: "Samsun", district: "Atakum", region: 4 },
];

const FIRST_NAMES = [
  "Zeynep","Elif","Merve","Derya","Buse","Ceren","Selin","İrem","Melis","Ece",
  "Seda","Nazlı","Gizem","Damla","Pelin","Sibel","Nehir","Aslı","Burcu","Eylül",
  "İlayda","Tuğçe","Beste","Nisa","Yağmur","Derin","Lara","Aylin","Deniz","Bahar",
];
const LAST_NAMES = [
  "Kaya","Yılmaz","Çelik","Aydın","Şahin","Öztürk","Arslan","Koç","Kurt","Demir",
  "Aksoy","Ergin","Polat","Kara","Özdemir","Aksu","Güneş","Yalçın","Eren","Taş",
  "Acar","Gür","Sezer","Can","Önal","Tunç","Soylu","Ersoy","Korkmaz","Özkan",
];

const SERVICES = [
  ["Tüm Vücut Lazer Epilasyon", 75, 1850],
  ["Hydrafacial Cilt Bakımı", 90, 2250],
  ["Medikal Cilt Bakımı", 75, 1750],
  ["Leke Bakımı", 90, 2500],
  ["Kaş Tasarımı", 30, 650],
  ["Kirpik Lifting", 60, 1350],
  ["İpek Kirpik", 120, 2100],
  ["Manikür & Kalıcı Oje", 75, 1250],
  ["Bölgesel İncelme", 60, 1600],
  ["LED Maske Bakımı", 30, 750],
] as const;

const INVENTORY_PRODUCTS = [
  ["Hydrafacial Solüsyon A", "HF-A", "HydraPro", "ML", 220, 390],
  ["Hydrafacial Solüsyon B", "HF-B", "HydraPro", "ML", 240, 420],
  ["Cilt Temizleme Jeli", "CTJ-01", "Dermaline", "ML", 180, 320],
  ["Hyaluronik Serum", "HYS-01", "Dermaline", "ML", 340, 650],
  ["C Vitamini Serum", "CVS-01", "Dermaline", "ML", 310, 590],
  ["Leke Bakım Serumu", "LBS-01", "Cosmedica", "ML", 360, 690],
  ["SPF 50 Güneş Kremi", "SPF-50", "Cosmedica", "UNIT", 280, 525],
  ["Nitril Eldiven S", "ELD-S", "MedSupply", "BOX", 190, 290],
  ["Nitril Eldiven M", "ELD-M", "MedSupply", "BOX", 190, 290],
  ["Nitril Eldiven L", "ELD-L", "MedSupply", "BOX", 190, 290],
  ["Tek Kullanımlık Sedye Örtüsü", "SED-01", "MedSupply", "BOX", 260, 390],
  ["Pamuk Ped", "PAM-01", "CareLine", "BOX", 85, 145],
  ["Mikrofiber Havlu", "HAV-01", "CareLine", "UNIT", 95, 180],
  ["Lazer Başlık Koruyucu", "LZR-K", "LaserTech", "BOX", 420, 650],
  ["Ultrason Jeli", "ULT-J", "MedSupply", "LITER", 175, 295],
  ["Kirpik Lifting Seti", "KLP-SET", "LashPro", "BOX", 490, 790],
  ["İpek Kirpik C Curl", "IPC-C", "LashPro", "BOX", 350, 560],
  ["Kaş Boyası Kahve", "KSB-K", "BrowLab", "UNIT", 220, 390],
  ["Kalıcı Oje Nude", "KOJ-N", "NailPro", "UNIT", 195, 350],
  ["Kalıcı Oje Red", "KOJ-R", "NailPro", "UNIT", 195, 350],
  ["Base Coat", "BASE-01", "NailPro", "UNIT", 170, 310],
  ["Top Coat", "TOP-01", "NailPro", "UNIT", 170, 310],
  ["Maske Fırçası", "MSK-F", "CareLine", "UNIT", 45, 90],
  ["Kil Maskesi", "KIL-01", "Cosmedica", "GRAM", 210, 420],
  ["LED Maske Koruyucu", "LED-K", "CareLine", "BOX", 160, 260],
  ["Dezenfektan 5L", "DEZ-5", "MedSupply", "LITER", 380, 520],
  ["El Antiseptiği", "ANT-01", "MedSupply", "ML", 95, 155],
  ["Tek Kullanımlık Bone", "BONE-01", "MedSupply", "BOX", 120, 195],
  ["Tek Kullanımlık Galoş", "GAL-01", "MedSupply", "BOX", 95, 160],
  ["Kağıt Havlu", "KHV-01", "CleanPro", "BOX", 210, 330],
] as const;

const TRAINING_COURSES = [
  ["VAL-101", "VALOO Hizmet Standardı", "CORPORATE", "BLENDED"],
  ["SAT-201", "Danışmanlık ve Satış Teknikleri", "SALES", "BLENDED"],
  ["CX-201", "Müşteri Deneyimi ve Şikayet Yönetimi", "CUSTOMER_EXPERIENCE", "THEORY"],
  ["LZR-301", "Lazer Epilasyon Uygulama Standardı", "SERVICE", "BLENDED"],
  ["SKN-301", "İleri Cilt Bakım Protokolleri", "SERVICE", "BLENDED"],
  ["QMS-201", "Kalite, Hijyen ve Denetim", "QUALITY", "BLENDED"],
  ["MGT-301", "Şube Yönetimi ve KPI Okuma", "MANAGEMENT", "THEORY"],
  ["HR-101", "İK Politikaları ve Çalışan Deneyimi", "CORPORATE", "THEORY"],
] as const;

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function at(date: Date, hour: number, minute = 0) {
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

async function tableExists(name: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>(
    "SELECT to_regclass($1)::text AS name",
    `public.${name}`,
  );
  return Boolean(rows[0]?.name);
}

async function role(
  tenantId: string,
  companyId: string,
  slug: DemoRoleKey,
  name: string,
  scope: RoleScope,
  resources: "ALL" | string[],
) {
  const created = await prisma.role.upsert({
    where: { tenantId_slug: { tenantId, slug } },
    update: { companyId, name, scope, description: `Enterprise demo rolü: ${name}` },
    create: { tenantId, companyId, slug, name, scope, description: `Enterprise demo rolü: ${name}` },
  });
  const permissions = await prisma.permission.findMany();
  const selected = resources === "ALL"
    ? permissions
    : permissions.filter((permission) => resources.includes(permission.resource));
  for (const permission of selected) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: created.id, permissionId: permission.id } },
      update: {},
      create: { roleId: created.id, permissionId: permission.id },
    });
  }
  return created;
}

async function ensureUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  companyId: string;
  roleId: string;
  branchIds: string[];
}) {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash: DEMO_PASSWORD_HASH,
    },
    create: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash: DEMO_PASSWORD_HASH,
    },
  });
  const membership = await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: input.tenantId } },
    update: { companyId: input.companyId, roleId: input.roleId, status: "ACTIVE" },
    create: {
      userId: user.id,
      tenantId: input.tenantId,
      companyId: input.companyId,
      roleId: input.roleId,
      status: "ACTIVE",
    },
  });
  await prisma.membershipBranchAccess.deleteMany({ where: { membershipId: membership.id } });
  if (input.branchIds.length) {
    await prisma.membershipBranchAccess.createMany({
      data: input.branchIds.map((branchId) => ({ membershipId: membership.id, branchId })),
      skipDuplicates: true,
    });
  }
  return user;
}

async function seedHr(
  tenantId: string,
  staffIds: string[],
) {
  if (!(await tableExists("employee_profiles"))) return;
  const staff = await prisma.staff.findMany({
    where: { tenantId, id: { in: staffIds } },
    orderBy: [{ branchId: "asc" }, { createdAt: "asc" }],
  });
  for (let index = 0; index < staff.length; index += 1) {
    const member = staff[index];
    await prisma.$executeRawUnsafe(
      `INSERT INTO employee_profiles(
         tenant_id,branch_id,staff_id,personnel_number,birth_date,birth_place,gender,
         marital_status,nationality,address,city,district,department,position,
         employment_type,hire_date,iban,bank_name,emergency_name,emergency_relation,
         emergency_phone,annual_leave_entitlement,notes
       ) VALUES(
         $1::text,$2::text,$3::text,$4,$5::timestamp,$6,$7,$8,'TR',$9,$10,$11,$12,$13,
         'FULL_TIME',$14::timestamp,$15,$16,$17,'Yakını',$18,14,$19
       )
       ON CONFLICT(staff_id) DO UPDATE SET
         personnel_number=EXCLUDED.personnel_number,department=EXCLUDED.department,
         position=EXCLUDED.position,updated_at=NOW()`,
      tenantId,
      member.branchId,
      member.id,
      `VAL-${String(index + 1).padStart(4, "0")}`,
      new Date(1990 + (index % 12), index % 12, 3 + (index % 20)),
      "İstanbul",
      index % 4 === 0 ? "Erkek" : "Kadın",
      index % 3 === 0 ? "Evli" : "Bekar",
      `Demo adresi No:${index + 1}`,
      "İstanbul",
      "Merkez",
      index % 8 === 0 ? "Yönetim" : index % 7 === 0 ? "Satış" : "Operasyon",
      String((member.profile as { title?: string } | null)?.title ?? "Estetisyen"),
      new Date(2023 + (index % 3), index % 12, 1 + (index % 20)),
      `TR${String(100000000000000000000000 + index).slice(0, 24)}`,
      index % 2 === 0 ? "Garanti BBVA" : "İş Bankası",
      `Acil Yakın ${index + 1}`,
      `+90530${String(1000000 + index).padStart(7, "0")}`,
      "Enterprise demo çalışan kaydı",
    );
  }

  if (await tableExists("employee_contracts")) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO employee_contracts(
         tenant_id,branch_id,staff_id,start_date,employment_type,salary_type,
         gross_salary,weekly_hours,status,notes
       )
       SELECT s."tenantId",s."branchId",s.id,
              NOW()-INTERVAL '18 months','FULL_TIME','MONTHLY',
              CASE
                WHEN COALESCE(s.profile->>'title','') ILIKE '%Müdür%' THEN 85000
                WHEN COALESCE(s.profile->>'title','') ILIKE '%Koordinatör%' THEN 72000
                ELSE 42000
              END,
              45,'ACTIVE','Enterprise demo aktif iş sözleşmesi'
       FROM staff s
       WHERE s."tenantId"=$1::text
         AND NOT EXISTS(
           SELECT 1 FROM employee_contracts ec
           WHERE ec.staff_id=s.id AND ec.status='ACTIVE'
         )`,
      tenantId,
    );
  }

  if (await tableExists("attendance_records")) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO attendance_records(
         tenant_id,branch_id,staff_id,work_date,check_in,check_out,
         break_minutes,worked_minutes,overtime_minutes,status,note
       )
       SELECT
         s."tenantId",s."branchId",s.id,d::date,
         d::date + TIME '09:00' + ((abs(hashtext(s.id||d::text))%16)||' minutes')::interval,
         d::date + TIME '18:00' + ((abs(hashtext(d::text||s.id))%31)||' minutes')::interval,
         60,480,CASE WHEN abs(hashtext(s.id||d::text))%8=0 THEN 30 ELSE 0 END,
         CASE WHEN abs(hashtext(s.id||d::text))%22=0 THEN 'LATE' ELSE 'PRESENT' END,
         'Enterprise demo puantajı'
       FROM staff s
       CROSS JOIN generate_series(CURRENT_DATE-INTERVAL '45 days',CURRENT_DATE,INTERVAL '1 day') d
       WHERE s."tenantId"=$1::text
         AND EXTRACT(ISODOW FROM d) < 7
       ON CONFLICT(staff_id,work_date) DO NOTHING`,
      tenantId,
    );
  }

  if (await tableExists("leave_requests")) {
    for (let index = 0; index < Math.min(24, staff.length); index += 1) {
      const member = staff[index];
      await prisma.$executeRawUnsafe(
        `INSERT INTO leave_requests(
           id,tenant_id,branch_id,staff_id,type,start_date,end_date,days,status,reason
         ) VALUES($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9,$10)
         ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason,updated_at=NOW()`,
        `enterprise-demo-leave-${String(index + 1).padStart(2, "0")}`,
        tenantId,
        member.branchId,
        member.id,
        index % 4 === 0 ? "ANNUAL" : index % 4 === 1 ? "SICK" : "EXCUSE",
        ymd(addDays(new Date(), (index % 18) - 9)),
        ymd(addDays(new Date(), (index % 18) - 8)),
        2,
        index % 5 === 0 ? "PENDING" : "APPROVED",
        "Enterprise demo izin talebi",
      );
    }
  }

  if (await tableExists("payroll_periods")) {
    for (let offset = 0; offset < 6; offset += 1) {
      const date = new Date();
      date.setMonth(date.getMonth() - offset);
      const periods = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO payroll_periods(tenant_id,year,month,status)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(tenant_id,year,month)
         DO UPDATE SET status=EXCLUDED.status,updated_at=NOW()
         RETURNING id`,
        tenantId,
        date.getFullYear(),
        date.getMonth() + 1,
        offset === 0 ? "DRAFT" : "CLOSED",
      );
      const periodId = periods[0]?.id;
      if (!periodId || !(await tableExists("payroll_items"))) continue;
      await prisma.$executeRawUnsafe(
        `INSERT INTO payroll_items(
           tenant_id,branch_id,period_id,staff_id,gross_amount,net_amount,
           deductions,employer_cost,status,note
         )
         SELECT s."tenantId",s."branchId",$2::text,s.id,
                CASE WHEN COALESCE(s.profile->>'title','') ILIKE '%Müdür%' THEN 85000 ELSE 42000 END,
                CASE WHEN COALESCE(s.profile->>'title','') ILIKE '%Müdür%' THEN 66500 ELSE 33500 END,
                CASE WHEN COALESCE(s.profile->>'title','') ILIKE '%Müdür%' THEN 18500 ELSE 8500 END,
                CASE WHEN COALESCE(s.profile->>'title','') ILIKE '%Müdür%' THEN 102000 ELSE 51500 END,
                $3,'Enterprise demo bordrosu'
         FROM staff s
         WHERE s."tenantId"=$1::text
         ON CONFLICT(period_id,staff_id)
         DO UPDATE SET gross_amount=EXCLUDED.gross_amount,net_amount=EXCLUDED.net_amount,
                       deductions=EXCLUDED.deductions,employer_cost=EXCLUDED.employer_cost,
                       status=EXCLUDED.status,updated_at=NOW()`,
        tenantId,
        periodId,
        offset === 0 ? "DRAFT" : "APPROVED",
      );
    }
  }
}

async function seedInventory(
  tenantId: string,
  companyId: string,
  branches: Array<{ id: string; code: string; name: string }>,
) {
  if (!(await tableExists("inventory_suppliers"))) return;

  const supplierIds: string[] = [];
  for (let index = 0; index < 20; index += 1) {
    const id = `enterprise-demo-supplier-${String(index + 1).padStart(2, "0")}`;
    supplierIds.push(id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO inventory_suppliers(
         id,tenant_id,company_id,name,contact_name,phone,email,tax_number,address,notes,status
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE')
       ON CONFLICT(id) DO UPDATE SET
         name=EXCLUDED.name,contact_name=EXCLUDED.contact_name,phone=EXCLUDED.phone,
         email=EXCLUDED.email,tax_number=EXCLUDED.tax_number,address=EXCLUDED.address,
         notes=EXCLUDED.notes,status='ACTIVE',updated_at=NOW()`,
      id,
      tenantId,
      companyId,
      `VALOO Tedarikçi ${String(index + 1).padStart(2, "0")}`,
      `Yetkili ${index + 1}`,
      `+90212${String(5550000 + index).padStart(7, "0")}`,
      `tedarikci${index + 1}@${DEMO_DOMAIN}`,
      `99999${String(10000 + index)}`,
      `İstanbul Demo Ticaret Merkezi No:${index + 1}`,
      index % 3 === 0 ? "Ana sarf malzeme tedarikçisi" : "Onaylı demo tedarikçisi",
    );
  }

  if (await tableExists("supplier_organizations")) {
    for (let index = 0; index < supplierIds.length; index += 1) {
      const orgId = `enterprise-demo-supplier-org-${String(index + 1).padStart(2, "0")}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO supplier_organizations(
           id,slug,legal_name,display_name,organization_type,status,verification_status,
           website,email,phone,tax_country,tax_number
         ) VALUES($1,$2,$3,$4,$5,'ACTIVE','VERIFIED',$6,$7,$8,'TR',$9)
         ON CONFLICT(id) DO UPDATE SET
           display_name=EXCLUDED.display_name,status='ACTIVE',verification_status='VERIFIED',updated_at=NOW()`,
        orgId,
        `valoo-demo-supplier-${index + 1}`,
        `VALOO Demo Tedarik ${index + 1} A.Ş.`,
        `VALOO Tedarikçi ${index + 1}`,
        index % 2 === 0 ? "DISTRIBUTOR" : "MANUFACTURER",
        `https://supplier-${index + 1}.example.com`,
        `tedarikci${index + 1}@${DEMO_DOMAIN}`,
        `+90212${String(5550000 + index).padStart(7, "0")}`,
        `99999${String(10000 + index)}`,
      );
      if (await tableExists("supplier_connections")) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO supplier_connections(
             id,supplier_organization_id,tenant_id,company_id,inventory_supplier_id,status
           ) VALUES($1,$2,$3,$4,$5,'ACTIVE')
           ON CONFLICT(inventory_supplier_id) DO UPDATE SET
             supplier_organization_id=EXCLUDED.supplier_organization_id,status='ACTIVE',updated_at=NOW()`,
          `enterprise-demo-supplier-connection-${index + 1}`,
          orgId,
          tenantId,
          companyId,
          supplierIds[index],
        );
      }
    }
  }

  if (!(await tableExists("inventory_warehouses"))) return;
  await prisma.$executeRawUnsafe(
    `INSERT INTO inventory_warehouses(tenant_id,company_id,name,type,status)
     VALUES($1,$2,'VALOO Ana Depo','MAIN_DEPOT','ACTIVE')
     ON CONFLICT DO NOTHING`,
    tenantId,
    companyId,
  );
  for (const branch of branches) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO inventory_warehouses(tenant_id,company_id,branch_id,name,type,status)
       VALUES($1,$2,$3,$4,'BRANCH','ACTIVE')
       ON CONFLICT DO NOTHING`,
      tenantId,
      companyId,
      branch.id,
      `${branch.name} Stok`,
    );
  }

  if (!(await tableExists("inventory_categories"))) return;
  const categories = [
    ["SERUM", "Serum ve Solüsyon"],
    ["SARF", "Sarf Malzemeleri"],
    ["LAZER", "Lazer Sarf Malzemeleri"],
    ["NAIL", "Nail Ürünleri"],
    ["LASH", "Kaş & Kirpik"],
    ["HIJYEN", "Hijyen ve Temizlik"],
  ];
  const categoryIds: string[] = [];
  for (let index = 0; index < categories.length; index += 1) {
    const id = `enterprise-demo-inventory-category-${index + 1}`;
    categoryIds.push(id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO inventory_categories(id,tenant_id,company_id,name)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(company_id,name) DO UPDATE SET updated_at=NOW()`,
      id,
      tenantId,
      companyId,
      categories[index][1],
    );
  }

  if (!(await tableExists("inventory_products"))) return;
  const productIds: string[] = [];
  for (let index = 0; index < INVENTORY_PRODUCTS.length; index += 1) {
    const [name, sku, brand, unit, purchasePrice, salePrice] = INVENTORY_PRODUCTS[index];
    const id = `enterprise-demo-product-${String(index + 1).padStart(2, "0")}`;
    productIds.push(id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO inventory_products(
         id,tenant_id,company_id,category_id,name,sku,brand,description,unit,status,
         track_stock,track_expiry,purchase_price,sale_price,currency,tax_rate,
         minimum_order_quantity,order_multiple,lead_time_days,preparation_days,shipping_days,returnable,notes
       ) VALUES(
         $1,$2,$3,$4,$5,$6,$7,$8,$9::"InventoryUnit",'ACTIVE',
         TRUE,$10,$11,$12,'TRY',20,1,1,$13,1,2,TRUE,$14
       )
       ON CONFLICT(id) DO UPDATE SET
         name=EXCLUDED.name,sku=EXCLUDED.sku,brand=EXCLUDED.brand,
         purchase_price=EXCLUDED.purchase_price,sale_price=EXCLUDED.sale_price,
         status='ACTIVE',updated_at=NOW()`,
      id,
      tenantId,
      companyId,
      categoryIds[index % categoryIds.length],
      name,
      sku,
      brand,
      "Enterprise demo stok ürünü",
      unit,
      index % 7 === 0,
      purchasePrice,
      salePrice,
      2 + (index % 7),
      "Sunum amaçlı örnek stok",
    );
  }

  if (await tableExists("inventory_stock")) {
    const warehouses = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM inventory_warehouses WHERE company_id=$1 AND status='ACTIVE'`,
      companyId,
    );
    for (let warehouseIndex = 0; warehouseIndex < warehouses.length; warehouseIndex += 1) {
      for (let productIndex = 0; productIndex < productIds.length; productIndex += 1) {
        const quantity = 8 + ((warehouseIndex * 13 + productIndex * 7) % 85);
        await prisma.$executeRawUnsafe(
          `INSERT INTO inventory_stock(
             product_id,warehouse_id,quantity,minimum_quantity,target_quantity,cost_per_unit
           ) VALUES($1,$2,$3,$4,$5,$6)
           ON CONFLICT(product_id,warehouse_id) DO UPDATE SET
             quantity=EXCLUDED.quantity,minimum_quantity=EXCLUDED.minimum_quantity,
             target_quantity=EXCLUDED.target_quantity,cost_per_unit=EXCLUDED.cost_per_unit,
             updated_at=NOW()`,
          productIds[productIndex],
          warehouses[warehouseIndex].id,
          quantity,
          12,
          60,
          INVENTORY_PRODUCTS[productIndex][4],
        );
      }
    }
  }

  if (await tableExists("inventory_purchase_orders")) {
    const warehouses = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM inventory_warehouses WHERE company_id=$1 ORDER BY type,name LIMIT 8`,
      companyId,
    );
    for (let index = 0; index < 12; index += 1) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO inventory_purchase_orders(
           id,tenant_id,company_id,supplier_id,warehouse_id,status,total_amount,note,ordered_at,received_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,total_amount=EXCLUDED.total_amount,updated_at=NOW()`,
        `enterprise-demo-po-${String(index + 1).padStart(2, "0")}`,
        tenantId,
        companyId,
        supplierIds[index % supplierIds.length],
        warehouses[index % warehouses.length]?.id,
        index < 4 ? "RECEIVED" : index < 8 ? "ORDERED" : "PENDING",
        18500 + index * 2350,
        "Enterprise demo satın alma siparişi",
        addDays(new Date(), -20 + index),
        index < 4 ? addDays(new Date(), -12 + index) : null,
      );
    }
  }
}

async function seedTraining(
  tenantId: string,
  companyId: string,
  ownerUserId: string,
  staff: Array<{ id: string; branchId: string }>,
) {
  if (!(await tableExists("training_courses"))) return;
  const courseIds: string[] = [];
  for (let index = 0; index < TRAINING_COURSES.length; index += 1) {
    const [code, title, category, deliveryType] = TRAINING_COURSES[index];
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO training_courses(
         tenant_id,company_id,code,title,description,category,delivery_type,created_by_user_id,is_active
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
       ON CONFLICT(tenant_id,company_id,code)
       DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,
                     category=EXCLUDED.category,delivery_type=EXCLUDED.delivery_type,
                     is_active=TRUE,updated_at=NOW()
       RETURNING id`,
      tenantId,
      companyId,
      code,
      title,
      "Enterprise demo eğitim kataloğu",
      category,
      deliveryType,
      ownerUserId,
    );
    const courseId = rows[0]?.id;
    if (!courseId) continue;
    courseIds.push(courseId);

    if (!(await tableExists("training_course_versions"))) continue;
    const versions = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO training_course_versions(
         tenant_id,company_id,course_id,version,status,title,description,delivery_type,
         theory_pass_score,practical_pass_score,requires_theory,requires_practical,
         effective_from,created_by_user_id,published_by_user_id,published_at
       ) VALUES($1,$2,$3,1,'PUBLISHED',$4,$5,$6,70,75,TRUE,$7,CURRENT_DATE,$8,$8,NOW())
       ON CONFLICT(tenant_id,company_id,course_id,version)
       DO UPDATE SET status='PUBLISHED',title=EXCLUDED.title,description=EXCLUDED.description,
                     delivery_type=EXCLUDED.delivery_type,published_at=NOW(),updated_at=NOW()
       RETURNING id`,
      tenantId,
      companyId,
      courseId,
      title,
      "Sunum için yayınlanmış eğitim versiyonu",
      deliveryType,
      deliveryType !== "THEORY",
      ownerUserId,
    );
    const versionId = versions[0]?.id;
    if (!versionId) continue;

    if (await tableExists("training_lessons")) {
      const lessonTitles = ["Teori ve standartlar", "Uygulama akışı", "Kontrol listesi"];
      for (let lesson = 0; lesson < lessonTitles.length; lesson += 1) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO training_lessons(
             tenant_id,company_id,course_version_id,sequence,title,content_type,
             content_text,duration_minutes,is_required,created_by_user_id
           ) VALUES($1,$2,$3,$4,$5,'TEXT',$6,$7,TRUE,$8)
           ON CONFLICT(course_version_id,sequence)
           DO UPDATE SET title=EXCLUDED.title,content_text=EXCLUDED.content_text,
                         duration_minutes=EXCLUDED.duration_minutes,updated_at=NOW()`,
          tenantId,
          companyId,
          versionId,
          lesson + 1,
          lessonTitles[lesson],
          `${title} için sunum amaçlı detaylı eğitim içeriği.`,
          20 + lesson * 10,
          ownerUserId,
        );
      }
    }

    if (await tableExists("training_exams")) {
      const examId = `enterprise-demo-exam-${String(index + 1).padStart(2, "0")}`;
      const exams = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO training_exams(
           id,tenant_id,company_id,course_version_id,title,pass_score,max_attempts,is_active,created_by_user_id
         ) VALUES($1,$2,$3,$4,$5,70,3,TRUE,$6)
         ON CONFLICT(id) DO UPDATE SET
           course_version_id=EXCLUDED.course_version_id,title=EXCLUDED.title,
           pass_score=EXCLUDED.pass_score,max_attempts=EXCLUDED.max_attempts,
           is_active=TRUE,updated_at=NOW()
         RETURNING id`,
        examId,
        tenantId,
        companyId,
        versionId,
        `${title} Değerlendirme Sınavı`,
        ownerUserId,
      );
      const activeExamId = exams[0]?.id;
      if (activeExamId && (await tableExists("training_exam_questions"))) {
        for (let q = 1; q <= 5; q += 1) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO training_exam_questions(
               tenant_id,company_id,exam_id,sequence,question_type,prompt,options,
               correct_answer,points,created_by_user_id
             ) VALUES($1,$2,$3,$4,'SINGLE_CHOICE',$5,$6::jsonb,$7::jsonb,20,$8)
             ON CONFLICT(exam_id,sequence)
             DO UPDATE SET prompt=EXCLUDED.prompt,options=EXCLUDED.options,
                           correct_answer=EXCLUDED.correct_answer`,
            tenantId,
            companyId,
            activeExamId,
            q,
            `${title}: ${q}. örnek sınav sorusu`,
            JSON.stringify(["A seçeneği", "B seçeneği", "C seçeneği", "D seçeneği"]),
            JSON.stringify("A seçeneği"),
            ownerUserId,
          );
        }
      }
    }
  }

  if (!(await tableExists("training_assignments")) || !courseIds.length) return;
  const assignable = staff.slice(0, Math.min(72, staff.length));
  for (let index = 0; index < assignable.length; index += 1) {
    const member = assignable[index];
    const courseId = courseIds[index % courseIds.length];
    const versions = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM training_course_versions
       WHERE tenant_id=$1 AND company_id=$2 AND course_id=$3 AND status='PUBLISHED'
       LIMIT 1`,
      tenantId,
      companyId,
      courseId,
    );
    const status = index % 5 === 0 ? "COMPLETED" : index % 3 === 0 ? "IN_PROGRESS" : "ASSIGNED";
    await prisma.$executeRawUnsafe(
      `INSERT INTO training_assignments(
         id,tenant_id,company_id,branch_id,course_id,course_version_id,staff_id,
         source_type,source_key,rationale,status,due_at,started_at,completed_at,
         assigned_by_user_id,updated_by_user_id
       ) VALUES($1,$2,$3,$4,$5,$6,$7,'MANUAL',$8,$9::jsonb,$10,$11,$12,$13,$14,$14)
       ON CONFLICT(id) DO UPDATE SET
         status=EXCLUDED.status,due_at=EXCLUDED.due_at,started_at=EXCLUDED.started_at,
         completed_at=EXCLUDED.completed_at,updated_by_user_id=EXCLUDED.updated_by_user_id,
         updated_at=NOW()`,
      `enterprise-demo-training-assignment-${String(index + 1).padStart(3, "0")}`,
      tenantId,
      companyId,
      member.branchId,
      courseId,
      versions[0]?.id ?? null,
      member.id,
      `enterprise-demo-${index + 1}`,
      JSON.stringify({ note: "Enterprise demo eğitim ataması" }),
      status,
      addDays(new Date(), 10 + (index % 30)),
      status === "ASSIGNED" ? null : addDays(new Date(), -(index % 10)),
      status === "COMPLETED" ? addDays(new Date(), -(index % 5)) : null,
      ownerUserId,
    );
  }
}


async function seedCommerceAndFinance(
  tenantId: string,
  companyId: string,
  branches: Array<{ id: string; code: string; name: string }>,
  customersByBranch: Map<string, Array<{ id: string }>>,
  servicesByBranch: Map<string, Array<{ id: string; durationMinutes: number; price: { toString(): string } }>>,
) {
  for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
    const branch = branches[branchIndex];
    const services = servicesByBranch.get(branch.id) ?? [];
    const customers = customersByBranch.get(branch.id) ?? [];
    if (!services.length || !customers.length) continue;

    const packageNames = [
      ["Premium Cilt Bakım Paketi", 4, 7200],
      ["Lazer Avantaj Paketi", 8, 11900],
      ["Yıllık Beauty Club", 12, 18900],
    ] as const;
    const packageIds: string[] = [];

    for (let packageIndex = 0; packageIndex < packageNames.length; packageIndex += 1) {
      const [name, quantity, price] = packageNames[packageIndex];
      const existing = await prisma.servicePackage.findFirst({
        where: { tenantId, branchId: branch.id, name },
      });
      const packageRecord = existing
        ? await prisma.servicePackage.update({
            where: { id: existing.id },
            data: {
              description: "Enterprise demo satış paketi",
              price,
              validityDays: 365,
              active: true,
            },
          })
        : await prisma.servicePackage.create({
            data: {
              tenantId,
              branchId: branch.id,
              name,
              description: "Enterprise demo satış paketi",
              price,
              validityDays: 365,
              active: true,
            },
          });
      packageIds.push(packageRecord.id);
      const service = services[(packageIndex * 3) % services.length];
      await prisma.packageItem.upsert({
        where: { packageId_serviceId: { packageId: packageRecord.id, serviceId: service.id } },
        update: { quantity },
        create: { packageId: packageRecord.id, serviceId: service.id, quantity },
      });
    }

    const existingSales = await prisma.sale.findMany({
      where: {
        tenantId,
        branchId: branch.id,
        customerId: { in: customers.slice(0, 10).map((item) => item.id) },
      },
      select: { id: true, customerId: true },
    });
    const existingByCustomer = new Map(existingSales.map((sale) => [sale.customerId, sale.id]));

    for (let saleIndex = 0; saleIndex < Math.min(10, customers.length); saleIndex += 1) {
      const customer = customers[saleIndex];
      const packageId = packageIds[saleIndex % packageIds.length];
      const packageRecord = await prisma.servicePackage.findUniqueOrThrow({ where: { id: packageId } });
      let saleId = existingByCustomer.get(customer.id);
      if (!saleId) {
        const sale = await prisma.sale.create({
          data: {
            tenantId,
            branchId: branch.id,
            customerId: customer.id,
            status: "CONFIRMED",
            subtotal: packageRecord.price,
            discountTotal: saleIndex % 4 === 0 ? 500 : 0,
            total: Number(packageRecord.price) - (saleIndex % 4 === 0 ? 500 : 0),
            confirmedAt: addDays(new Date(), -(saleIndex + branchIndex * 2 + 5)),
          },
        });
        saleId = sale.id;
        await prisma.saleItem.create({
          data: {
            saleId,
            type: "PACKAGE",
            packageId,
            description: packageRecord.name,
            quantity: 1,
            unitPrice: packageRecord.price,
            lineTotal: packageRecord.price,
          },
        });
      }

      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      const paymentExists = await prisma.salePayment.findFirst({ where: { tenantId, saleId } });
      if (!paymentExists) {
        await prisma.salePayment.create({
          data: {
            tenantId,
            branchId: branch.id,
            saleId,
            amount: sale.total,
            method: [PaymentMethod.CARD, PaymentMethod.CASH, PaymentMethod.TRANSFER][saleIndex % 3],
            status: "COMPLETED",
            paidAt: sale.confirmedAt ?? new Date(),
            reference: `DEMO-${branch.code}-${saleIndex + 1}`,
            note: "Enterprise demo paket tahsilatı",
          },
        });
      }

      let customerPackage = await prisma.customerPackage.findFirst({
        where: { tenantId, branchId: branch.id, customerId: customer.id, saleId },
      });
      if (!customerPackage) {
        customerPackage = await prisma.customerPackage.create({
          data: {
            tenantId,
            branchId: branch.id,
            customerId: customer.id,
            packageId,
            saleId,
            status: "ACTIVE",
            purchasedAt: sale.confirmedAt ?? new Date(),
            expiresAt: addDays(sale.confirmedAt ?? new Date(), 365),
          },
        });
      }
      const packageItems = await prisma.packageItem.findMany({ where: { packageId } });
      for (const item of packageItems) {
        const existingSessions = await prisma.session.count({
          where: { tenantId, customerPackageId: customerPackage.id, serviceId: item.serviceId },
        });
        for (let sequence = existingSessions; sequence < item.quantity; sequence += 1) {
          await prisma.session.create({
            data: {
              tenantId,
              branchId: branch.id,
              customerPackageId: customerPackage.id,
              serviceId: item.serviceId,
              status: sequence < Math.min(2, item.quantity) ? "CONSUMED" : "AVAILABLE",
              consumedAt: sequence < Math.min(2, item.quantity)
                ? addDays(new Date(), -(20 + sequence * 12 + saleIndex))
                : null,
            },
          });
        }
      }
    }
  }

  const accounts = [
    ["100", "Kasa", "ASSET"],
    ["102", "Bankalar", "ASSET"],
    ["120", "Alıcılar", "ASSET"],
    ["320", "Satıcılar", "LIABILITY"],
    ["500", "Sermaye", "EQUITY"],
    ["600", "Hizmet Satış Gelirleri", "REVENUE"],
    ["601", "Paket Satış Gelirleri", "REVENUE"],
    ["740", "Personel Giderleri", "EXPENSE"],
    ["760", "Pazarlama Giderleri", "EXPENSE"],
    ["770", "Genel Yönetim Giderleri", "EXPENSE"],
  ] as const;

  const accountIds = new Map<string, string>();
  for (const [code, name, type] of accounts) {
    const account = await prisma.chartOfAccount.upsert({
      where: { companyId_code: { companyId, code } },
      update: { name, type, active: true },
      create: { tenantId, companyId, code, name, type, active: true },
    });
    accountIds.set(code, account.id);
  }

  for (let monthOffset = 0; monthOffset < 8; monthOffset += 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - monthOffset);
    date.setDate(5);
    const number = `DEMO-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const revenue = 780000 + monthOffset * 42500;
    const personnel = 360000 + monthOffset * 12000;
    const marketing = 55000 + monthOffset * 3500;
    const existing = await prisma.journalEntry.findFirst({ where: { companyId, number } });
    const entry = existing ?? await prisma.journalEntry.create({
      data: {
        tenantId,
        companyId,
        branchId: branches[monthOffset % branches.length].id,
        number,
        status: "POSTED",
        entryDate: date,
        description: "Enterprise demo aylık finansal hareket özeti",
        referenceType: "DEMO_MONTHLY_CLOSE",
        referenceId: number,
        postedAt: date,
      },
    });
    if (!existing) {
      await prisma.journalEntryLine.createMany({
        data: [
          { journalEntryId: entry.id, accountId: accountIds.get("102")!, debit: revenue, credit: 0, memo: "Aylık tahsilatlar" },
          { journalEntryId: entry.id, accountId: accountIds.get("600")!, debit: 0, credit: revenue, memo: "Hizmet gelirleri" },
          { journalEntryId: entry.id, accountId: accountIds.get("740")!, debit: personnel, credit: 0, memo: "Personel giderleri" },
          { journalEntryId: entry.id, accountId: accountIds.get("102")!, debit: 0, credit: personnel, memo: "Personel ödemeleri" },
          { journalEntryId: entry.id, accountId: accountIds.get("760")!, debit: marketing, credit: 0, memo: "Pazarlama giderleri" },
          { journalEntryId: entry.id, accountId: accountIds.get("102")!, debit: 0, credit: marketing, memo: "Pazarlama ödemeleri" },
        ],
      });
    }
  }
}

async function seedCrm(
  tenantId: string,
  companyId: string,
  branches: Array<{ id: string }>,
  ownerUserId: string,
) {
  if (!(await tableExists("crm_leads"))) return;
  const statuses = ["NEW", "CONTACTED", "QUALIFIED", "QUALIFIED", "LOST"];
  for (let index = 0; index < 120; index += 1) {
    const branch = branches[index % branches.length];
    const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(index * 3) % LAST_NAMES.length];
    const status = statuses[index % statuses.length];
    await prisma.$executeRawUnsafe(
      `INSERT INTO crm_leads(
         id,tenant_id,company_id,branch_id,owner_user_id,first_name,last_name,
         phone,email,source,status,interest_note,lost_reason,created_by_user_id,
         version,created_at,updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$5,1,$14,$14)
       ON CONFLICT(id) DO UPDATE SET
         branch_id=EXCLUDED.branch_id,status=EXCLUDED.status,interest_note=EXCLUDED.interest_note,
         updated_at=NOW()`,
      `enterprise-demo-lead-${String(index + 1).padStart(3, "0")}`,
      tenantId,
      companyId,
      branch.id,
      ownerUserId,
      firstName,
      lastName,
      `+90555${String(2000000 + index).padStart(7, "0")}`,
      `lead${index + 1}@${DEMO_DOMAIN}`,
      index % 4 === 0 ? "INSTAGRAM" : index % 4 === 1 ? "GOOGLE" : index % 4 === 2 ? "REFERRAL" : "WALK_IN",
      status,
      index % 2 === 0 ? "Lazer epilasyon ve cilt bakım paketi ile ilgileniyor." : "Yıllık bakım üyeliği hakkında bilgi istedi.",
      status === "LOST" ? "Takip sonrası şu an için erteledi." : null,
      addDays(new Date(), -(index % 75)),
    );
  }
}


async function seedQualityAndCommunications(
  tenantId: string,
  companyId: string,
  ownerUserId: string,
  branches: Array<{ id: string; code: string; name: string }>,
) {
  if (await tableExists("corporate_marketing_vendors")) {
    const vendorTypes = [
      "SOCIAL_MEDIA_AGENCY","AD_AGENCY","PRODUCTION","PHOTOGRAPHER",
      "INFLUENCER_AGENCY","FREELANCER","PR_AGENCY","OTHER",
    ];
    for (let index = 0; index < 8; index += 1) {
      const name = `VALOO Pazarlama Partneri ${index + 1}`;
      const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM corporate_marketing_vendors
         WHERE tenant_id=$1 AND company_id=$2 AND name=$3 LIMIT 1`,
        tenantId,
        companyId,
        name,
      );
      const id = existing[0]?.id ?? randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO corporate_marketing_vendors(
           id,tenant_id,company_id,branch_id,name,vendor_type,status,
           contact_name,contact_email,contact_phone,contract_starts_at,contract_ends_at,
           service_scope,monthly_fee,currency,payment_model,kpi_commitments,
           performance_notes,attributed_revenue,metadata,created_by_user_id
         ) VALUES(
           $1,$2,$3,$4,$5,$6,'ACTIVE',$7,$8,$9,
           CURRENT_DATE-INTERVAL '6 months',CURRENT_DATE+INTERVAL '12 months',
           $10,$11,'TRY',$12,$13::jsonb,$14,$15,$16::jsonb,$17
         )
         ON CONFLICT(id) DO UPDATE SET
           status='ACTIVE',monthly_fee=EXCLUDED.monthly_fee,
           attributed_revenue=EXCLUDED.attributed_revenue,
           performance_notes=EXCLUDED.performance_notes,updated_at=NOW()`,
        id,
        tenantId,
        companyId,
        index < 4 ? branches[index % branches.length].id : null,
        name,
        vendorTypes[index % vendorTypes.length],
        `Partner Yetkilisi ${index + 1}`,
        `marketing${index + 1}@${DEMO_DOMAIN}`,
        `+90212${String(5560000 + index).padStart(7, "0")}`,
        index % 2 === 0 ? "Sosyal medya, reklam ve içerik üretimi" : "Prodüksiyon ve marka iletişimi",
        45000 + index * 7500,
        index % 3 === 0 ? "PERFORMANCE" : "MONTHLY_RETAINER",
        JSON.stringify({ leadTarget: 250 + index * 25, roasTarget: 4 + index * 0.2 }),
        index % 2 === 0 ? "Hedeflerin üzerinde performans." : "Aylık optimizasyon toplantısı planlandı.",
        210000 + index * 65000,
        JSON.stringify({ enterpriseDemo: true }),
        ownerUserId,
      );
    }
  }

  if ((await tableExists("customer_feedback")) && (await tableExists("quality_cases"))) {
    const appointments = await prisma.$queryRawUnsafe<Array<{
      id: string;
      branchId: string;
      customerId: string;
      serviceId: string;
      staffId: string;
    }>>(
      `SELECT
         a.id,
         a."branchId" AS "branchId",
         a."customerId" AS "customerId",
         a."serviceId" AS "serviceId",
         a."staffId" AS "staffId"
       FROM appointments a
       WHERE a."tenantId"=$1
         AND a.status='COMPLETED'
         AND a.notes LIKE $2
       ORDER BY a."startAt" DESC
       LIMIT 30`,
      tenantId,
      `${APPOINTMENT_PREFIX}%`,
    );

    for (let index = 0; index < Math.min(24, appointments.length); index += 1) {
      const appointment = appointments[index];
      const classification = index % 7 === 0 ? "NEGATIVE" : index % 5 === 0 ? "NEUTRAL" : "POSITIVE";
      const rating = classification === "NEGATIVE" ? 2 : classification === "NEUTRAL" ? 3 : 5;
      const feedbackRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM customer_feedback
         WHERE tenant_id=$1 AND company_id=$2 AND appointment_id=$3 LIMIT 1`,
        tenantId,
        companyId,
        appointment.id,
      );
      const feedbackId = feedbackRows[0]?.id ?? randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO customer_feedback(
           id,tenant_id,company_id,branch_id,customer_id,appointment_id,
           service_id,staff_id,source,classification,overall_rating,comment,
           submitted_at,created_by_user_id
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'POST_SERVICE',$9,$10,$11,$12,$13)
         ON CONFLICT(id) DO UPDATE SET
           classification=EXCLUDED.classification,overall_rating=EXCLUDED.overall_rating,
           comment=EXCLUDED.comment,updated_at=NOW()`,
        feedbackId,
        tenantId,
        companyId,
        appointment.branchId,
        appointment.customerId,
        appointment.id,
        appointment.serviceId,
        appointment.staffId,
        classification,
        rating,
        classification === "POSITIVE"
          ? "Hizmet ve ekip yaklaşımından çok memnun kaldım."
          : classification === "NEUTRAL"
            ? "Hizmet iyiydi, bekleme süresi biraz azaltılabilir."
            : "Randevu başlangıç süresi ve bilgilendirme geliştirilmelidir.",
        addDays(new Date(), -(index % 20)),
        ownerUserId,
      );

      if (classification !== "POSITIVE") {
        const caseRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM quality_cases
           WHERE tenant_id=$1 AND company_id=$2 AND feedback_id=$3 LIMIT 1`,
          tenantId,
          companyId,
          feedbackId,
        );
        const caseId = caseRows[0]?.id ?? randomUUID();
        const status = index % 4 === 0 ? "RESOLVED" : index % 3 === 0 ? "INVESTIGATING" : "OPEN";
        await prisma.$executeRawUnsafe(
          `INSERT INTO quality_cases(
             id,tenant_id,company_id,branch_id,feedback_id,customer_id,appointment_id,
             service_id,staff_id,source_type,category,severity,status,title,description,
             assigned_user_id,sla_due_at,root_cause,corrective_action,preventive_action,
             resolution,customer_follow_up,opened_at,resolved_at,created_by_user_id,updated_by_user_id
           ) VALUES(
             $1,$2,$3,$4,$5,$6,$7,$8,$9,'FEEDBACK',$10,$11,$12,$13,$14,
             $15,NOW()+INTERVAL '48 hours',$16,$17,$18,$19,$20,$21,$22,$15,$15
           )
           ON CONFLICT(id) DO UPDATE SET
             severity=EXCLUDED.severity,status=EXCLUDED.status,title=EXCLUDED.title,
             corrective_action=EXCLUDED.corrective_action,resolution=EXCLUDED.resolution,
             updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=NOW()`,
          caseId,
          tenantId,
          companyId,
          appointment.branchId,
          feedbackId,
          appointment.customerId,
          appointment.id,
          appointment.serviceId,
          appointment.staffId,
          index % 2 === 0 ? "WAIT_TIME" : "SERVICE_STANDARD",
          index % 6 === 0 ? "HIGH" : "MEDIUM",
          status,
          `Demo kalite vakası #${index + 1}`,
          "Sunum amacıyla oluşturulmuş müşteri deneyimi kalite vakası.",
          ownerUserId,
          "Yoğun saatlerde süreç standardının sapması.",
          "Şube ekibine operasyon standardı hatırlatıldı.",
          "Vardiya planı ve randevu aralıkları yeniden gözden geçirildi.",
          status === "RESOLVED" ? "Müşteri ile görüşüldü ve konu çözüldü." : null,
          status === "RESOLVED" ? "Müşteri memnuniyet teyidi alındı." : "Takip planlandı.",
          addDays(new Date(), -(index % 18)),
          status === "RESOLVED" ? addDays(new Date(), -(index % 5)) : null,
        );
      }
    }
  }

  if (await tableExists("team_conversations")) {
    const users = await prisma.$queryRawUnsafe<Array<{ userId: string }>>(
      `SELECT m."userId" AS "userId"
       FROM memberships m
       WHERE m."tenantId"=$1
         AND m."companyId"=$2
         AND m.status='ACTIVE'
       ORDER BY m."createdAt" ASC`,
      tenantId,
      companyId,
    );
    const userIds = users.map((row) => row.userId);
    const channels = [
      ["Genel Duyurular", true],
      ["Operasyon", false],
      ["İK & Eğitim", false],
      ["Satış Başarıları", false],
    ] as const;

    for (let index = 0; index < channels.length; index += 1) {
      const [name, announcementOnly] = channels[index];
      const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM team_conversations
         WHERE tenant_id=$1 AND company_id=$2 AND type='CHANNEL' AND name=$3 LIMIT 1`,
        tenantId,
        companyId,
        name,
      );
      const conversationId = existing[0]?.id ?? randomUUID();
      if (!existing.length) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO team_conversations(
             id,tenant_id,company_id,type,name,created_by_user_id,announcement_only
           ) VALUES($1,$2,$3,'CHANNEL',$4,$5,$6)`,
          conversationId,
          tenantId,
          companyId,
          name,
          ownerUserId,
          announcementOnly,
        );
      }
      for (let userIndex = 0; userIndex < userIds.length; userIndex += 1) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO team_conversation_members(conversation_id,user_id,is_admin,last_read_at)
           VALUES($1,$2,$3,NOW())
           ON CONFLICT(conversation_id,user_id)
           DO UPDATE SET is_admin=EXCLUDED.is_admin`,
          conversationId,
          userIds[userIndex],
          userIds[userIndex] === ownerUserId || userIndex < 6,
        );
      }
      const messageCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT COUNT(*)::int AS count FROM team_messages WHERE conversation_id=$1`,
        conversationId,
      );
      if (Number(messageCount[0]?.count ?? 0) === 0) {
        const bodies = index === 0
          ? [
              "Hoş geldiniz. Bu kanal şirket genelindeki önemli duyurular için kullanılmaktadır.",
              "Ekim ayı operasyon ve eğitim takvimi yayınlandı.",
              "Aylık yönetim toplantısı cuma günü saat 10:00'da gerçekleştirilecektir.",
              "Müşteri deneyimi standartlarında yeni kontrol listesi devreye alınmıştır.",
            ]
          : index === 1
            ? [
                "Bugünkü şube doluluk oranları dashboard üzerinden takip edilebilir.",
                "Stok kritik seviyedeki ürünler için satın alma talepleri oluşturuldu.",
                "Hafta sonu yoğunluğu için vardiya planlarını kontrol edelim.",
                "Bölge müdürleri gün sonu operasyon notlarını bu kanaldan paylaşabilir.",
              ]
            : index === 2
              ? [
                  "Yeni eğitim atamaları çalışanların gelişim ekranlarına tanımlandı.",
                  "Lazer uygulama standardı sınavı bu hafta tamamlanmalı.",
                  "İzin talepleri ve eksik personel evrakları İK ekranından takip edilebilir.",
                ]
              : [
                  "Bu ayın en yüksek dönüşüm oranı Nişantaşı ve Çankaya şubelerinde.",
                  "VIP bakım paketlerinde kampanya geri dönüşleri olumlu ilerliyor.",
                  "CRM takiplerini gün sonunda kapatmayı unutmayalım.",
                ];
        for (let messageIndex = 0; messageIndex < bodies.length; messageIndex += 1) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO team_messages(
               id,tenant_id,company_id,conversation_id,sender_user_id,body,created_at
             ) VALUES($1,$2,$3,$4,$5,$6,NOW()-($7::int*INTERVAL '1 hour'))`,
            randomUUID(),
            tenantId,
            companyId,
            conversationId,
            ownerUserId,
            bodies[messageIndex],
            (bodies.length - messageIndex) * 4 + index,
          );
        }
      }
    }
  }
}

async function main() {
  console.log("🏗️  VALOO Enterprise demo seed başlıyor...");

  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_TENANT_SLUG },
    update: { name: "VALOO Enterprise Demo" },
    create: { name: "VALOO Enterprise Demo", slug: DEMO_TENANT_SLUG },
  });
  const company = await prisma.company.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: DEMO_COMPANY_SLUG } },
    update: { name: "VALOO Beauty Group", status: "ACTIVE" },
    create: {
      tenantId: tenant.id,
      name: "VALOO Beauty Group",
      slug: DEMO_COMPANY_SLUG,
      status: "ACTIVE",
    },
  });

  const branchRecords: Array<{ id: string; code: string; name: string; region: number }> = [];
  for (let index = 0; index < BRANCHES.length; index += 1) {
    const fixture = BRANCHES[index];
    const created = await prisma.branch.upsert({
      where: { companyId_code: { companyId: company.id, code: fixture.code } },
      update: {
        name: fixture.name,
        status: "ACTIVE",
        address: `${fixture.district}, ${fixture.city} / Türkiye`,
        phone: `+90 ${212 + (index % 4)} 555 ${String(1000 + index).slice(-4)}`,
        email: `${fixture.code.toLowerCase()}@${DEMO_DOMAIN}`,
      },
      create: {
        companyId: company.id,
        name: fixture.name,
        code: fixture.code,
        address: `${fixture.district}, ${fixture.city} / Türkiye`,
        phone: `+90 ${212 + (index % 4)} 555 ${String(1000 + index).slice(-4)}`,
        email: `${fixture.code.toLowerCase()}@${DEMO_DOMAIN}`,
      },
    });
    branchRecords.push({ id: created.id, code: fixture.code, name: fixture.name, region: fixture.region });
  }
  const allBranchIds = branchRecords.map((branch) => branch.id);

  const roles = {
    owner: await role(tenant.id, company.id, "owner", "Şirket Sahibi", RoleScope.CENTRAL, "ALL"),
    gm: await role(tenant.id, company.id, "general-manager", "Genel Müdür", RoleScope.CENTRAL, "ALL"),
    hrManager: await role(tenant.id, company.id, "hr-manager", "İK Müdürü", RoleScope.CENTRAL, ["hr","hr_sensitive","staff","training","quality","reports"]),
    hrSpecialist: await role(tenant.id, company.id, "hr-specialist", "İK Yetkilisi", RoleScope.CENTRAL, ["hr","staff","training","reports"]),
    accManager: await role(tenant.id, company.id, "accounting-manager", "Muhasebe Müdürü", RoleScope.CENTRAL, ["finance","accounting","payments","reports","inventory"]),
    accSpecialist: await role(tenant.id, company.id, "accounting-specialist", "Muhasebe Yetkilisi", RoleScope.CENTRAL, ["finance","accounting","payments","reports"]),
    regional: await role(tenant.id, company.id, "regional-manager", "Bölge Müdürü", RoleScope.COMPANY, ["customers","appointments","payments","reports","staff","services","inventory","crm","training","quality"]),
    coordinator: await role(tenant.id, company.id, "coordinator", "Operasyon Koordinatörü", RoleScope.COMPANY, ["customers","appointments","payments","reports","staff","services","inventory","crm","training","quality"]),
    branchManager: await role(tenant.id, company.id, "branch-manager", "Şube Müdürü", RoleScope.BRANCH, ["customers","appointments","payments","reports","staff","services","inventory","crm","training","quality"]),
    esthetician: await role(tenant.id, company.id, "esthetician", "Estetisyen", RoleScope.BRANCH, ["customers","appointments","services","training"]),
    sales: await role(tenant.id, company.id, "sales", "Satış Danışmanı", RoleScope.BRANCH, ["customers","appointments","payments","services","crm"]),
    reception: await role(tenant.id, company.id, "reception", "Resepsiyon", RoleScope.BRANCH, ["customers","appointments","payments","services"]),
  };

  const owner = await ensureUser({
    email: `owner@${DEMO_DOMAIN}`,
    firstName: "Kaan",
    lastName: "Şirket Sahibi",
    tenantId: tenant.id,
    companyId: company.id,
    roleId: roles.owner.id,
    branchIds: allBranchIds,
  });
  await ensureUser({
    email: `gm@${DEMO_DOMAIN}`, firstName: "Selim", lastName: "Genel Müdür",
    tenantId: tenant.id, companyId: company.id, roleId: roles.gm.id, branchIds: allBranchIds,
  });
  await ensureUser({
    email: `ikmudur@${DEMO_DOMAIN}`, firstName: "Aylin", lastName: "İK Müdürü",
    tenantId: tenant.id, companyId: company.id, roleId: roles.hrManager.id, branchIds: allBranchIds,
  });
  await ensureUser({
    email: `ik1@${DEMO_DOMAIN}`, firstName: "Ece", lastName: "İK Yetkilisi",
    tenantId: tenant.id, companyId: company.id, roleId: roles.hrSpecialist.id, branchIds: allBranchIds,
  });
  await ensureUser({
    email: `muhmudur@${DEMO_DOMAIN}`, firstName: "Murat", lastName: "Muhasebe Müdürü",
    tenantId: tenant.id, companyId: company.id, roleId: roles.accManager.id, branchIds: allBranchIds,
  });
  await ensureUser({
    email: `muh1@${DEMO_DOMAIN}`, firstName: "Deniz", lastName: "Muhasebe Yetkilisi",
    tenantId: tenant.id, companyId: company.id, roleId: roles.accSpecialist.id, branchIds: allBranchIds,
  });

  for (let region = 1; region <= 4; region += 1) {
    await ensureUser({
      email: `bolge${region}@${DEMO_DOMAIN}`,
      firstName: `Bölge ${region}`,
      lastName: "Müdürü",
      tenantId: tenant.id,
      companyId: company.id,
      roleId: roles.regional.id,
      branchIds: branchRecords.filter((branch) => branch.region === region).map((branch) => branch.id),
    });
  }
  for (let index = 1; index <= 2; index += 1) {
    await ensureUser({
      email: `koord${index}@${DEMO_DOMAIN}`,
      firstName: `Koordinatör ${index}`,
      lastName: "Operasyon",
      tenantId: tenant.id,
      companyId: company.id,
      roleId: roles.coordinator.id,
      branchIds: branchRecords.filter((_, branchIndex) => branchIndex % 2 === index - 1).map((branch) => branch.id),
    });
  }

  const createdStaff: Array<{ id: string; branchId: string }> = [];
  const estheticianStaff: Array<{ id: string; branchId: string }> = [];

  for (let branchIndex = 0; branchIndex < branchRecords.length; branchIndex += 1) {
    const branch = branchRecords[branchIndex];
    const branchNo = String(branchIndex + 1).padStart(2, "0");

    const managerUser = await ensureUser({
      email: `sube${branchNo}@${DEMO_DOMAIN}`,
      firstName: FIRST_NAMES[(branchIndex + 2) % FIRST_NAMES.length],
      lastName: `${branch.name} Müdürü`,
      tenantId: tenant.id,
      companyId: company.id,
      roleId: roles.branchManager.id,
      branchIds: [branch.id],
    });
    const manager = await prisma.staff.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: managerUser.id } },
      update: {
        branchId: branch.id, firstName: managerUser.firstName, lastName: managerUser.lastName,
        email: managerUser.email, status: StaffStatus.ACTIVE, profile: { title: "Şube Müdürü" },
      },
      create: {
        tenantId: tenant.id, branchId: branch.id, userId: managerUser.id,
        firstName: managerUser.firstName, lastName: managerUser.lastName,
        email: managerUser.email, phone: `+90531${String(1000000 + branchIndex).padStart(7, "0")}`,
        status: StaffStatus.ACTIVE, profile: { title: "Şube Müdürü" },
      },
    });
    createdStaff.push({ id: manager.id, branchId: branch.id });

    for (let staffIndex = 1; staffIndex <= 5; staffIndex += 1) {
      const user = await ensureUser({
        email: `est${branchNo}-${staffIndex}@${DEMO_DOMAIN}`,
        firstName: FIRST_NAMES[(branchIndex * 5 + staffIndex) % FIRST_NAMES.length],
        lastName: LAST_NAMES[(branchIndex * 7 + staffIndex) % LAST_NAMES.length],
        tenantId: tenant.id,
        companyId: company.id,
        roleId: roles.esthetician.id,
        branchIds: [branch.id],
      });
      const member = await prisma.staff.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        update: {
          branchId: branch.id, firstName: user.firstName, lastName: user.lastName,
          email: user.email, status: StaffStatus.ACTIVE,
          profile: { title: staffIndex === 1 ? "Kıdemli Estetisyen" : "Estetisyen" },
        },
        create: {
          tenantId: tenant.id, branchId: branch.id, userId: user.id,
          firstName: user.firstName, lastName: user.lastName, email: user.email,
          phone: `+90532${String(1000000 + branchIndex * 10 + staffIndex).padStart(7, "0")}`,
          status: StaffStatus.ACTIVE,
          profile: { title: staffIndex === 1 ? "Kıdemli Estetisyen" : "Estetisyen" },
        },
      });
      createdStaff.push({ id: member.id, branchId: branch.id });
      estheticianStaff.push({ id: member.id, branchId: branch.id });
    }

    for (const [kind, roleId, title, first] of [
      ["satis", roles.sales.id, "Satış Danışmanı", "Satış"],
      ["resepsiyon", roles.reception.id, "Resepsiyon Yetkilisi", "Resepsiyon"],
    ] as const) {
      const user = await ensureUser({
        email: `${kind}${branchNo}@${DEMO_DOMAIN}`,
        firstName: first,
        lastName: `${branch.name} ${branchNo}`,
        tenantId: tenant.id,
        companyId: company.id,
        roleId,
        branchIds: [branch.id],
      });
      const member = await prisma.staff.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        update: {
          branchId: branch.id, firstName: user.firstName, lastName: user.lastName,
          email: user.email, status: StaffStatus.ACTIVE, profile: { title },
        },
        create: {
          tenantId: tenant.id, branchId: branch.id, userId: user.id,
          firstName: user.firstName, lastName: user.lastName, email: user.email,
          status: StaffStatus.ACTIVE, profile: { title },
        },
      });
      createdStaff.push({ id: member.id, branchId: branch.id });
    }
  }

  const customersByBranch = new Map<string, Array<{ id: string }>>();
  for (let branchIndex = 0; branchIndex < branchRecords.length; branchIndex += 1) {
    const branch = branchRecords[branchIndex];
    const items: Array<{ id: string }> = [];
    for (let customerIndex = 0; customerIndex < 24; customerIndex += 1) {
      const serial = branchIndex * 24 + customerIndex + 1;
      const email = `musteri${String(serial).padStart(4, "0")}@${DEMO_DOMAIN}`;
      const existing = await prisma.customer.findFirst({ where: { tenantId: tenant.id, email } });
      const data = {
        branchId: branch.id,
        firstName: FIRST_NAMES[serial % FIRST_NAMES.length],
        lastName: LAST_NAMES[(serial * 5) % LAST_NAMES.length],
        phone: `+90555${String(3000000 + serial).padStart(7, "0")}`,
        email,
        birthDate: new Date(1984 + (serial % 20), serial % 12, 1 + (serial % 27)),
        customerSource: serial % 4 === 0 ? "INSTAGRAM" as const : serial % 4 === 1 ? "GOOGLE" as const : serial % 4 === 2 ? "REFERRAL" as const : "WALK_IN" as const,
      };
      const customer = existing
        ? await prisma.customer.update({ where: { id: existing.id }, data })
        : await prisma.customer.create({ data: { tenantId: tenant.id, ...data } });
      items.push({ id: customer.id });
    }
    customersByBranch.set(branch.id, items);
  }

  const servicesByBranch = new Map<string, Array<{ id: string; durationMinutes: number; price: { toString(): string } }>>();
  for (const branch of branchRecords) {
    const items: Array<{ id: string; durationMinutes: number; price: { toString(): string } }> = [];
    for (const [name, durationMinutes, price] of SERVICES) {
      const existing = await prisma.service.findFirst({
        where: { tenantId: tenant.id, branchId: branch.id, name },
      });
      const service = existing
        ? await prisma.service.update({
            where: { id: existing.id },
            data: { durationMinutes, price, status: ServiceStatus.ACTIVE, description: "Enterprise demo hizmeti" },
          })
        : await prisma.service.create({
            data: {
              tenantId: tenant.id, branchId: branch.id, name, durationMinutes, price,
              status: ServiceStatus.ACTIVE, description: "Enterprise demo hizmeti",
            },
          });
      items.push(service);
    }
    servicesByBranch.set(branch.id, items);
  }

  const oldAppointments = await prisma.appointment.findMany({
    where: { tenantId: tenant.id, notes: { startsWith: APPOINTMENT_PREFIX } },
    select: { id: true },
  });
  if (oldAppointments.length) {
    await prisma.payment.deleteMany({ where: { tenantId: tenant.id, appointmentId: { in: oldAppointments.map((item) => item.id) } } });
    await prisma.appointment.deleteMany({ where: { id: { in: oldAppointments.map((item) => item.id) } } });
  }

  const appointments: Array<{
    tenantId: string; branchId: string; customerId: string; staffId: string; serviceId: string;
    startAt: Date; endAt: Date; status: AppointmentStatus; notes: string;
  }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const historyStart = addDays(today, -90);
  const futureEnd = new Date("2027-12-31T00:00:00.000Z");
  for (let cursor = new Date(historyStart); cursor <= futureEnd; cursor = addDays(cursor, 1)) {
    const dayIndex = Math.round((cursor.getTime() - historyStart.getTime()) / 86_400_000);
    for (let branchIndex = 0; branchIndex < branchRecords.length; branchIndex += 1) {
      const branch = branchRecords[branchIndex];
      const customers = customersByBranch.get(branch.id) ?? [];
      const services = servicesByBranch.get(branch.id) ?? [];
      const staff = estheticianStaff.filter((member) => member.branchId === branch.id);
      for (let slot = 0; slot < 3; slot += 1) {
        const startAt = at(cursor, 10 + slot * 3, (branchIndex + slot) % 2 ? 30 : 0);
        const service = services[(dayIndex + branchIndex + slot) % services.length];
        const customer = customers[(dayIndex * 3 + branchIndex + slot) % customers.length];
        const member = staff[(dayIndex + slot) % staff.length];
        const endAt = new Date(startAt);
        endAt.setMinutes(endAt.getMinutes() + service.durationMinutes);
        const isPast = startAt < new Date();
        const status = isPast
          ? ((dayIndex + slot) % 17 === 0 ? AppointmentStatus.NO_SHOW : AppointmentStatus.COMPLETED)
          : ((dayIndex + branchIndex + slot) % 3 === 0 ? AppointmentStatus.CONFIRMED : AppointmentStatus.SCHEDULED);
        appointments.push({
          tenantId: tenant.id,
          branchId: branch.id,
          customerId: customer.id,
          staffId: member.id,
          serviceId: service.id,
          startAt,
          endAt,
          status,
          notes: `${APPOINTMENT_PREFIX} ${branch.code} / ${ymd(cursor)} / ${slot + 1}`,
        });
      }
    }
  }
  for (let offset = 0; offset < appointments.length; offset += 1000) {
    await prisma.appointment.createMany({ data: appointments.slice(offset, offset + 1000) });
  }

  const completed = await prisma.appointment.findMany({
    where: {
      tenantId: tenant.id,
      notes: { startsWith: APPOINTMENT_PREFIX },
      status: AppointmentStatus.COMPLETED,
      startAt: { gte: addDays(today, -60) },
    },
    include: { service: true },
    take: 1200,
  });
  for (let offset = 0; offset < completed.length; offset += 250) {
    const batch = completed.slice(offset, offset + 250);
    await prisma.payment.createMany({
      data: batch.map((appointment, index) => ({
        tenantId: tenant.id,
        appointmentId: appointment.id,
        amount: appointment.service.price,
        method: [PaymentMethod.CARD, PaymentMethod.CASH, PaymentMethod.TRANSFER][index % 3],
        status: "COMPLETED",
        paidAt: appointment.endAt,
      })),
      skipDuplicates: true,
    });
  }

  await seedCommerceAndFinance(tenant.id, company.id, branchRecords, customersByBranch, servicesByBranch);
  await seedCrm(tenant.id, company.id, branchRecords, owner.id);
  await seedInventory(tenant.id, company.id, branchRecords);
  await seedHr(tenant.id, createdStaff.map((item) => item.id));
  await seedTraining(tenant.id, company.id, owner.id, createdStaff);
  await seedQualityAndCommunications(tenant.id, company.id, owner.id, branchRecords);

  console.log("");
  console.log("✅ VALOO Enterprise sunum demosu hazır.");
  console.log(`🏢 Tenant: ${tenant.name}`);
  console.log(`🏬 Şube: ${branchRecords.length}`);
  console.log("📦 Tedarikçi: 20");
  console.log(`👥 Müşteri: ${branchRecords.length * 24}`);
  console.log(`👩‍💼 Şube personeli: ${createdStaff.length}`);
  console.log(`📅 Demo randevusu: ${appointments.length}`);
  console.log(`📚 Eğitim kataloğu: ${TRAINING_COURSES.length}`);
  console.log("");
  console.log("🔐 Tüm demo kullanıcıları aynı sunum parolasını kullanır.");
  console.log("Örnek kullanıcılar:");
  console.log(`   owner@${DEMO_DOMAIN}      Şirket Sahibi`);
  console.log(`   gm@${DEMO_DOMAIN}         Genel Müdür`);
  console.log(`   ikmudur@${DEMO_DOMAIN}    İK Müdürü`);
  console.log(`   ik1@${DEMO_DOMAIN}        İK Yetkilisi`);
  console.log(`   muhmudur@${DEMO_DOMAIN}   Muhasebe Müdürü`);
  console.log(`   muh1@${DEMO_DOMAIN}       Muhasebe Yetkilisi`);
  console.log(`   bolge1@${DEMO_DOMAIN}     Bölge Müdürü 1`);
  console.log(`   koord1@${DEMO_DOMAIN}     Koordinatör 1`);
  console.log(`   sube01@${DEMO_DOMAIN}     Şube Müdürü 1`);
  console.log(`   est01-1@${DEMO_DOMAIN}    Estetisyen`);
}

main()
  .catch((error) => {
    console.error("❌ Enterprise demo seed başarısız:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
