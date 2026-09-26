import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type SourceType = 'FEEDBACK' | 'CARE_EVENT' | 'MANUAL' | 'INCIDENT';

@Injectable()
export class QualitySlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private context() {
    return this.tenant.getContext();
  }

  async createPolicy(
    input: {
      name: string;
      version?: number;
      category?: string | null;
      sourceType?: SourceType | null;
      severity: Severity;
      dueMinutes: number;
      escalation2Minutes?: number | null;
      escalation3Minutes?: number | null;
      priority?: number;
      effectiveFrom?: string | null;
      effectiveTo?: string | null;
    },
    actorUserId: string,
  ) {
    const c = this.context();
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Policy name is required.');
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(input.severity)) {
      throw new BadRequestException('Invalid severity.');
    }
    const dueMinutes = Number(input.dueMinutes);
    const e2 = input.escalation2Minutes == null ? null : Number(input.escalation2Minutes);
    const e3 = input.escalation3Minutes == null ? null : Number(input.escalation3Minutes);
    if (!Number.isInteger(dueMinutes) || dueMinutes <= 0) throw new BadRequestException('dueMinutes must be a positive integer.');
    if (e2 != null && (!Number.isInteger(e2) || e2 < 0)) throw new BadRequestException('escalation2Minutes must be zero or greater.');
    if (e3 != null && (!Number.isInteger(e3) || e3 < (e2 ?? 0))) throw new BadRequestException('escalation3Minutes must be greater than or equal to escalation2Minutes.');
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    if (Number.isNaN(effectiveFrom.getTime()) || (effectiveTo && Number.isNaN(effectiveTo.getTime()))) throw new BadRequestException('Invalid effective date.');
    if (effectiveTo && effectiveTo <= effectiveFrom) throw new BadRequestException('effectiveTo must be after effectiveFrom.');

    return this.prisma.$transaction(async (tx) => {
      let version = input.version == null ? null : Number(input.version);
      if (version == null) {
        const v = await tx.$queryRawUnsafe<any[]>(
          `SELECT COALESCE(MAX(version),0)+1 AS version FROM quality_sla_policies WHERE tenant_id=$1::text AND company_id=$2::text AND name=$3`,
          c.tenantId,
          c.companyId,
          name,
        );
        version = Number(v[0]?.version ?? 1);
      }
      if (!Number.isInteger(version) || version <= 0) throw new BadRequestException('version must be a positive integer.');
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO quality_sla_policies(
           tenant_id,company_id,name,version,category,source_type,severity,due_minutes,
           escalation_2_minutes,escalation_3_minutes,priority,effective_from,effective_to,created_by_user_id
         ) VALUES($1::text,$2::text,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::text)
         RETURNING id,name,version,category,source_type AS "sourceType",severity,due_minutes AS "dueMinutes",
                   escalation_2_minutes AS "escalation2Minutes",escalation_3_minutes AS "escalation3Minutes",
                   priority,is_active AS "isActive",effective_from AS "effectiveFrom",effective_to AS "effectiveTo"`,
        c.tenantId,c.companyId,name,version,input.category?.trim()||null,input.sourceType??null,input.severity,
        dueMinutes,e2,e3,input.priority??100,effectiveFrom,effectiveTo,actorUserId,
      );
      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listPolicies(limit = 100) {
    const c = this.context();
    const bounded = Math.min(Math.max(limit, 1), 200);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,name,version,category,source_type AS "sourceType",severity,due_minutes AS "dueMinutes",
              escalation_2_minutes AS "escalation2Minutes",escalation_3_minutes AS "escalation3Minutes",
              priority,is_active AS "isActive",effective_from AS "effectiveFrom",effective_to AS "effectiveTo",created_at AS "createdAt"
       FROM quality_sla_policies
       WHERE tenant_id=$1::text AND company_id=$2::text
       ORDER BY is_active DESC, priority ASC, name ASC, version DESC
       LIMIT $3`,
      c.tenantId,c.companyId,bounded,
    );
  }

  async applyPolicies(actorUserId: string, limit = 100) {
    const c = this.context();
    const bounded = Math.min(Math.max(limit, 1), 200);
    const rows = await this.prisma.$transaction(async (tx) => {
      return tx.$queryRawUnsafe<any[]>(
        `WITH candidates AS (
           SELECT q.id
           FROM quality_cases q
           WHERE q.tenant_id=$1::text AND q.company_id=$2::text
             AND ($3::text IS NULL OR q.branch_id=$3::text)
             AND q.status NOT IN ('RESOLVED','CLOSED')
             AND q.sla_due_at IS NULL
             AND q.sla_policy_id IS NULL
           ORDER BY q.opened_at ASC
           LIMIT $4
           FOR UPDATE SKIP LOCKED
         ), matched AS (
           SELECT q.id AS case_id,p.id AS policy_id,p.version,p.due_minutes,p.escalation_2_minutes,p.escalation_3_minutes
           FROM quality_cases q
           JOIN candidates c ON c.id=q.id
           JOIN LATERAL (
             SELECT p.*
             FROM quality_sla_policies p
             WHERE p.tenant_id=q.tenant_id AND p.company_id=q.company_id
               AND p.is_active=true
               AND p.severity=q.severity
               AND (p.category IS NULL OR p.category=q.category)
               AND (p.source_type IS NULL OR p.source_type=q.source_type)
               AND p.effective_from <= NOW()
               AND (p.effective_to IS NULL OR p.effective_to > NOW())
             ORDER BY
               (CASE WHEN p.category IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN p.source_type IS NOT NULL THEN 1 ELSE 0 END) DESC,
               p.priority ASC,p.version DESC
             LIMIT 1
           ) p ON true
         ), updated AS (
           UPDATE quality_cases q
           SET sla_policy_id=m.policy_id,
               sla_policy_version=m.version,
               sla_policy_applied_at=NOW(),
               sla_due_at=q.opened_at + make_interval(mins => m.due_minutes),
               sla_escalation_2_at=CASE WHEN m.escalation_2_minutes IS NULL THEN NULL ELSE q.opened_at + make_interval(mins => m.due_minutes+m.escalation_2_minutes) END,
               sla_escalation_3_at=CASE WHEN m.escalation_3_minutes IS NULL THEN NULL ELSE q.opened_at + make_interval(mins => m.due_minutes+m.escalation_3_minutes) END,
               updated_by_user_id=$5::text,updated_at=NOW()
           FROM matched m
           WHERE q.id=m.case_id
           RETURNING q.id,q.tenant_id,q.company_id,q.branch_id,q.status,q.assigned_user_id,q.sla_due_at,q.sla_policy_id,q.sla_policy_version
         )
         INSERT INTO quality_case_events(case_id,tenant_id,company_id,branch_id,event_type,from_status,to_status,assigned_user_id,note,actor_user_id)
         SELECT u.id,u.tenant_id,u.company_id,u.branch_id,'SLA_POLICY_APPLIED',u.status,u.status,u.assigned_user_id,
                CONCAT('SLA policy ',u.sla_policy_id,' v',u.sla_policy_version,' applied'),$5::text
         FROM updated u
         ON CONFLICT DO NOTHING
         RETURNING case_id AS "caseId"`,
        c.tenantId,c.companyId,c.branchId,bounded,actorUserId,
      );
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { processed: rows.length, cases: rows };
  }

  async listBreaches(limit = 50) {
    const c = this.context();
    const bounded = Math.min(Math.max(limit, 1), 200);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT q.id,q.branch_id AS "branchId",q.status,q.severity,q.title,q.assigned_user_id AS "assignedUserId",
              q.sla_due_at AS "slaDueAt",q.sla_breached_at AS "slaBreachedAt",q.sla_escalation_level AS "slaEscalationLevel",
              q.sla_policy_id AS "slaPolicyId",q.sla_policy_version AS "slaPolicyVersion",
              q.sla_escalation_2_at AS "slaEscalation2At",q.sla_escalation_3_at AS "slaEscalation3At"
       FROM quality_cases q
       WHERE q.tenant_id=$1::text AND q.company_id=$2::text
         AND ($3::text IS NULL OR q.branch_id=$3::text)
         AND q.sla_breached_at IS NOT NULL AND q.status NOT IN ('RESOLVED','CLOSED')
       ORDER BY q.sla_breached_at DESC LIMIT $4`,
      c.tenantId,c.companyId,c.branchId,bounded,
    );
  }

  async processOverdue(actorUserId: string, limit = 100) {
    const c = this.context();
    const bounded = Math.min(Math.max(limit, 1), 200);
    const rows = await this.prisma.$transaction(async (tx) => {
      return tx.$queryRawUnsafe<any[]>(
        `WITH candidates AS (
           SELECT q.id,
                  CASE
                    WHEN q.sla_escalation_3_at IS NOT NULL AND q.sla_escalation_3_at < NOW() THEN 3
                    WHEN q.sla_escalation_2_at IS NOT NULL AND q.sla_escalation_2_at < NOW() THEN 2
                    WHEN q.sla_due_at IS NOT NULL AND q.sla_due_at < NOW() THEN 1
                    ELSE 0
                  END AS target_level
           FROM quality_cases q
           WHERE q.tenant_id=$1::text AND q.company_id=$2::text
             AND ($3::text IS NULL OR q.branch_id=$3::text)
             AND q.status NOT IN ('RESOLVED','CLOSED')
             AND q.sla_due_at IS NOT NULL
             AND q.sla_due_at < NOW()
           ORDER BY q.sla_due_at ASC LIMIT $4
           FOR UPDATE SKIP LOCKED
         ), updated AS (
           UPDATE quality_cases q
           SET sla_breached_at=COALESCE(q.sla_breached_at,NOW()),
               sla_escalation_level=GREATEST(q.sla_escalation_level,c.target_level),
               updated_by_user_id=$5::text,updated_at=NOW()
           FROM candidates c
           WHERE q.id=c.id AND c.target_level>q.sla_escalation_level
           RETURNING q.id,q.tenant_id,q.company_id,q.branch_id,q.status,q.assigned_user_id,q.sla_due_at,q.sla_breached_at,q.sla_escalation_level
         ), breach_events AS (
           INSERT INTO quality_case_events(case_id,tenant_id,company_id,branch_id,event_type,from_status,to_status,assigned_user_id,note,actor_user_id)
           SELECT u.id,u.tenant_id,u.company_id,u.branch_id,'SLA_BREACHED',u.status,u.status,u.assigned_user_id,'SLA due time exceeded',$5::text
           FROM updated u WHERE u.sla_escalation_level>=1
           ON CONFLICT DO NOTHING RETURNING case_id
         ), escalation_events AS (
           INSERT INTO quality_case_events(case_id,tenant_id,company_id,branch_id,event_type,from_status,to_status,assigned_user_id,note,actor_user_id)
           SELECT u.id,u.tenant_id,u.company_id,u.branch_id,'SLA_ESCALATED',u.status,u.status,u.assigned_user_id,
                  CONCAT('SLA escalation level ',u.sla_escalation_level),$5::text
           FROM updated u WHERE u.sla_escalation_level>=2
           ON CONFLICT DO NOTHING RETURNING case_id
         )
         SELECT u.id,u.branch_id AS "branchId",u.status,u.assigned_user_id AS "assignedUserId",u.sla_due_at AS "slaDueAt",
                u.sla_breached_at AS "slaBreachedAt",u.sla_escalation_level AS "slaEscalationLevel"
         FROM updated u ORDER BY u.sla_due_at ASC`,
        c.tenantId,c.companyId,c.branchId,bounded,actorUserId,
      );
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { processed: rows.length, cases: rows };
  }
}
