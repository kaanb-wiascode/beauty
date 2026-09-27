import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class CrmTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private requireBranchId() {
    const branchId = this.context().branchId;
    if (!branchId) throw new BadRequestException('CRM ekibi için aktif bir şube seçilmelidir.');
    return branchId;
  }

  private async assertActiveUser(userId: string) {
    const context = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u.id
         FROM users u
         JOIN memberships m ON m."userId"=u.id
        WHERE u.id=$1::text AND m."tenantId"=$2::text AND m."companyId"=$3::text
          AND m.status='ACTIVE'
        LIMIT 1`,
      userId,
      context.tenantId,
      context.companyId,
    );
    if (!rows.length) throw new BadRequestException('Seçilen kullanıcı aktif şirket üyesi değil.');
  }

  async list() {
    const context = this.context();
    return this.prisma.$queryRawUnsafe(
      `SELECT t.id,t.name,t.branch_id AS "branchId",t.manager_user_id AS "managerUserId",t.active,
              mu."firstName" AS "managerFirstName",mu."lastName" AS "managerLastName",
              COALESCE(json_agg(json_build_object(
                'userId',u.id,
                'firstName',u."firstName",
                'lastName',u."lastName",
                'email',u.email,
                'skills',COALESCE((
                  SELECT json_agg(s.skill_key ORDER BY s.skill_key)
                    FROM crm_team_member_skills s
                   WHERE s.team_id=t.id AND s.user_id=u.id
                ),'[]'::json)
              ) ORDER BY u."firstName",u."lastName") FILTER (WHERE u.id IS NOT NULL),'[]'::json) AS members
         FROM crm_teams t
         LEFT JOIN users mu ON mu.id=t.manager_user_id
         LEFT JOIN crm_team_members tm ON tm.team_id=t.id
         LEFT JOIN users u ON u.id=tm.user_id
        WHERE t.tenant_id=$1::text AND t.company_id=$2::text
          AND ($3::text IS NULL OR t.branch_id IS NULL OR t.branch_id=$3::text)
        GROUP BY t.id,mu."firstName",mu."lastName"
        ORDER BY t.active DESC,t.name,t.id`,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
  }

  async create(input: { name: string; managerUserId: string }) {
    const context = this.context();
    const branchId = this.requireBranchId();
    await this.assertActiveUser(input.managerUserId);
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO crm_teams(tenant_id,company_id,branch_id,name,manager_user_id)
       VALUES($1::text,$2::text,$3::text,$4,$5::text)
       RETURNING id`,
      context.tenantId,
      context.companyId,
      branchId,
      input.name.trim(),
      input.managerUserId,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO crm_team_members(team_id,user_id)
       VALUES($1::text,$2::text)
       ON CONFLICT(team_id,user_id) DO NOTHING`,
      rows[0].id,
      input.managerUserId,
    );
    return rows[0];
  }

  async addMember(teamId: string, userId: string) {
    const context = this.context();
    await this.assertActiveUser(userId);
    const teams = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM crm_teams
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
          AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text)
        LIMIT 1`,
      teamId,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
    if (!teams.length) throw new NotFoundException('CRM ekibi bulunamadı.');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO crm_team_members(team_id,user_id)
       VALUES($1::text,$2::text)
       ON CONFLICT(team_id,user_id) DO NOTHING`,
      teamId,
      userId,
    );
    return { success: true };
  }

  async setMemberSkills(teamId: string, userId: string, skills: string[]) {
    const context = this.context();
    const teams = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT t.id
         FROM crm_teams t
         JOIN crm_team_members tm ON tm.team_id=t.id AND tm.user_id=$2::text
        WHERE t.id=$1::text AND t.tenant_id=$3::text AND t.company_id=$4::text
          AND ($5::text IS NULL OR t.branch_id IS NULL OR t.branch_id=$5::text)
        LIMIT 1`,
      teamId,
      userId,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
    if (!teams.length) throw new NotFoundException('CRM ekip üyesi bulunamadı.');

    const normalized = [...new Set(
      skills
        .map((skill) => skill.trim().toLocaleLowerCase('tr-TR'))
        .filter(Boolean),
    )].slice(0, 30);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `DELETE FROM crm_team_member_skills WHERE team_id=$1::text AND user_id=$2::text`,
        teamId,
        userId,
      );
      for (const skill of normalized) {
        await tx.$executeRawUnsafe(
          `INSERT INTO crm_team_member_skills(team_id,user_id,skill_key)
           VALUES($1::text,$2::text,$3)
           ON CONFLICT(team_id,user_id,skill_key) DO NOTHING`,
          teamId,
          userId,
          skill,
        );
      }
    });

    return { success: true, skills: normalized };
  }

  async removeMember(teamId: string, userId: string) {
    const context = this.context();
    const teams = await this.prisma.$queryRawUnsafe<Array<{ managerUserId: string }>>(
      `SELECT manager_user_id AS "managerUserId" FROM crm_teams
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
          AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text)
        LIMIT 1`,
      teamId,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
    if (!teams.length) throw new NotFoundException('CRM ekibi bulunamadı.');
    if (teams[0].managerUserId === userId) {
      throw new BadRequestException('Ekip yöneticisi ekipten çıkarılamaz. Önce ekip yöneticisini değiştirin.');
    }
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM crm_team_members WHERE team_id=$1::text AND user_id=$2::text`,
      teamId,
      userId,
    );
    return { success: true };
  }
}
