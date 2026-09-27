import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type DbClient = PrismaService | Prisma.TransactionClient;

type AssignmentRule = {
  id: string;
  teamId: string | null;
  mode: 'MANUAL' | 'ROUND_ROBIN' | 'LOAD_BALANCED' | 'BRANCH_BASED' | 'SKILL_BASED';
  sourceFilter: string | null;
  skillKey: string | null;
  lastAssignedUserId: string | null;
};

@Injectable()
export class CrmAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  async resolveOwner(
    input: {
      branchId: string;
      source?: string | null;
      requestedOwnerUserId?: string | null;
      actorUserId: string;
    },
    db: DbClient = this.prisma,
  ): Promise<{ ownerUserId: string; ruleId: string | null; mode: string; reason: string }> {
    if (input.requestedOwnerUserId) {
      return {
        ownerUserId: input.requestedOwnerUserId,
        ruleId: null,
        mode: 'MANUAL',
        reason: 'Kullanıcı tarafından sorumlu seçildi.',
      };
    }

    const context = this.context();
    const rules = await db.$queryRawUnsafe<AssignmentRule[]>(
      `SELECT id,team_id AS "teamId",mode,source_filter AS "sourceFilter",
              skill_key AS "skillKey",last_assigned_user_id AS "lastAssignedUserId"
         FROM crm_assignment_rules
        WHERE tenant_id=$1::text AND company_id=$2::text
          AND active=TRUE
          AND (branch_id IS NULL OR branch_id=$3::text)
          AND (source_filter IS NULL OR source_filter=$4::text)
        ORDER BY CASE WHEN branch_id=$3::text THEN 0 ELSE 1 END,priority,id
        LIMIT 1`,
      context.tenantId,
      context.companyId,
      input.branchId,
      input.source ?? null,
    );

    const rule = rules[0];
    if (!rule || rule.mode === 'MANUAL') {
      return {
        ownerUserId: input.actorUserId,
        ruleId: rule?.id ?? null,
        mode: 'MANUAL',
        reason: rule ? 'Atama kuralı manuel modda.' : 'Aktif otomatik atama kuralı bulunamadı.',
      };
    }

    const candidates = await db.$queryRawUnsafe<Array<{ userId: string }>>(
      `SELECT DISTINCT tm.user_id AS "userId"
         FROM crm_team_members tm
         JOIN crm_teams t ON t.id=tm.team_id
         JOIN memberships m ON m."userId"=tm.user_id
        WHERE t.tenant_id=$1::text AND t.company_id=$2::text
          AND t.active=TRUE
          AND ($3::text IS NULL OR t.id=$3::text)
          AND (t.branch_id IS NULL OR t.branch_id=$4::text)
          AND m."tenantId"=$1::text AND m."companyId"=$2::text
          AND m.status='ACTIVE'
          AND (
            $5::text<>'SKILL_BASED'
            OR (
              $6::text IS NOT NULL
              AND EXISTS(
                SELECT 1
                  FROM crm_team_member_skills s
                 WHERE s.team_id=tm.team_id
                   AND s.user_id=tm.user_id
                   AND lower(s.skill_key)=lower($6::text)
              )
            )
          )
        ORDER BY tm.user_id`,
      context.tenantId,
      context.companyId,
      rule.teamId,
      input.branchId,
      rule.mode,
      rule.skillKey,
    );

    if (!candidates.length) {
      return {
        ownerUserId: input.actorUserId,
        ruleId: rule.id,
        mode: rule.mode,
        reason: rule.mode === 'SKILL_BASED'
          ? 'Atama kuralındaki yetkinliğe sahip aktif ekip üyesi bulunamadı.'
          : 'Atama kuralında uygun aktif ekip üyesi bulunamadı.',
      };
    }

    let ownerUserId = candidates[0].userId;

    if (rule.mode === 'ROUND_ROBIN' || rule.mode === 'BRANCH_BASED' || rule.mode === 'SKILL_BASED') {
      const currentIndex = candidates.findIndex((item) => item.userId === rule.lastAssignedUserId);
      ownerUserId = candidates[(currentIndex + 1 + candidates.length) % candidates.length].userId;
    }

    if (rule.mode === 'LOAD_BALANCED') {
      const candidateIds = candidates.map((item) => item.userId);
      const loads = await db.$queryRawUnsafe<Array<{ userId: string; openCount: number }>>(
        `SELECT u.user_id AS "userId",COUNT(l.id)::int AS "openCount"
           FROM unnest($1::text[]) AS u(user_id)
           LEFT JOIN crm_leads l ON l.owner_user_id=u.user_id
             AND l.tenant_id=$2::text AND l.company_id=$3::text AND l.branch_id=$4::text
             AND l.status NOT IN ('LOST','CONVERTED')
          GROUP BY u.user_id
          ORDER BY COUNT(l.id),u.user_id
          LIMIT 1`,
        candidateIds,
        context.tenantId,
        context.companyId,
        input.branchId,
      );
      ownerUserId = loads[0]?.userId ?? ownerUserId;
    }

    await db.$executeRawUnsafe(
      `UPDATE crm_assignment_rules
          SET last_assigned_user_id=$2::text,updated_at=NOW()
        WHERE id=$1::text`,
      rule.id,
      ownerUserId,
    );

    return {
      ownerUserId,
      ruleId: rule.id,
      mode: rule.mode,
      reason:
        rule.mode === 'LOAD_BALANCED'
          ? 'Açık potansiyel müşteri yükü en düşük ekip üyesine atandı.'
          : rule.mode === 'SKILL_BASED'
            ? `“${rule.skillKey ?? 'tanımlı'}” yetkinliğine sahip sıradaki ekip üyesine atandı.`
            : 'Sıradaki uygun ekip üyesine otomatik atandı.',
    };
  }

  async recordAssignment(
    input: {
      leadId: string;
      branchId: string;
      previousOwnerUserId?: string | null;
      assignedUserId: string;
      ruleId?: string | null;
      mode: string;
      reason?: string | null;
      assignedByUserId?: string | null;
    },
    db: DbClient = this.prisma,
  ) {
    const context = this.context();
    await db.$executeRawUnsafe(
      `INSERT INTO crm_assignment_history(
         tenant_id,company_id,branch_id,lead_id,rule_id,previous_owner_user_id,
         assigned_user_id,assignment_mode,reason,assigned_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8,$9,$10::text)`,
      context.tenantId,
      context.companyId,
      input.branchId,
      input.leadId,
      input.ruleId ?? null,
      input.previousOwnerUserId ?? null,
      input.assignedUserId,
      input.mode,
      input.reason ?? null,
      input.assignedByUserId ?? null,
    );
  }

  async listRules() {
    const context = this.context();
    return this.prisma.$queryRawUnsafe(
      `SELECT r.id,r.name,r.mode,r.branch_id AS "branchId",r.team_id AS "teamId",
              r.source_filter AS "sourceFilter",r.skill_key AS "skillKey",r.active,r.priority,
              r.last_assigned_user_id AS "lastAssignedUserId"
         FROM crm_assignment_rules r
        WHERE r.tenant_id=$1::text AND r.company_id=$2::text
          AND ($3::text IS NULL OR r.branch_id IS NULL OR r.branch_id=$3::text)
        ORDER BY r.priority,r.name,r.id`,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
  }

  async createRule(input: {
    name: string;
    mode: AssignmentRule['mode'];
    teamId?: string | null;
    sourceFilter?: string | null;
    skillKey?: string | null;
    priority?: number;
  }) {
    const context = this.context();
    if (!context.branchId) throw new BadRequestException('Atama kuralı için aktif bir şube seçilmelidir.');
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO crm_assignment_rules(
         tenant_id,company_id,branch_id,team_id,name,mode,source_filter,skill_key,priority
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8,$9)
       RETURNING id`,
      context.tenantId,
      context.companyId,
      context.branchId,
      input.teamId ?? null,
      input.name.trim(),
      input.mode,
      input.sourceFilter ?? null,
      input.skillKey ?? null,
      input.priority ?? 100,
    );
    return rows[0];
  }
}
