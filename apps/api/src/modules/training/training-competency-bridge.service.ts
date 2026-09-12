import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingCompetencyBridgeService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context() {
    return { tenantId: this.tenant.getTenantId(), companyId: this.tenant.getCompanyId(), branchId: this.tenant.getBranchId() };
  }

  async addOutcome(courseVersionId: string, input: { competencyId: string; scoreSource: string; fixedScore?: number | null }, actorUserId: string) {
    const c = this.context();
    const scoreSource = input.scoreSource?.trim().toUpperCase();
    if (!['THEORY','PRACTICAL','AVERAGE','FIXED'].includes(scoreSource)) throw new BadRequestException('Invalid scoreSource.');
    const fixedScore = input.fixedScore == null ? null : Number(input.fixedScore);
    if (scoreSource === 'FIXED' && (!Number.isFinite(fixedScore) || fixedScore! < 0 || fixedScore! > 100)) throw new BadRequestException('fixedScore must be between 0 and 100 for FIXED outcomes.');
    if (scoreSource !== 'FIXED' && fixedScore != null) throw new BadRequestException('fixedScore is only valid for FIXED outcomes.');

    return this.prisma.$transaction(async tx => {
      const versions = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM training_course_versions WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT' LIMIT 1`,
        courseVersionId,c.tenantId,c.companyId,
      );
      if (!versions.length) throw new NotFoundException('Draft course version not found.');
      const competencies = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM competency_definitions WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true LIMIT 1`,
        input.competencyId,c.tenantId,c.companyId,
      );
      if (!competencies.length) throw new NotFoundException('Active competency definition not found.');
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO training_competency_outcomes(tenant_id,company_id,course_version_id,competency_id,score_source,fixed_score,created_by_user_id)
         VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7::text)
         RETURNING id,course_version_id AS "courseVersionId",competency_id AS "competencyId",score_source AS "scoreSource",fixed_score AS "fixedScore"`,
        c.tenantId,c.companyId,courseVersionId,input.competencyId,scoreSource,fixedScore,actorUserId,
      );
      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listOutcomes(courseVersionId: string) {
    const c = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT o.id,o.course_version_id AS "courseVersionId",o.competency_id AS "competencyId",d.code AS "competencyCode",d.name AS "competencyName",o.score_source AS "scoreSource",o.fixed_score AS "fixedScore",o.created_at AS "createdAt"
       FROM training_competency_outcomes o
       JOIN competency_definitions d ON d.id=o.competency_id
       WHERE o.tenant_id=$1::text AND o.company_id=$2::text AND o.course_version_id=$3::text
       ORDER BY d.code,o.id`,
      c.tenantId,c.companyId,courseVersionId,
    );
  }

  async processCompleted(actorUserId: string, limit = 50) {
    const c = this.context();
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit) || 50),1),200);
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT r.assignment_id AS "assignmentId",r.course_version_id AS "courseVersionId",r.theory_score AS "theoryScore",r.practical_score AS "practicalScore",r.final_passed AS "finalPassed",r.finalized_at AS "finalizedAt",
                a.branch_id AS "branchId",a.staff_id AS "staffId"
         FROM training_assignment_results r
         JOIN training_assignments a ON a.id=r.assignment_id
         WHERE r.tenant_id=$1::text AND r.company_id=$2::text
           AND r.final_passed=true
           AND a.status='COMPLETED'
           AND ($3::text IS NULL OR a.branch_id=$3::text)
           AND EXISTS (SELECT 1 FROM training_competency_outcomes o WHERE o.tenant_id=r.tenant_id AND o.company_id=r.company_id AND o.course_version_id=r.course_version_id)
           AND EXISTS (
             SELECT 1 FROM training_competency_outcomes o
             WHERE o.tenant_id=r.tenant_id AND o.company_id=r.company_id AND o.course_version_id=r.course_version_id
               AND NOT EXISTS (
                 SELECT 1 FROM staff_competency_assessments ca
                 WHERE ca.tenant_id=r.tenant_id AND ca.company_id=r.company_id
                   AND ca.staff_id=a.staff_id AND ca.competency_id=o.competency_id
                   AND ca.source_type='TRAINING' AND ca.source_result_id=r.assignment_id
               )
           )
         ORDER BY r.finalized_at,r.assignment_id
         FOR UPDATE OF r SKIP LOCKED
         LIMIT $4`,
        c.tenantId,c.companyId,c.branchId,safeLimit,
      );

      const summary = { claimed: rows.length, assessmentsCreated: 0, skippedNoStaff: 0, skippedNoScore: 0, duplicate: 0 };
      for (const row of rows) {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`training-competency-result:${c.tenantId}:${c.companyId}:${row.assignmentId}`);
        const outcomes = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,competency_id AS "competencyId",score_source AS "scoreSource",fixed_score AS "fixedScore"
           FROM training_competency_outcomes
           WHERE tenant_id=$1::text AND company_id=$2::text AND course_version_id=$3::text
           ORDER BY id`,
          c.tenantId,c.companyId,row.courseVersionId,
        );
        if (!row.staffId) {
          summary.skippedNoStaff += outcomes.length;
          for (const outcome of outcomes) {
            await tx.$executeRawUnsafe(
              `INSERT INTO training_competency_bridge_events(tenant_id,company_id,branch_id,assignment_id,course_version_id,competency_id,event_type,detail,actor_user_id)
               VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'SKIPPED_NO_STAFF',$7::jsonb,$8::text)`,
              c.tenantId,c.companyId,row.branchId,row.assignmentId,row.courseVersionId,outcome.competencyId,JSON.stringify({reason:'Assignment is not linked to a staff record.'}),actorUserId,
            );
          }
          continue;
        }

        for (const outcome of outcomes) {
          let score: number | null = null;
          const theory = row.theoryScore == null ? null : Number(row.theoryScore);
          const practical = row.practicalScore == null ? null : Number(row.practicalScore);
          if (outcome.scoreSource === 'THEORY') score = theory;
          else if (outcome.scoreSource === 'PRACTICAL') score = practical;
          else if (outcome.scoreSource === 'FIXED') score = Number(outcome.fixedScore);
          else {
            const values = [theory,practical].filter((v): v is number => v != null && Number.isFinite(v));
            score = values.length ? Math.round((values.reduce((a,b)=>a+b,0)/values.length)*100)/100 : null;
          }
          if (score == null || !Number.isFinite(score)) {
            summary.skippedNoScore++;
            await tx.$executeRawUnsafe(
              `INSERT INTO training_competency_bridge_events(tenant_id,company_id,branch_id,assignment_id,course_version_id,competency_id,event_type,detail,actor_user_id)
               VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'SKIPPED_NO_SCORE',$7::jsonb,$8::text)`,
              c.tenantId,c.companyId,row.branchId,row.assignmentId,row.courseVersionId,outcome.competencyId,JSON.stringify({scoreSource:outcome.scoreSource}),actorUserId,
            );
            continue;
          }
          const inserted = await tx.$queryRawUnsafe<any[]>(
            `INSERT INTO staff_competency_assessments(tenant_id,company_id,branch_id,staff_id,competency_id,source_type,score,evidence,note,assessed_at,assessed_by_user_id,source_assignment_id,source_result_id)
             VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'TRAINING',$6,$7::jsonb,$8,$9,$10::text,$11::text,$11::text)
             ON CONFLICT(tenant_id,company_id,staff_id,competency_id,source_result_id) WHERE source_type='TRAINING' AND source_result_id IS NOT NULL DO NOTHING
             RETURNING id`,
            c.tenantId,c.companyId,row.branchId,row.staffId,outcome.competencyId,score,
            JSON.stringify({assignmentId:row.assignmentId,courseVersionId:row.courseVersionId,scoreSource:outcome.scoreSource,theoryScore:theory,practicalScore:practical}),
            `Training completion outcome (${outcome.scoreSource})`,row.finalizedAt,actorUserId,row.assignmentId,
          );
          if (!inserted.length) {
            summary.duplicate++;
            await tx.$executeRawUnsafe(
              `INSERT INTO training_competency_bridge_events(tenant_id,company_id,branch_id,assignment_id,course_version_id,competency_id,event_type,score,detail,actor_user_id)
               VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'DUPLICATE',$7,$8::jsonb,$9::text)`,
              c.tenantId,c.companyId,row.branchId,row.assignmentId,row.courseVersionId,outcome.competencyId,score,JSON.stringify({scoreSource:outcome.scoreSource}),actorUserId,
            );
            continue;
          }
          summary.assessmentsCreated++;
          await tx.$executeRawUnsafe(
            `INSERT INTO training_competency_bridge_events(tenant_id,company_id,branch_id,assignment_id,course_version_id,competency_id,assessment_id,event_type,score,detail,actor_user_id)
             VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,'ASSESSMENT_CREATED',$8,$9::jsonb,$10::text)`,
            c.tenantId,c.companyId,row.branchId,row.assignmentId,row.courseVersionId,outcome.competencyId,inserted[0].id,score,JSON.stringify({scoreSource:outcome.scoreSource}),actorUserId,
          );
        }
      }
      return summary;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
