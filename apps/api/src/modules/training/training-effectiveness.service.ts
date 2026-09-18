import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingEffectivenessService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context() {
    return { tenantId: this.tenant.getTenantId(), companyId: this.tenant.getCompanyId(), branchId: this.tenant.getBranchId() };
  }

  async process(actorUserId: string, input: { preWindowDays?: number; postWindowDays?: number; limit?: number } = {}) {
    const c = this.context();
    const preDays = Math.min(Math.max(Math.trunc(Number(input.preWindowDays ?? 30)),1),3650);
    const postDays = Math.min(Math.max(Math.trunc(Number(input.postWindowDays ?? 30)),1),3650);
    const limit = Math.min(Math.max(Math.trunc(Number(input.limit ?? 50)),1),200);

    return this.prisma.$transaction(async tx => {
      const assignments = await tx.$queryRawUnsafe<any[]>(
        `SELECT a.id,a.branch_id AS "branchId",a.staff_id AS "staffId",a.source_rule_id AS "sourceRuleId",a.assigned_at AS "assignedAt",a.completed_at AS "completedAt",
                r.finding_category AS "findingCategory",r.target_scope AS "targetScope",r.name AS "ruleName",r.version AS "ruleVersion"
         FROM training_assignments a
         JOIN quality_training_rules r ON r.id=a.source_rule_id
         JOIN training_assignment_results ar ON ar.assignment_id=a.id AND ar.final_passed=true
         WHERE a.tenant_id=$1::text AND a.company_id=$2::text AND a.source_type='QUALITY_RULE' AND a.status='COMPLETED'
           AND a.completed_at IS NOT NULL
           AND a.completed_at <= now()-($4::int*interval '1 day')
           AND ($3::text IS NULL OR a.branch_id=$3::text)
           AND NOT EXISTS (
             SELECT 1 FROM training_effectiveness_runs er
             WHERE er.tenant_id=a.tenant_id AND er.company_id=a.company_id AND er.assignment_id=a.id
               AND er.pre_window_days=$5::int AND er.post_window_days=$4::int
           )
         ORDER BY a.completed_at,a.id
         FOR UPDATE OF a SKIP LOCKED
         LIMIT $6`,
        c.tenantId,c.companyId,c.branchId,postDays,preDays,limit,
      );

      let created = 0;
      const outcomeCounts = { improved: 0, stable: 0, worse: 0, insufficientBaseline: 0 };
      for (const assignment of assignments) {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`training-effectiveness:${c.tenantId}:${c.companyId}:${assignment.id}:${preDays}:${postDays}`);
        const counts = await tx.$queryRawUnsafe<any[]>(
          `WITH scoped AS (
             SELECT f.created_at,
                    CASE WHEN f.created_at >= $7::timestamptz-($5::int*interval '1 day') AND f.created_at < $7::timestamptz THEN 'PRE'
                         WHEN f.created_at >= $8::timestamptz AND f.created_at < $8::timestamptz+($6::int*interval '1 day') THEN 'POST'
                         ELSE NULL END AS period
             FROM quality_findings f
             LEFT JOIN quality_cases qc ON qc.id=f.quality_case_id AND qc.tenant_id=f.tenant_id AND qc.company_id=f.company_id
             WHERE f.tenant_id=$1::text AND f.company_id=$2::text AND f.branch_id=$3::text
               AND ($4::text IS NULL OR upper(f.category)=upper($4))
               AND ($9::text IS NULL OR qc.staff_id=$9::text)
               AND f.created_at >= $7::timestamptz-($5::int*interval '1 day')
               AND f.created_at < $8::timestamptz+($6::int*interval '1 day')
           )
           SELECT COUNT(*) FILTER(WHERE period='PRE')::int AS "preCount",COUNT(*) FILTER(WHERE period='POST')::int AS "postCount" FROM scoped`,
          c.tenantId,c.companyId,assignment.branchId,assignment.findingCategory,preDays,postDays,assignment.assignedAt,assignment.completedAt,assignment.targetScope==='STAFF'?assignment.staffId:null,
        );
        const pre = Number(counts[0]?.preCount ?? 0);
        const post = Number(counts[0]?.postCount ?? 0);
        const delta = post - pre;
        const improvementPct = pre > 0 ? Math.round(((pre-post)/pre)*10000)/100 : null;
        const outcome = pre === 0 ? 'INSUFFICIENT_BASELINE' : post < pre ? 'IMPROVED' : post > pre ? 'WORSE' : 'STABLE';
        const inserted = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO training_effectiveness_runs(tenant_id,company_id,branch_id,assignment_id,source_rule_id,staff_id,finding_category,pre_window_days,post_window_days,pre_window_start,pre_window_end,post_window_start,post_window_end,pre_finding_count,post_finding_count,delta_count,improvement_pct,outcome,explanation,calculated_by_user_id)
           VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10::timestamptz-($8::int*interval '1 day'),$10::timestamptz,$11::timestamptz,$11::timestamptz+($9::int*interval '1 day'),$12,$13,$14,$15,$16,$17::jsonb,$18::text)
           ON CONFLICT(tenant_id,company_id,assignment_id,pre_window_days,post_window_days) DO NOTHING
           RETURNING id,outcome,improvement_pct AS "improvementPct"`,
          c.tenantId,c.companyId,assignment.branchId,assignment.id,assignment.sourceRuleId,assignment.staffId??null,assignment.findingCategory,preDays,postDays,assignment.assignedAt,assignment.completedAt,pre,post,delta,improvementPct,outcome,
          JSON.stringify({ruleName:assignment.ruleName,ruleVersion:assignment.ruleVersion,targetScope:assignment.targetScope,metric:'QUALITY_FINDING_COUNT',findingCategory:assignment.findingCategory,preFindingCount:pre,postFindingCount:post,deltaCount:delta,improvementPct}),actorUserId,
        );
        if (!inserted.length) continue;
        created++;
        if (outcome==='IMPROVED') outcomeCounts.improved++;
        else if (outcome==='WORSE') outcomeCounts.worse++;
        else if (outcome==='STABLE') outcomeCounts.stable++;
        else outcomeCounts.insufficientBaseline++;
      }
      return { claimed: assignments.length, created, preWindowDays: preDays, postWindowDays: postDays, ...outcomeCounts };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async list(input: { branchId?: string; staffId?: string; outcome?: string; limit?: number } = {}) {
    const c = this.context();
    const limit = Math.min(Math.max(Math.trunc(Number(input.limit ?? 50)),1),200);
    const outcome = input.outcome?.trim().toUpperCase() || null;
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT er.id,er.assignment_id AS "assignmentId",er.branch_id AS "branchId",er.staff_id AS "staffId",er.finding_category AS "findingCategory",er.pre_window_days AS "preWindowDays",er.post_window_days AS "postWindowDays",er.pre_finding_count AS "preFindingCount",er.post_finding_count AS "postFindingCount",er.delta_count AS "deltaCount",er.improvement_pct AS "improvementPct",er.outcome,er.explanation,er.calculated_at AS "calculatedAt",
              c.code AS "courseCode",c.title AS "courseTitle"
       FROM training_effectiveness_runs er
       JOIN training_assignments a ON a.id=er.assignment_id
       JOIN training_courses c ON c.id=a.course_id
       WHERE er.tenant_id=$1::text AND er.company_id=$2::text
         AND ($3::text IS NULL OR er.branch_id=$3::text)
         AND ($4::text IS NULL OR er.staff_id=$4::text)
         AND ($5::text IS NULL OR er.outcome=$5::text)
       ORDER BY er.calculated_at DESC LIMIT $6`,
      c.tenantId,c.companyId,input.branchId??c.branchId??null,input.staffId??null,outcome,limit,
    );
  }
}
