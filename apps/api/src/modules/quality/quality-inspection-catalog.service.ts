import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type CatalogItem = { code: string; title: string; weight?: number; required?: boolean; description?: string };
type CatalogTemplate = { code: string; name: string; category: string; cadence: 'WEEKLY' | 'MONTHLY'; description: string; items: CatalogItem[] };

const standardCatalog: CatalogTemplate[] = [
  {
    code: 'GENERAL_BRANCH_AUDIT', name: 'Genel Şube Denetimi', category: 'GENERAL_BRANCH_AUDIT', cadence: 'MONTHLY',
    description: 'Aylık genel şube standart denetimi. SCORE soruları 0=uygun değil, 50=kısmen uygun, 100=uygun olarak kullanılabilir.',
    items: [
      { code: 'BRANCH_APPEARANCE', title: 'Şube genel görünümü ve kurumsal standartlar', weight: 2 },
      { code: 'PERSONNEL_APPEARANCE', title: 'Personel görünümü ve üniforma standardı', weight: 2 },
      { code: 'RECEPTION_ORDER', title: 'Resepsiyon düzeni ve karşılama alanı', weight: 2 },
      { code: 'PRICE_LISTS', title: 'Fiyat listeleri ve müşteri bilgilendirmeleri güncel', weight: 1 },
      { code: 'DEVICE_CONDITION', title: 'Cihazların fiziksel durumu ve çalışma uygunluğu', weight: 2 },
      { code: 'FIRE_SAFETY', title: 'Yangın ve iş güvenliği kontrolleri', weight: 3 },
      { code: 'STOCK_ORDER', title: 'Stok alanı düzeni ve temel stok standardı', weight: 1 },
      { code: 'CUSTOMER_GREETING', title: 'Müşteri karşılama standardı', weight: 2 },
    ],
  },
  {
    code: 'HYGIENE', name: 'Temizlik ve Hijyen Denetimi', category: 'HYGIENE', cadence: 'WEEKLY',
    description: 'Haftalık hijyen denetimi; açılış, gün içi ve kapanış kontrollerine temel oluşturur.',
    items: [
      { code: 'RECEPTION', title: 'Resepsiyon ve bekleme alanı temizliği', weight: 1 },
      { code: 'WC', title: 'WC hijyen standardı', weight: 2 },
      { code: 'TREATMENT_ROOMS', title: 'Uygulama odaları hijyeni', weight: 3 },
      { code: 'DEVICES', title: 'Cihaz yüzeyleri ve ekipman hijyeni', weight: 3 },
      { code: 'BEDS', title: 'Yatak ve uygulama yüzeyleri hijyeni', weight: 2 },
      { code: 'TEXTILES', title: 'Havlu ve tekstil hijyeni', weight: 2 },
      { code: 'FLOORS', title: 'Zemin temizliği', weight: 1 },
      { code: 'STORAGE', title: 'Depolama alanı hijyen ve düzeni', weight: 2 },
      { code: 'STAFF_AREA', title: 'Personel alanı hijyeni', weight: 1 },
      { code: 'STERILIZATION', title: 'Sterilizasyon prosedürü ve kayıtları', weight: 4 },
    ],
  },
  {
    code: 'CAMERA_AUDIT', name: 'Kamera Kontrol Denetimi', category: 'CAMERA_AUDIT', cadence: 'WEEKLY',
    description: 'Haftalık manuel kamera audit kontrolü. Otomatik video analizi değildir.',
    items: [
      { code: 'GREETING', title: 'Müşteri karşılama davranışı', weight: 2 },
      { code: 'EMPLOYEE_BEHAVIOR', title: 'Çalışan davranış standardı', weight: 2 },
      { code: 'PHONE_USE', title: 'Uygunsuz telefon kullanımı bulunmaması', weight: 1 },
      { code: 'RECEPTION_ORDER', title: 'Resepsiyon düzen standardı', weight: 1 },
      { code: 'WAIT_TIME', title: 'Bekleme süresi operasyon standardı', weight: 2 },
      { code: 'UNIFORM', title: 'Üniforma ve görünüm standardı', weight: 1 },
      { code: 'PROCEDURE_COMPLIANCE', title: 'İşlem/prosedür standardına uyum', weight: 3 },
    ],
  },
  {
    code: 'DOCUMENT_COMPLIANCE', name: 'Evrak ve Dokümantasyon Uyum Denetimi', category: 'DOCUMENT_COMPLIANCE', cadence: 'MONTHLY',
    description: 'Aylık belge, izin ve kayıt uygunluk kontrolü.',
    items: [
      { code: 'LICENSES', title: 'Ruhsat ve faaliyet belgeleri geçerli', weight: 3 },
      { code: 'CONTRACTS', title: 'Sözleşmeler ve zorunlu kurumsal evraklar mevcut', weight: 2 },
      { code: 'PERSONNEL_DOCS', title: 'Personel evrakları tam ve güncel', weight: 2 },
      { code: 'CERTIFICATES', title: 'Sertifikalar geçerli ve erişilebilir', weight: 2 },
      { code: 'DEVICE_DOCS', title: 'Cihaz belgeleri ve bakım kayıtları güncel', weight: 3 },
      { code: 'HYGIENE_RECORDS', title: 'Hijyen kayıtları eksiksiz', weight: 2 },
      { code: 'KVKK', title: 'KVKK dokümantasyonu ve uygulama kayıtları uygun', weight: 3 },
      { code: 'TRAINING_DOCS', title: 'Zorunlu eğitim kayıtları mevcut', weight: 1 },
      { code: 'PROCEDURES', title: 'Güncel prosedür ve talimatlar erişilebilir', weight: 2 },
    ],
  },
  {
    code: 'PRODUCT_VERIFICATION', name: 'Ürün Kullanım ve Doğrulama Denetimi', category: 'PRODUCT_VERIFICATION', cadence: 'MONTHLY',
    description: 'Aylık ürün, lot, SKT, saklama ve kullanım uygunluğu denetimi.',
    items: [
      { code: 'PRODUCT_IDENTITY', title: 'Kullanılan ürün doğru ve doğrulanabilir', weight: 3 },
      { code: 'LOT', title: 'Lot bilgisi kayıtlı ve izlenebilir', weight: 2 },
      { code: 'EXPIRY', title: 'Son kullanma tarihi uygun', weight: 4 },
      { code: 'STORAGE', title: 'Saklama koşulları ürün standardına uygun', weight: 3 },
      { code: 'OPEN_DATE', title: 'Açılış tarihi gereken ürünlerde kayıt mevcut', weight: 2 },
      { code: 'SERVICE_FIT', title: 'Ürün ilgili hizmet/uygulama için uygun', weight: 3 },
      { code: 'QUANTITY_CONTROL', title: 'Beklenen miktar ile operasyonel kullanım tutarlı', weight: 2 },
    ],
  },
  {
    code: 'SERVICE_QUALITY', name: 'Hizmet Kalitesi Denetimi', category: 'SERVICE_QUALITY', cadence: 'MONTHLY',
    description: 'Aylık hizmet sunumu, müşteri deneyimi ve prosedür uyumu denetimi.',
    items: [
      { code: 'GREETING', title: 'Müşteri doğru ve zamanında karşılanıyor', weight: 2 },
      { code: 'CONSULTATION', title: 'Hizmet öncesi bilgilendirme/danışmanlık standardı', weight: 3 },
      { code: 'PROCEDURE', title: 'Hizmet prosedürüne uygun uygulama', weight: 4 },
      { code: 'DEVICE_USE', title: 'Cihaz/ekipman doğru kullanımı', weight: 3 },
      { code: 'PRODUCT_USE', title: 'Doğru ürün ve sarf kullanımı', weight: 3 },
      { code: 'CUSTOMER_COMMUNICATION', title: 'Müşteri iletişimi ve mahremiyet standardı', weight: 3 },
      { code: 'AFTERCARE', title: 'Hizmet sonrası bilgilendirme ve takip standardı', weight: 2 },
      { code: 'RECORDS', title: 'İşlem kayıtları eksiksiz ve doğru', weight: 2 },
    ],
  },
];

