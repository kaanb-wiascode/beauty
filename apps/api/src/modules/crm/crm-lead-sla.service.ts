import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type CrmLeadSlaScope = {
  tenantId: string;
  companyId: string;
  branchId: string;
};

export type LeadSlaPolicyInput = {
  warningMinutes: number;
  breachMinutes: number;
  ownerEscalationMinutes: number;
  managerEscalationMinutes: number;
  reassignmentEscalationMinutes: number;
  version: number;
};

type DbClient = Prisma.TransactionClient | PrismaService;

type LeadSlaPolicyRow = {
  warningMinutes: number;
  breachMinutes: number;
  ownerEscalationMinutes: number;
  managerEscalationMinutes: number;
  reassignmentEscalationMinutes: number;
  version: number;
  updatedAt: Date | null;
};

const DEFAULT_POLICY: LeadSlaPolicyRow = {
  warningMinutes: 5,
  breachMinutes: 15,
  ownerEscalationMinutes: 10,
  managerEscalationMinutes: 20,
  reassignmentEscalationMinutes: 30,
  version: 0,
  updatedAt: null,
};

@Injectable()
export class CrmLeadSlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private scope(): CrmLeadSlaScope {
    const context = this.tenantContext.getContext();
    if (!context.branchId) throw new BadRequestException('Lead SLA requires an active branch.');
    return { tenantId: context.tenantId, companyId: context.companyId, branchId: context.branchId };
  }

  async getPolicy() {
    const scope = this.scope();
    const rows = await this.prisma.$queryRawUnsafe<LeadSlaPolicyRow[]>(
      `SELECT warning_minutes AS "warningMinutes",breach_minutes AS "breachMinutes",
              owner_escalation_minutes AS "ownerEscalationMinutes",
              manager_escalation_minutes AS "managerEscalationMinutes",
              reassignment_escalation_minutes AS "reassignmentEscalationMinutes",
              version,updated_at AS "updatedAt"
       FROM crm_lead_sla_policies
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text LIMIT 1`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
    return rows[0] ?? DEFAULT_POLICY;
  }

  async updatePolicy(input: LeadSlaPolicyInput, actorUserId: string) {
    const scope = this.scope();
    const policy = await this.prisma.$transaction(async (tx) => {
      let rows: LeadSlaPolicyRow[];
      if (input.version === 0) {
        rows = await tx.$queryRawUnsafe<LeadSlaPolicyRow[]>(
          `INSERT INTO crm_lead_sla_policies(
             tenant_id,company_id,branch_id,warning_minutes,breach_minutes,
             owner_escalation_minutes,manager_escalation_minutes,reassignment_escalation_minutes,
             created_by_user_id,updated_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8,$9::text,$9::text)
           ON CONFLICT(tenant_id,company_id,branch_id) DO NOTHING
           RETURNING warning_minutes AS "warningMinutes",breach_minutes AS "breachMinutes",
                     owner_escalation_minutes AS "ownerEscalationMinutes",
                     manager_escalation_minutes AS "managerEscalationMinutes",
                     reassignment_escalation_minutes AS "reassignmentEscalationMinutes",
                     version,updated_at AS "updatedAt"`,
          scope.tenantId,
          scope.companyId,
          scope.branchId,
          input.warningMinutes,
          input.breachMinutes,
          input.ownerEscalationMinutes,
          input.managerEscalationMinutes,
          input.reassignmentEscalationMinutes,
          actorUserId,
        );
        if (!rows[0]) throw new ConflictException('Lead SLA policy already exists. Refresh and retry.');
      } else {
        rows = await tx.$queryRawUnsafe<LeadSlaPolicyRow[]>(
          `UPDATE crm_lead_sla_policies SET
             warning_minutes=$4,breach_minutes=$5,owner_escalation_minutes=$6,
             manager_escalation_minutes=$7,reassignment_escalation_minutes=$8,
             updated_by_user_id=$9::text,version=version+1,updated_at=NOW()
           WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND version=$10
           RETURNING warning_minutes AS "warningMinutes",breach_minutes AS "breachMinutes",
                     owner_escalation_minutes AS "ownerEscalationMinutes",
                     manager_escalation_minutes AS "managerEscalationMinutes",
                     reassignment_escalation_minutes AS "reassignmentEscalationMinutes",
                     version,updated_at AS "updatedAt"`,
          scope.tenantId,
          scope.companyId,
          scope.branchId,
          input.warningMinutes,
          input.breachMinutes,
          input.ownerEscalationMinutes,
          input.managerEscalationMinutes,
          input.reassignmentEscalationMinutes,
          actorUserId,
          input.version,
        );
        if (!rows[0]) throw new ConflictException('Lead SLA policy changed. Refresh and retry.');
      }

      const saved = rows[0];
      await tx.$executeRawUnsafe(
        `UPDATE crm_lead_sla_clocks SET
           policy_version=$4,warning_due_at=started_at+($5::int*INTERVAL '1 minute'),
           breach_due_at=started_at+($6::int*INTERVAL '1 minute'),
           owner_escalation_due_at=started_at+($7::int*INTERVAL '1 minute'),
           manager_escalation_due_at=started_at+($8::int*INTERVAL '1 minute'),
           reassignment_due_at=started_at+($9::int*INTERVAL '1 minute'),
           version=version+1,updated_at=NOW()
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND completed_at IS NULL`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
        saved.version,
        saved.warningMinutes,
        saved.breachMinutes,
        saved.ownerEscalationMinutes,
        saved.managerEscalationMinutes,
        saved.reassignmentEscalationMinutes,
      );
      return saved;
    });
    await this.processDueEscalations(scope);
    return policy;
  }

  async dashboard() {
    const scope = this.scope();
    const [summaryRows, breaches, owners, escalations] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<Record<string, number>>>(
        `WITH clocks AS (
           SELECT c.*,
             CASE
               WHEN c.completed_at IS NOT NULL THEN 'COMPLETED'
               WHEN NOW()>=c.breach_due_at THEN 'BREACHED'
               WHEN NOW()>=c.warning_due_at THEN 'WARNING'
               ELSE 'HEALTHY'
             END AS effective_status,
             CASE WHEN c.completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (c.completed_at-c.started_at))/60.0 END AS response_minutes
           FROM crm_lead_sla_clocks c
           WHERE c.tenant_id=$1::text AND c.company_id=$2::text AND c.branch_id=$3::text
         ), aggregate AS (
           SELECT COUNT(*)::int AS total_assigned,
             COUNT(*) FILTER(WHERE completed_at IS NULL)::int AS open_clocks,
             COUNT(*) FILTER(WHERE effective_status='HEALTHY')::int AS healthy,
             COUNT(*) FILTER(WHERE effective_status='WARNING')::int AS warning,
             COUNT(*) FILTER(WHERE effective_status='BREACHED')::int AS breached,
             COUNT(*) FILTER(WHERE completed_at IS NOT NULL)::int AS completed,
             COUNT(*) FILTER(WHERE completed_at IS NOT NULL AND completed_at<=breach_due_at)::int AS compliant,
             COALESCE(AVG(response_minutes) FILTER(WHERE completed_at IS NOT NULL),0)::double precision AS avg_response,
             COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY response_minutes) FILTER(WHERE completed_at IS NOT NULL),0)::double precision AS median_response
           FROM clocks
         )
         SELECT total_assigned AS "totalAssigned",open_clocks AS "openClocks",healthy,warning,breached,
                completed,compliant,ROUND(avg_response::numeric,1)::double precision AS "averageFirstResponseMinutes",
                ROUND(median_response::numeric,1)::double precision AS "medianFirstResponseMinutes",
                CASE WHEN completed=0 THEN 100 ELSE ROUND((compliant::numeric/completed::numeric)*100,1)::double precision END AS "slaComplianceRate",
                (SELECT COUNT(*)::int FROM crm_leads l WHERE l.tenant_id=$1::text AND l.company_id=$2::text AND l.branch_id=$3::text
                   AND l.owner_user_id IS NULL AND l.status NOT IN ('CONVERTED','LOST')) AS "unassignedLeads",
                (SELECT COUNT(*)::int FROM crm_leads l WHERE l.tenant_id=$1::text AND l.company_id=$2::text AND l.branch_id=$3::text
                   AND l.status='NEW' AND l.owner_user_id IS NULL) AS "assignmentBacklog"
         FROM aggregate`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
      ),
      this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT c.lead_id AS "leadId",TRIM(CONCAT(l.first_name,' ',l.last_name)) AS "leadName",
                l.lead_score AS "leadScore",l.lead_temperature AS "leadTemperature",l.owner_user_id AS "ownerUserId",
                NULLIF(TRIM(CONCAT(COALESCE(u."firstName",''),' ',COALESCE(u."lastName",''))),'') AS "ownerName",
                c.started_at AS "startedAt",c.breach_due_at AS "breachDueAt",
                FLOOR(EXTRACT(EPOCH FROM (NOW()-c.breach_due_at))/60)::int AS "breachAgeMinutes",
                c.last_escalation_level AS "lastEscalationLevel"
         FROM crm_lead_sla_clocks c
         JOIN crm_leads l ON l.id=c.lead_id AND l.tenant_id=c.tenant_id AND l.company_id=c.company_id AND l.branch_id=c.branch_id
         LEFT JOIN users u ON u.id=l.owner_user_id
         WHERE c.tenant_id=$1::text AND c.company_id=$2::text AND c.branch_id=$3::text
           AND c.completed_at IS NULL AND NOW()>=c.breach_due_at
         ORDER BY c.breach_due_at,c.lead_id LIMIT 100`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
      ),
      this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT l.owner_user_id AS "ownerUserId",
                NULLIF(TRIM(CONCAT(COALESCE(u."firstName",''),' ',COALESCE(u."lastName",''))),'') AS "ownerName",
                COUNT(*) FILTER(WHERE l.status NOT IN ('CONVERTED','LOST'))::int AS "openLeads",
                COUNT(*) FILTER(WHERE c.completed_at IS NULL)::int AS "openSlaClocks",
                COUNT(*) FILTER(WHERE c.completed_at IS NULL AND NOW()>=c.breach_due_at)::int AS "breachedSla",
                COUNT(*) FILTER(WHERE l.status='CONVERTED')::int AS converted,
                COUNT(*)::int AS total,
                CASE WHEN COUNT(*)=0 THEN 0 ELSE ROUND((COUNT(*) FILTER(WHERE l.status='CONVERTED')::numeric/COUNT(*)::numeric)*100,1)::double precision END AS "conversionRate"
         FROM crm_leads l
         LEFT JOIN users u ON u.id=l.owner_user_id
         LEFT JOIN crm_lead_sla_clocks c ON c.lead_id=l.id AND c.tenant_id=l.tenant_id AND c.company_id=l.company_id AND c.branch_id=l.branch_id
         WHERE l.tenant_id=$1::text AND l.company_id=$2::text AND l.branch_id=$3::text AND l.owner_user_id IS NOT NULL
         GROUP BY l.owner_user_id,u."firstName",u."lastName"
         ORDER BY "breachedSla" DESC,"openLeads" DESC,"ownerUserId"`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
      ),
      this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT e.id,e.lead_id AS "leadId",e.owner_user_id AS "ownerUserId",e.event_type AS "eventType",
                e.escalation_level AS "escalationLevel",e.metadata,e.created_at AS "createdAt"
         FROM crm_lead_sla_events e
         WHERE e.tenant_id=$1::text AND e.company_id=$2::text AND e.branch_id=$3::text
         ORDER BY e.created_at DESC,e.id DESC LIMIT 50`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
      ),
    ]);

    return {
      summary: summaryRows[0] ?? {
        totalAssigned: 0,
        openClocks: 0,
        healthy: 0,
        warning: 0,
        breached: 0,
        completed: 0,
        compliant: 0,
        averageFirstResponseMinutes: 0,
        medianFirstResponseMinutes: 0,
        slaComplianceRate: 100,
        unassignedLeads: 0,
        assignmentBacklog: 0,
      },
      breaches,
      owners,
      escalations,
    };
  }

  processCurrentScope() {
    return this.processDueEscalations(this.scope());
  }

  async processDueEscalations(scope: CrmLeadSlaScope) {
    return this.prisma.$transaction(async (tx) => this.processDueEscalationsWithClient(scope, tx));
  }

  private async processDueEscalationsWithClient(scope: CrmLeadSlaScope, tx: DbClient) {
    await tx.$executeRawUnsafe(
      `UPDATE crm_lead_sla_clocks SET
         status=CASE WHEN NOW()>=breach_due_at THEN 'BREACHED' WHEN NOW()>=warning_due_at THEN 'WARNING' ELSE 'HEALTHY' END,
         version=version+1,updated_at=NOW()
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND completed_at IS NULL
         AND status IS DISTINCT FROM CASE WHEN NOW()>=breach_due_at THEN 'BREACHED' WHEN NOW()>=warning_due_at THEN 'WARNING' ELSE 'HEALTHY' END`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );

    const created = await tx.$queryRawUnsafe<Array<{ clockId: string; eventType: string; escalationLevel: number }>>(
      `WITH due AS (
         SELECT c.id AS clock_id,c.tenant_id,c.company_id,c.branch_id,c.lead_id,c.owner_user_id,
                e.event_type,e.escalation_level,e.due_at,c.status
         FROM crm_lead_sla_clocks c
         CROSS JOIN LATERAL (VALUES
           ('OWNER_ESCALATED'::text,1,c.owner_escalation_due_at),
           ('MANAGER_ESCALATED'::text,2,c.manager_escalation_due_at),
           ('REASSIGNMENT_REQUIRED'::text,3,c.reassignment_due_at)
         ) AS e(event_type,escalation_level,due_at)
         WHERE c.tenant_id=$1::text AND c.company_id=$2::text AND c.branch_id=$3::text
           AND c.completed_at IS NULL AND e.due_at<=NOW()
       )
       INSERT INTO crm_lead_sla_events(
         clock_id,tenant_id,company_id,branch_id,lead_id,owner_user_id,event_type,escalation_level,metadata
       )
       SELECT clock_id,tenant_id,company_id,branch_id,lead_id,owner_user_id,event_type,escalation_level,
              jsonb_build_object('dueAt',due_at,'clockStatus',status,'systemGenerated',TRUE)
       FROM due
       ON CONFLICT(clock_id,event_type) DO NOTHING
       RETURNING clock_id AS "clockId",event_type AS "eventType",escalation_level AS "escalationLevel"`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );

    await tx.$executeRawUnsafe(
      `UPDATE crm_lead_sla_clocks c SET
         last_escalation_level=events.max_level,version=c.version+1,updated_at=NOW()
       FROM (
         SELECT clock_id,MAX(escalation_level)::int AS max_level
         FROM crm_lead_sla_events
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
         GROUP BY clock_id
       ) events
       WHERE c.id=events.clock_id AND c.last_escalation_level<events.max_level`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );

    return { created: created.length, events: created };
  }
}
