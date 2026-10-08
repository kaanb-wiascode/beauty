import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type FollowupStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';
type TargetStatus = Exclude<FollowupStatus, 'OPEN'>;

@Injectable()
export class TrainingEffectivenessFollowupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  private bounded(value: unknown, fallback: number, min: number, max: number) {
    const number = Math.trunc(Number(value ?? fallback));
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(number, min), max);
  }

  async process(
    actorUserId: string,
    input: { dueDays?: number; limit?: number } = {},
  ) {
    const c = this.context();
    const dueDays = this.bounded(input.dueDays, 14, 1, 365);
    const limit = this.bounded(input.limit, 50, 1, 200);

    return this.prisma.$transaction(
      async (tx) => {
        const runs = await tx.$queryRawUnsafe<any[]>(
          `SELECT er.id,er.branch_id AS "branchId",er.assignment_id AS "assignmentId",er.staff_id AS "staffId",
                  er.finding_category AS "findingCategory",er.pre_finding_count AS "preFindingCount",
                  er.post_finding_count AS "postFindingCount",er.improvement_pct AS "improvementPct",
                  er.outcome,er.calculated_at AS "calculatedAt"
           FROM training_effectiveness_runs er
           WHERE er.tenant_id=$1::text
             AND er.company_id=$2::text
             AND ($3::text IS NULL OR er.branch_id=$3::text)
             AND er.outcome IN ('WORSE','STABLE','INSUFFICIENT_BASELINE')
             AND NOT EXISTS (
               SELECT 1 FROM training_effectiveness_followups ef
               WHERE ef.tenant_id=er.tenant_id
                 AND ef.company_id=er.company_id
                 AND ef.effectiveness_run_id=er.id
             )
           ORDER BY er.calculated_at,er.id
           FOR UPDATE OF er SKIP LOCKED
           LIMIT $4`,
          c.tenantId,
          c.companyId,
          c.branchId,
          limit,
        );

        let created = 0;
        const actionCounts = {
          investigateRootCause: 0,
          reassessCompetency: 0,
          reviewBaselineData: 0,
        };

        for (const run of runs) {
          const actionType =
            run.outcome === 'WORSE'
              ? 'INVESTIGATE_ROOT_CAUSE'
              : run.outcome === 'STABLE'
                ? 'REASSESS_COMPETENCY'
                : 'REVIEW_BASELINE_DATA';
          const priority = run.outcome === 'WORSE' ? 'HIGH' : 'NORMAL';
          const rationale = {
            source: 'TRAINING_EFFECTIVENESS',
            effectivenessRunId: run.id,
            outcome: run.outcome,
            findingCategory: run.findingCategory,
            preFindingCount: Number(run.preFindingCount ?? 0),
            postFindingCount: Number(run.postFindingCount ?? 0),
            improvementPct:
              run.improvementPct == null ? null : Number(run.improvementPct),
            automaticDecision: false,
            managerReviewRequired: true,
          };
          const inserted = await tx.$queryRawUnsafe<any[]>(
            `INSERT INTO training_effectiveness_followups(
               tenant_id,company_id,branch_id,effectiveness_run_id,assignment_id,staff_id,
               action_type,priority,status,rationale,due_at,created_by_user_id
             )
             VALUES(
               $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,
               $7,$8,'OPEN',$9::jsonb,now()+($10::int*interval '1 day'),$11::text
             )
             ON CONFLICT(tenant_id,company_id,effectiveness_run_id) DO NOTHING
             RETURNING id`,
            c.tenantId,
            c.companyId,
            run.branchId,
            run.id,
            run.assignmentId,
            run.staffId ?? null,
            actionType,
            priority,
            JSON.stringify(rationale),
            dueDays,
            actorUserId,
          );
          if (!inserted.length) continue;
          created += 1;
          if (actionType === 'INVESTIGATE_ROOT_CAUSE') {
            actionCounts.investigateRootCause += 1;
          } else if (actionType === 'REASSESS_COMPETENCY') {
            actionCounts.reassessCompetency += 1;
          } else {
            actionCounts.reviewBaselineData += 1;
          }
          await tx.$executeRawUnsafe(
            `INSERT INTO training_effectiveness_followup_events(
               tenant_id,company_id,branch_id,followup_id,event_type,from_status,to_status,actor_user_id,metadata
             )
             VALUES($1::text,$2::text,$3::text,$4::text,'OPENED',NULL,'OPEN',$5::text,$6::jsonb)`,
            c.tenantId,
            c.companyId,
            run.branchId,
            inserted[0].id,
            actorUserId,
            JSON.stringify(rationale),
          );
        }

        return {
          claimed: runs.length,
          created,
          dueDays,
          ...actionCounts,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async list(
    input: {
      branchId?: string;
      staffId?: string;
      status?: string;
      limit?: number;
    } = {},
  ) {
    const c = this.context();
    if (c.branchId && input.branchId && input.branchId !== c.branchId) {
      throw new BadRequestException('branchId is outside the active branch scope.');
    }
    const status = input.status?.trim().toUpperCase() || null;
    if (
      status &&
      !['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED'].includes(status)
    ) {
      throw new BadRequestException('Unsupported follow-up status.');
    }
    const limit = this.bounded(input.limit, 100, 1, 200);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT ef.id,ef.branch_id AS "branchId",ef.effectiveness_run_id AS "effectivenessRunId",
              ef.assignment_id AS "assignmentId",ef.staff_id AS "staffId",ef.action_type AS "actionType",
              ef.priority,ef.status,ef.rationale,ef.due_at AS "dueAt",ef.acknowledged_at AS "acknowledgedAt",
              ef.resolved_at AS "resolvedAt",ef.resolution_note AS "resolutionNote",ef.cancelled_at AS "cancelledAt",
              ef.cancellation_reason AS "cancellationReason",ef.created_at AS "createdAt",
              er.outcome,er.improvement_pct AS "improvementPct",er.pre_finding_count AS "preFindingCount",
              er.post_finding_count AS "postFindingCount",er.finding_category AS "findingCategory",
              tc.code AS "courseCode",tc.title AS "courseTitle"
       FROM training_effectiveness_followups ef
       JOIN training_effectiveness_runs er ON er.id=ef.effectiveness_run_id
       JOIN training_assignments ta ON ta.id=ef.assignment_id
       JOIN training_courses tc ON tc.id=ta.course_id
       WHERE ef.tenant_id=$1::text
         AND ef.company_id=$2::text
         AND ($3::text IS NULL OR ef.branch_id=$3::text)
         AND ($4::text IS NULL OR ef.staff_id=$4::text)
         AND ($5::text IS NULL OR ef.status=$5::text)
       ORDER BY CASE ef.status WHEN 'OPEN' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 ELSE 2 END,
                ef.due_at NULLS LAST,ef.created_at DESC
       LIMIT $6`,
      c.tenantId,
      c.companyId,
      input.branchId ?? c.branchId ?? null,
      input.staffId ?? null,
      status,
      limit,
    );
  }

  async transition(
    id: string,
    target: TargetStatus,
    input: { note?: string | null } = {},
    actorUserId: string,
  ) {
    const c = this.context();
    const note = input.note?.trim() || null;
    if (target === 'RESOLVED' && !note) {
      throw new BadRequestException('Resolution note is required.');
    }
    if (target === 'CANCELLED' && !note) {
      throw new BadRequestException('Cancellation reason is required.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,branch_id AS "branchId",status
           FROM training_effectiveness_followups
           WHERE id=$1::text
             AND tenant_id=$2::text
             AND company_id=$3::text
             AND ($4::text IS NULL OR branch_id=$4::text)
           FOR UPDATE`,
          id,
          c.tenantId,
          c.companyId,
          c.branchId,
        );
        if (!rows.length) throw new NotFoundException('Effectiveness follow-up not found.');
        const current = rows[0].status as FollowupStatus;
        if (current === target) return rows[0];

        const allowed =
          (current === 'OPEN' &&
            (target === 'ACKNOWLEDGED' || target === 'CANCELLED')) ||
          (current === 'ACKNOWLEDGED' &&
            (target === 'RESOLVED' || target === 'CANCELLED'));
        if (!allowed) {
          throw new BadRequestException(
            `Invalid effectiveness follow-up transition: ${current} -> ${target}.`,
          );
        }

        const updated = await tx.$queryRawUnsafe<any[]>(
          `UPDATE training_effectiveness_followups
           SET status=$2,
               acknowledged_at=CASE WHEN $2='ACKNOWLEDGED' THEN now() ELSE acknowledged_at END,
               acknowledged_by_user_id=CASE WHEN $2='ACKNOWLEDGED' THEN $3::text ELSE acknowledged_by_user_id END,
               resolved_at=CASE WHEN $2='RESOLVED' THEN now() ELSE resolved_at END,
               resolved_by_user_id=CASE WHEN $2='RESOLVED' THEN $3::text ELSE resolved_by_user_id END,
               resolution_note=CASE WHEN $2='RESOLVED' THEN $4 ELSE resolution_note END,
               cancelled_at=CASE WHEN $2='CANCELLED' THEN now() ELSE cancelled_at END,
               cancelled_by_user_id=CASE WHEN $2='CANCELLED' THEN $3::text ELSE cancelled_by_user_id END,
               cancellation_reason=CASE WHEN $2='CANCELLED' THEN $4 ELSE cancellation_reason END,
               updated_at=now()
           WHERE id=$1::text
           RETURNING id,status,action_type AS "actionType",priority,due_at AS "dueAt",
                     acknowledged_at AS "acknowledgedAt",resolved_at AS "resolvedAt",cancelled_at AS "cancelledAt"`,
          id,
          target,
          actorUserId,
          note,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO training_effectiveness_followup_events(
             tenant_id,company_id,branch_id,followup_id,event_type,from_status,to_status,actor_user_id,metadata
           )
           VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8::text,$9::jsonb)`,
          c.tenantId,
          c.companyId,
          rows[0].branchId,
          id,
          target,
          current,
          target,
          actorUserId,
          JSON.stringify({ note }),
        );
        return updated[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
