import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type TemplateDefinition = {
  key: string;
  name: string;
  description: string;
  scope: 'CENTRAL' | 'COMPANY' | 'BRANCH';
  permissions: string[];
};

const TEMPLATES: TemplateDefinition[] = [
  { key: 'general-manager', name: 'Genel Müdür', description: 'Şirket genelinde operasyon, raporlama ve yönetim görünürlüğü.', scope: 'CENTRAL', permissions: ['reports.read','customers.read','appointments.read','operations.read','operations.manage','payments.read','sales.read','staff.read','services.read','inventory.read','crm.read','finance.read','accounting.read','hr.read','hr_sensitive.read','roles.read'] },
  { key: 'deputy-general-manager', name: 'Genel Müdür Yardımcısı', description: 'Şirket genelinde atanmış yönetim ve operasyon süreçleri.', scope: 'COMPANY', permissions: ['reports.read','operations.read','operations.manage','staff.read','services.read','inventory.read','crm.read','finance.read','hr.read','roles.read'] },
  { key: 'finance-director', name: 'CFO / Finans Direktörü', description: 'Finans, muhasebe, ödeme ve bütçe süreçlerinin üst yönetimi.', scope: 'COMPANY', permissions: ['finance.read','finance.manage','accounting.read','accounting.manage','payments.read','payments.create','reports.read','hr.read'] },
  { key: 'hr-director', name: 'İK Direktörü / İK Müdürü', description: 'Şirket genelinde insan kaynakları, özlük, bordro ve organizasyon yönetimi.', scope: 'COMPANY', permissions: ['hr.read','hr.manage','hr_sensitive.read','staff.read','staff.create','staff.update','reports.read','roles.read'] },
  { key: 'operations-director', name: 'Operasyon Direktörü', description: 'Şirket operasyonları, vardiya ve saha süreçlerinin üst yönetimi.', scope: 'COMPANY', permissions: ['operations.read','operations.manage','appointments.read','staff.read','services.read','inventory.read','reports.read','hr.read'] },

  { key: 'regional-manager', name: 'Bölge Müdürü', description: 'Atanmış şubelerde operasyon ve personel yönetimi.', scope: 'COMPANY', permissions: ['operations.read','operations.manage','appointments.read','staff.read','staff.update','services.read','inventory.read','reports.read','hr.read'] },
  { key: 'coordinator', name: 'Koordinatör', description: 'Atanmış şube ve ekiplerde operasyonel koordinasyon.', scope: 'COMPANY', permissions: ['operations.read','operations.manage','appointments.read','staff.read','services.read','reports.read','hr.read'] },
  { key: 'branch-manager', name: 'Şube Müdürü', description: 'Kendi şubesinde operasyon, personel ve onay süreçleri.', scope: 'BRANCH', permissions: ['customers.read','customers.create','customers.update','appointments.read','appointments.create','appointments.update','payments.read','payments.create','reports.read','staff.read','staff.update','services.read','inventory.read','inventory.write','crm.read','crm.manage','operations.read','operations.manage','hr.read','hr_self_service.read'] },
  { key: 'assistant-branch-manager', name: 'Şube Müdür Yardımcısı', description: 'Kendi şubesinde yetkilendirilen operasyon ve personel süreçleri.', scope: 'BRANCH', permissions: ['customers.read','appointments.read','appointments.create','appointments.update','payments.read','reports.read','staff.read','services.read','inventory.read','operations.read','hr.read','hr_self_service.read'] },
  { key: 'department-manager', name: 'Departman Müdürü', description: 'Kendi departmanında ekip ve operasyon yönetimi.', scope: 'BRANCH', permissions: ['staff.read','appointments.read','operations.read','reports.read','hr.read','hr_self_service.read'] },
  { key: 'team-leader', name: 'Takım Lideri', description: 'Kendi ekibinde günlük operasyon ve personel koordinasyonu.', scope: 'BRANCH', permissions: ['staff.read','appointments.read','operations.read','hr_self_service.read'] },

  { key: 'hr-manager', name: 'İK Müdürü', description: 'İK süreçleri, personel, puantaj, izin ve onay yönetimi.', scope: 'COMPANY', permissions: ['hr.read','hr.manage','hr_sensitive.read','staff.read','staff.create','staff.update','reports.read','roles.read'] },
  { key: 'hr-officer', name: 'İK Yetkilisi', description: 'Günlük insan kaynakları, özlük ve personel operasyonları.', scope: 'COMPANY', permissions: ['hr.read','hr.manage','hr_sensitive.read','staff.read','staff.create','staff.update','reports.read'] },
  { key: 'payroll-officer', name: 'Bordro ve Özlük Yetkilisi', description: 'Bordro, özlük, puantaj ve maaş süreçleri.', scope: 'COMPANY', permissions: ['hr.read','hr.manage','hr_sensitive.read','staff.read','finance.read','reports.read'] },
  { key: 'recruitment-officer', name: 'İşe Alım Yetkilisi', description: 'Aday, ilan, görüşme ve işe alım süreçleri.', scope: 'COMPANY', permissions: ['hr.read','hr.manage','staff.read','reports.read'] },

  { key: 'finance-manager', name: 'Finans Müdürü', description: 'Finans operasyonları ve ödeme kontrolleri.', scope: 'COMPANY', permissions: ['finance.read','finance.manage','payments.read','payments.create','reports.read','accounting.read'] },
  { key: 'finance-officer', name: 'Finans Yetkilisi', description: 'Günlük finans ve ödeme operasyonları.', scope: 'COMPANY', permissions: ['finance.read','payments.read','payments.create','reports.read'] },
  { key: 'accounting-manager', name: 'Muhasebe Müdürü', description: 'Muhasebe kayıtları ve finansal onay süreçleri.', scope: 'COMPANY', permissions: ['accounting.read','accounting.manage','finance.read','payments.read','reports.read'] },
  { key: 'accountant', name: 'Muhasebe Yetkilisi', description: 'Muhasebe ve raporlama işlemleri.', scope: 'COMPANY', permissions: ['accounting.read','accounting.manage','finance.read','payments.read','reports.read'] },
  { key: 'cashier', name: 'Kasa Yetkilisi', description: 'Şube kasa, tahsilat ve ödeme işlemleri.', scope: 'BRANCH', permissions: ['payments.read','payments.create','sales.read','sales.collect','reports.read'] },

  { key: 'reception', name: 'Resepsiyon', description: 'Müşteri, randevu ve ön büro işlemleri.', scope: 'BRANCH', permissions: ['customers.read','customers.create','customers.update','appointments.read','appointments.create','appointments.update','appointments.cancel','payments.read','payments.create','services.read','hr_self_service.read'] },
  { key: 'sales-specialist', name: 'Satış Uzmanı', description: 'Satış, CRM ve müşteri takip süreçleri.', scope: 'BRANCH', permissions: ['customers.read','customers.create','customers.update','sales.read','sales.create','crm.read','crm.manage','services.read','hr_self_service.read'] },
  { key: 'specialist', name: 'Uzman / Estetisyen', description: 'Kendi hizmet, randevu ve çalışan self servis süreçleri.', scope: 'BRANCH', permissions: ['appointments.read','services.read','sessions.read','sessions.consume','hr_self_service.read'] },
  { key: 'service-staff', name: 'Hizmet Personeli', description: 'Atanmış hizmet ve çalışan self servis süreçleri.', scope: 'BRANCH', permissions: ['appointments.read','services.read','sessions.read','hr_self_service.read'] },
  { key: 'field-staff', name: 'Saha Personeli', description: 'Saha operasyonları ve çalışan self servis işlemleri.', scope: 'BRANCH', permissions: ['operations.read','hr_self_service.read'] },
  { key: 'employee', name: 'Çalışan', description: 'Kendi puantaj, izin, vardiya, belge ve çalışan self servis alanları.', scope: 'BRANCH', permissions: ['hr_self_service.read'] },
  { key: 'intern', name: 'Stajyer', description: 'Kısıtlı çalışan self servis erişimi.', scope: 'BRANCH', permissions: ['hr_self_service.read'] },
  { key: 'temporary-staff', name: 'Geçici Personel', description: 'Geçici çalışan self servis erişimi.', scope: 'BRANCH', permissions: ['hr_self_service.read'] },
  { key: 'warehouse', name: 'Depo Yetkilisi', description: 'Envanter ve depo operasyonları.', scope: 'BRANCH', permissions: ['inventory.read','inventory.write','reports.read','hr_self_service.read'] },
  { key: 'auditor', name: 'Denetçi', description: 'Denetim ve raporlama için ağırlıklı okuma erişimi.', scope: 'COMPANY', permissions: ['reports.read','finance.read','accounting.read','payments.read','inventory.read','hr.read'] },
];