@Injectable()
export class QualityInspectionCatalogService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  listCatalog() {
    return standardCatalog.map((template) => ({ ...template, version: 1, itemCount: template.items.length }));
  }

  async install(actorUserId: string) {
    const c = this.tenant.getContext();
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        `quality-standard-catalog:${c.tenantId}:${c.companyId}:v1`,
      );
      const installed: any[] = [];
      for (const template of standardCatalog) {
        const existing = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,name,category,version,is_active AS "isActive"
           FROM quality_inspection_templates
           WHERE tenant_id=$1::text AND company_id=$2::text AND name=$3 AND version=1
           LIMIT 1`,
          c.tenantId,c.companyId,template.name,
        );
        if (existing.length) {
          installed.push({ ...existing[0], code: template.code, cadence: template.cadence, duplicate: true });
          continue;
        }
        const rows = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO quality_inspection_templates(tenant_id,company_id,name,description,category,version,created_by_user_id)
           VALUES($1::text,$2::text,$3,$4,$5,1,$6::text)
           RETURNING id,name,category,version,is_active AS "isActive"`,
          c.tenantId,c.companyId,template.name,template.description,template.category,actorUserId,
        );
        const created = rows[0];
        for (let index = 0; index < template.items.length; index += 1) {
          const item = template.items[index];
          await tx.$executeRawUnsafe(
            `INSERT INTO quality_inspection_template_items(
               template_id,tenant_id,company_id,sort_order,code,title,description,response_type,is_required,weight
             ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,'SCORE',$8,$9)`,
            created.id,c.tenantId,c.companyId,index,item.code,item.title,
            item.description ?? 'Skor ölçeği: 0=uygun değil, 50=kısmen uygun, 100=uygun; uygulanamaz durumda NA kullanılır.',
            item.required ?? true,item.weight ?? 1,
          );
        }
        installed.push({ ...created, code: template.code, cadence: template.cadence, duplicate: false });
      }
      return { catalogVersion: 1, installedCount: installed.filter((x) => !x.duplicate).length, templates: installed };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
