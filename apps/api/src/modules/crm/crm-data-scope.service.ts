import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type CrmDataScope = 'SELF' | 'TEAM' | 'BRANCH' | 'COMPANY' | 'ALL';

export type CrmVisibility = {
  scope: CrmDataScope;
  userId: string;
  ownerUserIds: string[];
  restrictOwners: boolean;
  branchId: string | null;
};

@Injectable()
export class CrmDataScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async resolve(): Promise<CrmVisibility> {
    const context = this.tenantContext.getContext();
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      userId: string;
      roleScope: 'CENTRAL' | 'COMPANY' | 'BRANCH';
      configuredScope: CrmDataScope | null;
      canManage: boolean;
    }>>(
      `SELECT m."userId" AS "userId",
              r.scope::text AS "roleScope",
              p.data_scope AS "configuredScope",
              EXISTS(
                SELECT 1
                FROM role_permissions rp
                JOIN permissions pm ON pm.id=rp."permissionId"
                WHERE rp."roleId"=r.id AND pm.resource='crm' AND pm.action='manage'
              ) AS "canManage"
         FROM memberships m
         JOIN roles r ON r.id=m."roleId"
         LEFT JOIN crm_access_policies p ON p.role_id=r.id
        WHERE m.id=$1::text
          AND m."tenantId"=$2::text
          AND m."companyId"=$3::text
          AND m.status='ACTIVE'
        LIMIT 1`,
      context.membershipId,
      context.tenantId,
      context.companyId,
    );

    const row = rows[0];
    if (!row) throw new BadRequestException('CRM erişim kapsamı belirlenemedi.');

    const fallback: CrmDataScope = row.canManage
      ? row.roleScope === 'CENTRAL'
        ? 'ALL'
        : row.roleScope === 'COMPANY'
          ? 'COMPANY'
          : 'BRANCH'
      : 'SELF';

    let scope = row.configuredScope ?? fallback;
    if (row.roleScope === 'BRANCH' && ['COMPANY','ALL'].includes(scope)) scope = 'BRANCH';
    if (row.roleScope === 'COMPANY' && scope === 'ALL') scope = 'COMPANY';
    if (scope === 'BRANCH' && !context.branchId) {
      throw new BadRequestException('Şube kapsamındaki CRM verilerini görüntülemek için aktif bir şube seçilmelidir.');
    }
    if (scope === 'SELF') {
      return { scope, userId: row.userId, ownerUserIds: [row.userId], restrictOwners: true, branchId: context.branchId };
    }

    if (scope === 'TEAM') {
      const teamRows = await this.prisma.$queryRawUnsafe<Array<{ userId: string }>>(
        `SELECT DISTINCT x.user_id AS "userId"
           FROM (
             SELECT tm.user_id
               FROM crm_teams t
               JOIN crm_team_members tm ON tm.team_id=t.id
              WHERE t.tenant_id=$1::text
                AND t.company_id=$2::text
                AND t.active=TRUE
                AND ($3::text IS NULL OR t.branch_id IS NULL OR t.branch_id=$3::text)
                AND (t.manager_user_id=$4::text OR EXISTS(
                  SELECT 1 FROM crm_team_members mine
                   WHERE mine.team_id=t.id AND mine.user_id=$4::text
                ))
             UNION
             SELECT $4::text
           ) x`,
        context.tenantId,
        context.companyId,
        context.branchId,
        row.userId,
      );
      const ownerUserIds = [...new Set(teamRows.map((item) => item.userId).filter(Boolean))];
      return { scope, userId: row.userId, ownerUserIds, restrictOwners: true, branchId: context.branchId };
    }

    return {
      scope,
      userId: row.userId,
      ownerUserIds: [],
      restrictOwners: false,
      branchId: context.branchId,
    };
  }

  async listAccessPolicies() {
    const context = this.tenantContext.getContext();
    return this.prisma.$queryRawUnsafe<Array<{
      roleId: string;
      roleName: string;
      roleSlug: string;
      roleScope: string;
      dataScope: CrmDataScope | null;
      hasCrmRead: boolean;
      hasCrmManage: boolean;
      membershipCount: number;
    }>>(
      `SELECT r.id AS "roleId",r.name AS "roleName",r.slug AS "roleSlug",r.scope::text AS "roleScope",
              p.data_scope AS "dataScope",
              EXISTS(
                SELECT 1 FROM role_permissions rp
                JOIN permissions pm ON pm.id=rp."permissionId"
                WHERE rp."roleId"=r.id AND pm.resource='crm' AND pm.action='read'
              ) AS "hasCrmRead",
              EXISTS(
                SELECT 1 FROM role_permissions rp
                JOIN permissions pm ON pm.id=rp."permissionId"
                WHERE rp."roleId"=r.id AND pm.resource='crm' AND pm.action='manage'
              ) AS "hasCrmManage",
              (SELECT COUNT(*)::int FROM memberships m
                WHERE m."roleId"=r.id AND m."tenantId"=$1::text AND m."companyId"=$2::text
                  AND m.status='ACTIVE') AS "membershipCount"
         FROM roles r
         LEFT JOIN crm_access_policies p ON p.role_id=r.id
        WHERE r."tenantId"=$1::text AND r."companyId"=$2::text
        ORDER BY CASE WHEN r.slug='owner' THEN 0 ELSE 1 END,r.name,r.id`,
      context.tenantId,
      context.companyId,
    );
  }

  async setAccessPolicy(roleId: string, scope: CrmDataScope) {
    const context = this.tenantContext.getContext();
    const roles = await this.prisma.$queryRawUnsafe<Array<{ id: string; slug: string; scope: string }>>(
      `SELECT id,slug,scope::text AS scope FROM roles
        WHERE id=$1::text AND "tenantId"=$2::text AND "companyId"=$3::text
        LIMIT 1`,
      roleId,
      context.tenantId,
      context.companyId,
    );
    const role = roles[0];
    if (!role) throw new BadRequestException('Seçilen rol aktif şirkette bulunamadı.');
    if (role.slug === 'owner' && scope !== 'ALL') {
      throw new BadRequestException('Platform sahibi rolünün CRM veri kapsamı Tüm Yetkili Veriler olarak kalmalıdır.');
    }
    if (role.scope === 'BRANCH' && ['COMPANY','ALL'].includes(scope)) {
      throw new BadRequestException('Şube kapsamındaki bir role şirket veya tüm veriler kapsamı verilemez.');
    }
    if (role.scope === 'COMPANY' && scope === 'ALL') {
      throw new BadRequestException('Şirket kapsamındaki bir role organizasyon sınırını aşan veri erişimi verilemez.');
    }

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO crm_access_policies(role_id,data_scope,created_at,updated_at)
       VALUES($1::text,$2,NOW(),NOW())
       ON CONFLICT(role_id) DO UPDATE SET data_scope=EXCLUDED.data_scope,updated_at=NOW()`,
      roleId,
      scope,
    );
    return { roleId, dataScope: scope };
  }

  async assertLeadAccess(leadId: string) {
    const visibility = await this.resolve();
    if (!visibility.restrictOwners) return;
    const context = this.tenantContext.getContext();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM crm_leads
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
          AND ($4::text IS NULL OR branch_id=$4::text)
          AND owner_user_id=ANY($5::text[])
        LIMIT 1`,
      leadId, context.tenantId, context.companyId, visibility.branchId, visibility.ownerUserIds,
    );
    if (!rows.length) throw new ForbiddenException('Bu potansiyel müşteri kaydına erişim yetkiniz yok.');
  }

  async assertOpportunityAccess(opportunityId: string) {
    const visibility = await this.resolve();
    if (!visibility.restrictOwners) return;
    const context = this.tenantContext.getContext();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM crm_opportunities
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
          AND ($4::text IS NULL OR branch_id=$4::text)
          AND owner_user_id=ANY($5::text[])
        LIMIT 1`,
      opportunityId, context.tenantId, context.companyId, visibility.branchId, visibility.ownerUserIds,
    );
    if (!rows.length) throw new ForbiddenException('Bu satış fırsatına erişim yetkiniz yok.');
  }

  async assertFollowUpAccess(followUpId: string) {
    const visibility = await this.resolve();
    if (!visibility.restrictOwners) return;
    const context = this.tenantContext.getContext();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT f.id
         FROM crm_follow_ups f
         LEFT JOIN crm_leads l ON l.id=f.lead_id
         LEFT JOIN crm_opportunities o ON o.id=f.opportunity_id
        WHERE f.id=$1::text AND f.tenant_id=$2::text AND f.company_id=$3::text
          AND ($4::text IS NULL OR f.branch_id=$4::text)
          AND (
            f.assigned_user_id=ANY($5::text[])
            OR l.owner_user_id=ANY($5::text[])
            OR o.owner_user_id=ANY($5::text[])
          )
        LIMIT 1`,
      followUpId, context.tenantId, context.companyId, visibility.branchId, visibility.ownerUserIds,
    );
    if (!rows.length) throw new ForbiddenException('Bu takip kaydına erişim yetkiniz yok.');
  }

  async assertOwnerAllowed(ownerUserId: string | null | undefined) {
    if (!ownerUserId) return;
    const visibility = await this.resolve();
    if (visibility.restrictOwners && !visibility.ownerUserIds.includes(ownerUserId)) {
      throw new BadRequestException('Bu kayıt seçilen sorumluya atanamaz. Yetki kapsamınızı kontrol edin.');
    }
  }

  async listSurveyorCandidates() {
    const context = this.tenantContext.getContext();
    if (!context.branchId) return [];
    return this.prisma.$queryRawUnsafe<Array<{
      staffId: string;
      firstName: string;
      lastName: string;
      active: boolean;
      dailyDeskQuota: number | null;
      weeklyDeskQuota: number | null;
    }>>(
      `SELECT s.id AS "staffId",s."firstName" AS "firstName",s."lastName" AS "lastName",
              COALESCE(p.active,FALSE) AS active,
              p.daily_desk_quota AS "dailyDeskQuota",
              p.weekly_desk_quota AS "weeklyDeskQuota"
         FROM staff s
         LEFT JOIN crm_surveyor_profiles p ON p.staff_id=s.id
        WHERE s."tenantId"=$1::text
          AND s."branchId"=$2::text
          AND s.status='ACTIVE'
        ORDER BY COALESCE(p.active,FALSE) DESC,s."firstName",s."lastName"`,
      context.tenantId,
      context.branchId,
    );
  }

  async upsertSurveyorProfile(
    staffId: string,
    input: { active: boolean; dailyDeskQuota?: number | null; weeklyDeskQuota?: number | null },
  ) {
    const context = this.tenantContext.getContext();
    if (!context.branchId) throw new BadRequestException('Anketör yönetimi için aktif bir şube seçilmelidir.');

    const staffRows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM staff
        WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text AND status='ACTIVE'
        LIMIT 1`,
      staffId,
      context.tenantId,
      context.branchId,
    );
    if (!staffRows.length) throw new BadRequestException('Seçilen çalışan aktif şubede bulunamadı.');

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO crm_surveyor_profiles(
         staff_id,tenant_id,company_id,branch_id,active,daily_desk_quota,weekly_desk_quota
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7)
       ON CONFLICT(staff_id) DO UPDATE SET
         tenant_id=EXCLUDED.tenant_id,
         company_id=EXCLUDED.company_id,
         branch_id=EXCLUDED.branch_id,
         active=EXCLUDED.active,
         daily_desk_quota=EXCLUDED.daily_desk_quota,
         weekly_desk_quota=EXCLUDED.weekly_desk_quota,
         updated_at=NOW()`,
      staffId,
      context.tenantId,
      context.companyId,
      context.branchId,
      input.active,
      input.dailyDeskQuota ?? null,
      input.weeklyDeskQuota ?? null,
    );

    return { success: true };
  }

  async listSurveyors() {
    const context = this.tenantContext.getContext();
    return this.prisma.$queryRawUnsafe<Array<{
      staffId: string;
      branchId: string;
      firstName: string;
      lastName: string;
      dailyDeskQuota: number | null;
      weeklyDeskQuota: number | null;
    }>>(
      `SELECT s.id AS "staffId",s."branchId" AS "branchId",s."firstName" AS "firstName",s."lastName" AS "lastName",
              p.daily_desk_quota AS "dailyDeskQuota",p.weekly_desk_quota AS "weeklyDeskQuota"
         FROM crm_surveyor_profiles p
         JOIN staff s ON s.id=p.staff_id
        WHERE p.tenant_id=$1::text
          AND p.company_id=$2::text
          AND p.active=TRUE
          AND s.status='ACTIVE'
          AND ($3::text IS NULL OR p.branch_id=$3::text)
        ORDER BY s."firstName",s."lastName",s.id`,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
  }
}