@Injectable()
export class RoleTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly audit: PlatformAuditService,
  ) {}

  list() {
    return TEMPLATES.map((template) => ({ ...template, permissionCount: template.permissions.length }));
  }

  async ensureDefaults() {
    const context = this.tenantContext.getContext();
    const existingRoles = await this.prisma.role.findMany({
      where: {
        tenantId: context.tenantId,
        companyId: context.companyId,
      },
      select: { id: true, slug: true, name: true },
    });
    const existingSlugs = new Set(existingRoles.map((role) => role.slug));
    const existingNames = new Set(existingRoles.map((role) => role.name));
    let createdCount = 0;

    for (const template of TEMPLATES) {
      if (existingSlugs.has(template.key) || existingNames.has(template.name)) continue;

      const permissionPairs = template.permissions.map((value) => {
        const [resource, action] = value.split('.');
        return { resource, action };
      });
      const permissions = permissionPairs.length
        ? await this.prisma.permission.findMany({
            where: { OR: permissionPairs },
            select: { id: true },
          })
        : [];

      await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            tenantId: context.tenantId,
            companyId: context.companyId,
            name: template.name,
            slug: template.key,
            description: template.description,
            scope: template.scope,
          },
          select: { id: true },
        });
        if (permissions.length) {
          await tx.rolePermission.createMany({
            data: permissions.map((permission) => ({
              roleId: role.id,
              permissionId: permission.id,
            })),
            skipDuplicates: true,
          });
        }
      });
      existingSlugs.add(template.key);
      existingNames.add(template.name);
      createdCount += 1;
    }

    return {
      createdCount,
      totalTemplateCount: TEMPLATES.length,
    };
  }


  async instantiate(templateKey: string, input: { name?: string; description?: string }) {
    const context = this.tenantContext.getContext();
    const template = TEMPLATES.find((item) => item.key === templateKey);
    if (!template) throw new NotFoundException('Role template not found');

    const name = input.name?.trim() || template.name;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) throw new BadRequestException('Invalid role name');

    const duplicate = await this.prisma.role.findFirst({
      where: { tenantId: context.tenantId, OR: [{ slug }, { companyId: context.companyId, name }] },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('Role name or slug already exists');

    const actor = await this.prisma.membership.findFirst({
      where: { id: context.membershipId, tenantId: context.tenantId, companyId: context.companyId, status: 'ACTIVE' },
      select: { userId: true },
    });
    if (!actor) throw new BadRequestException('Active administrator membership is required');

    const permissionPairs = template.permissions.map((value) => {
      const [resource, action] = value.split('.');
      return { resource, action };
    });
    const permissions = await this.prisma.permission.findMany({
      where: { OR: permissionPairs },
      select: { id: true, resource: true, action: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          tenantId: context.tenantId,
          companyId: context.companyId,
          name,
          slug,
          description: input.description?.trim() || template.description,
          scope: template.scope,
        },
      });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
          skipDuplicates: true,
        });
      }
      await this.audit.record({
        actorUserId: actor.userId,
        resource: 'roles',
        action: 'template.instantiate',
        targetTenantId: context.tenantId,
        targetEntityType: 'role',
        targetEntityId: role.id,
        beforeState: null,
        afterState: {
          templateKey,
          name: role.name,
          slug: role.slug,
          scope: role.scope,
          permissionCount: permissions.length,
        },
        metadata: { companyId: context.companyId, actorMembershipId: context.membershipId },
      }, tx);
      return tx.role.findUnique({
        where: { id: role.id },
        include: { rolePermissions: { include: { permission: true } }, _count: { select: { memberships: true, rolePermissions: true } } },
      });
    });
  }
}
