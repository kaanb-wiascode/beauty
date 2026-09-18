import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type GapCandidate = {
  profileId: string;
  competencyId: string;
  competencyCode: string;
  competencyName: string;
  requiredLevel: number;
  currentLevel: number | null;
  gap: number;
  assessmentId: string | null;
  ruleId: string;
  ruleName: string;
  ruleVersion: number;
  minimumGap: number;
  priority: number;
  dueDays: number;
  cooldownDays: number;
  courseId: string;
  courseCode: string;
  courseTitle: string;
};

@Injectable()
export class CompetencyTrainingService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  private date(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new BadRequestException(`${field} must use YYYY-MM-DD.`);
    return value;
  }

  private async staff(staffId: string) {
    const c = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT s.id,s."branchId" AS "branchId"
       FROM staff s
       JOIN branches b ON b.id=s."branchId"
       JOIN companies co ON co.id=b."companyId"
       WHERE s.id=$1::text AND s."tenantId"=$2::text AND co.id=$3::text
         AND ($4::text IS NULL OR s."branchId"=$4::text)
       LIMIT 1`,
      staffId,c.tenantId,c.companyId,c.branchId,
    );
    if (!rows.length) throw new NotFoundException('Staff not found in active scope.');
    return rows[0] as { id: string; branchId: string };
  }

  private candidateSql() {
    return `WITH active_profile AS (
      SELECT sp.profile_id
      FROM staff_competency_profiles sp
      WHERE sp.tenant_id=$1::text AND sp.company_id=$2::text AND sp.staff_id=$3::text
        AND sp.effective_from<=CURRENT_DATE AND (sp.effective_to IS NULL OR sp.effective_to>=CURRENT_DATE)
      ORDER BY sp.effective_from DESC,sp.created_at DESC
      LIMIT 1
    ), latest AS (
      SELECT DISTINCT ON(a.competency_id)
        a.id,a.competency_id,a.score,a.assessed_at
      FROM staff_competency_assessments a
      WHERE a.tenant_id=$1::text AND a.company_id=$2::text AND a.staff_id=$3::text
      ORDER BY a.competency_id,a.assessed_at DESC,a.created_at DESC
    ), gaps AS (
      SELECT p.profile_id AS "profileId",r.competency_id AS "competencyId",
             d.code AS "competencyCode",d.name AS "competencyName",
             r.required_level AS "requiredLevel",l.score AS "currentLevel",
             CASE WHEN l.score IS NULL THEN r.required_level ELSE GREATEST(r.required_level-l.score,0) END AS gap,
             l.id AS "assessmentId"
      FROM active_profile p
      JOIN competency_profile_requirements r ON r.profile_id=p.profile_id
      JOIN competency_definitions d ON d.id=r.competency_id AND d.tenant_id=$1::text AND d.company_id=$2::text AND d.is_active=true
      LEFT JOIN latest l ON l.competency_id=r.competency_id
    )
    SELECT g."profileId",g."competencyId",g."competencyCode",g."competencyName",
           g."requiredLevel",g."currentLevel",g.gap,g."assessmentId",
           ctr.id AS "ruleId",ctr.name AS "ruleName",ctr.version AS "ruleVersion",
           ctr.minimum_gap AS "minimumGap",ctr.priority,ctr.due_days AS "dueDays",ctr.cooldown_days AS "cooldownDays",
           tc.id AS "courseId",tc.code AS "courseCode",tc.title AS "courseTitle"
    FROM gaps g
    JOIN competency_training_rules ctr
      ON ctr.competency_id=g."competencyId" AND ctr.tenant_id=$1::text AND ctr.company_id=$2::text
     AND ctr.is_active=true AND ctr.effective_from<=CURRENT_DATE AND (ctr.effective_to IS NULL OR ctr.effective_to>=CURRENT_DATE)
    JOIN training_courses tc ON tc.id=ctr.course_id AND tc.tenant_id=$1::text AND tc.company_id=$2::text AND tc.is_active=true
    WHERE g.gap>0 AND g.gap>=ctr.minimum_gap
    ORDER BY ctr.priority ASC,g.gap DESC,ctr.created_at ASC,ctr.id ASC`;
  }

  async createRule(input: {
    name: string;
    competencyId: string;
    courseId: string;
    minimumGap?: number;
    priority?: number;
    dueDays?: number;
    cooldownDays?: number;
    effectiveFrom?: string;
    effectiveTo?: string | null;
  }, actorUserId: string) {
    const c = this.context();
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Rule name is required.');
    if (!input.competencyId || !input.courseId) throw new BadRequestException('competencyId and courseId are required.');
    const minimumGap = Number(input.minimumGap ?? 1);
    const priority = Math.trunc(Number(input.priority ?? 100));
    const dueDays = Math.trunc(Number(input.dueDays ?? 30));
    const cooldownDays = Math.trunc(Number(input.cooldownDays ?? 30));
    if (!Number.isFinite(minimumGap) || minimumGap <= 0 || minimumGap > 100) throw new BadRequestException('minimumGap must be greater than 0 and at most 100.');
    if (!Number.isInteger(priority) || priority < 1 || priority > 10000) throw new BadRequestException('priority must be between 1 and 10000.');
    if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 3650) throw new BadRequestException('dueDays must be between 0 and 3650.');
    if (!Number.isInteger(cooldownDays) || cooldownDays < 0 || cooldownDays > 3650) throw new BadRequestException('cooldownDays must be between 0 and 3650.');
    const effectiveFrom = this.date(input.effectiveFrom ?? new Date().toISOString().slice(0,10),'effectiveFrom');
    const effectiveTo = input.effectiveTo ? this.date(input.effectiveTo,'effectiveTo') : null;
    if (effectiveTo && effectiveTo < effectiveFrom) throw new BadRequestException('effectiveTo cannot be before effectiveFrom.');

    return this.prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`competency-training-rule:${c.tenantId}:${c.companyId}:${name}`);
      const competencies = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM competency_definitions WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true LIMIT 1`,
        input.competencyId,c.tenantId,c.companyId,
      );
      if (!competencies.length) throw new NotFoundException('Active competency definition not found.');
      const courses = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM training_courses WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true LIMIT 1`,
        input.courseId,c.tenantId,c.companyId,
      );
      if (!courses.length) throw new NotFoundException('Active training course not found.');
      const versions = await tx.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(MAX(version),0)+1 AS version FROM competency_training_rules WHERE tenant_id=$1::text AND company_id=$2::text AND name=$3`,
        c.tenantId,c.companyId,name,
      );
      const version = Number(versions[0]?.version ?? 1);
      await tx.$executeRawUnsafe(
        `UPDATE competency_training_rules
         SET is_active=false,
             effective_to=CASE WHEN effective_from<$4::date THEN ($4::date-interval '1 day')::date ELSE effective_from END,
             updated_at=now()
         WHERE tenant_id=$1::text AND company_id=$2::text AND name=$3 AND is_active=true`,
        c.tenantId,c.companyId,name,effectiveFrom,
      );
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO competency_training_rules(
           tenant_id,company_id,name,version,competency_id,course_id,minimum_gap,priority,due_days,cooldown_days,effective_from,effective_to,created_by_user_id
         ) VALUES($1::text,$2::text,$3,$4,$5::text,$6::text,$7,$8,$9,$10,$11::date,$12::date,$13::text)
         RETURNING id,name,version,competency_id AS "competencyId",course_id AS "courseId",minimum_gap AS "minimumGap",
                   priority,due_days AS "dueDays",cooldown_days AS "cooldownDays",effective_from AS "effectiveFrom",effective_to AS "effectiveTo",is_active AS "isActive"`,
        c.tenantId,c.companyId,name,version,input.competencyId,input.courseId,minimumGap,priority,dueDays,cooldownDays,effectiveFrom,effectiveTo,actorUserId,
      );
      return rows[0];
    },{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listRules() {
    const c = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.id,r.name,r.version,r.minimum_gap AS "minimumGap",r.priority,r.due_days AS "dueDays",r.cooldown_days AS "cooldownDays",
              r.effective_from AS "effectiveFrom",r.effective_to AS "effectiveTo",r.is_active AS "isActive",
              d.id AS "competencyId",d.code AS "competencyCode",d.name AS "competencyName",
              tc.id AS "courseId",tc.code AS "courseCode",tc.title AS "courseTitle"
       FROM competency_training_rules r
       JOIN competency_definitions d ON d.id=r.competency_id
       JOIN training_courses tc ON tc.id=r.course_id
       WHERE r.tenant_id=$1::text AND r.company_id=$2::text
       ORDER BY r.name,r.version DESC`,
      c.tenantId,c.companyId,
    );
  }

  async recommendations(staffId: string) {
    const c = this.context();
    await this.staff(staffId);
    const rows = await this.prisma.$queryRawUnsafe<GapCandidate[]>(this.candidateSql(),c.tenantId,c.companyId,staffId);
    return rows.map(row => ({
      ...row,
      requiredLevel: Number(row.requiredLevel),
      currentLevel: row.currentLevel == null ? null : Number(row.currentLevel),
      gap: Number(row.gap),
      minimumGap: Number(row.minimumGap),
      priority: Number(row.priority),
      dueDays: Number(row.dueDays),
      cooldownDays: Number(row.cooldownDays),
    }));
  }

  async process(staffId: string, actorUserId: string) {
    const c = this.context();
    const staff = await this.staff(staffId);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`competency-training-staff:${c.tenantId}:${c.companyId}:${staffId}`);
      const candidates = await tx.$queryRawUnsafe<GapCandidate[]>(this.candidateSql(),c.tenantId,c.companyId,staffId);
      let created = 0;
      let skippedCooldown = 0;
      let skippedNoPublishedVersion = 0;
      let duplicateSourceKey = 0;
      const assignments: Array<{ assignmentId: string; ruleId: string; courseId: string; competencyId: string; gap: number }> = [];

      for (const raw of candidates) {
        const row = {
          ...raw,
          requiredLevel: Number(raw.requiredLevel),
          currentLevel: raw.currentLevel == null ? null : Number(raw.currentLevel),
          gap: Number(raw.gap),
          cooldownDays: Number(raw.cooldownDays),
          dueDays: Number(raw.dueDays),
        };
        const published = await tx.$queryRawUnsafe<any[]>(
          `SELECT id FROM training_course_versions
           WHERE tenant_id=$1::text AND company_id=$2::text AND course_id=$3::text AND status='PUBLISHED'
             AND effective_from<=CURRENT_DATE AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
           ORDER BY version DESC LIMIT 1`,
          c.tenantId,c.companyId,row.courseId,
        );
        if (!published.length) {
          skippedNoPublishedVersion += 1;
          await tx.$executeRawUnsafe(
            `INSERT INTO competency_training_rule_events(
               tenant_id,company_id,branch_id,staff_id,rule_id,event_type,profile_id,competency_id,required_level,current_level,gap,assessment_id,evidence,actor_user_id
             ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'SKIPPED_NO_PUBLISHED_VERSION',$6::text,$7::text,$8,$9,$10,$11::text,$12::jsonb,$13::text)`,
            c.tenantId,c.companyId,staff.branchId,staffId,row.ruleId,row.profileId,row.competencyId,row.requiredLevel,row.currentLevel,row.gap,row.assessmentId,
            JSON.stringify({courseId:row.courseId,courseCode:row.courseCode,ruleVersion:row.ruleVersion}),actorUserId,
          );
          continue;
        }

        const recent = await tx.$queryRawUnsafe<any[]>(
          `SELECT id FROM training_assignments
           WHERE tenant_id=$1::text AND company_id=$2::text AND staff_id=$3::text AND competency_rule_id=$4::text
             AND created_at>=now()-($5::int*interval '1 day')
           ORDER BY created_at DESC LIMIT 1`,
          c.tenantId,c.companyId,staffId,row.ruleId,row.cooldownDays,
        );
        if (recent.length) {
          skippedCooldown += 1;
          await tx.$executeRawUnsafe(
            `INSERT INTO competency_training_rule_events(
               tenant_id,company_id,branch_id,staff_id,rule_id,assignment_id,event_type,profile_id,competency_id,required_level,current_level,gap,assessment_id,evidence,actor_user_id
             ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'SKIPPED_COOLDOWN',$7::text,$8::text,$9,$10,$11,$12::text,$13::jsonb,$14::text)`,
            c.tenantId,c.companyId,staff.branchId,staffId,row.ruleId,recent[0].id,row.profileId,row.competencyId,row.requiredLevel,row.currentLevel,row.gap,row.assessmentId,
            JSON.stringify({cooldownDays:row.cooldownDays,ruleVersion:row.ruleVersion}),actorUserId,
          );
          continue;
        }

        const sourceKey = `competency-gap:${row.ruleId}:${staffId}:${row.profileId}:${row.assessmentId ?? 'UNASSESSED'}`;
        const inserted = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO training_assignments(
             tenant_id,company_id,branch_id,course_id,staff_id,source_type,competency_rule_id,source_key,rationale,due_at,assigned_by_user_id,updated_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'COMPETENCY_GAP',$6::text,$7,$8::jsonb,now()+($9::int*interval '1 day'),$10::text,$10::text)
           ON CONFLICT(tenant_id,company_id,source_key) DO NOTHING
           RETURNING id,status,course_version_id AS "courseVersionId"`,
          c.tenantId,c.companyId,staff.branchId,row.courseId,staffId,row.ruleId,sourceKey,
          JSON.stringify({
            ruleId:row.ruleId,ruleName:row.ruleName,ruleVersion:row.ruleVersion,
            profileId:row.profileId,competencyId:row.competencyId,competencyCode:row.competencyCode,
            requiredLevel:row.requiredLevel,currentLevel:row.currentLevel,gap:row.gap,assessmentId:row.assessmentId,
          }),row.dueDays,actorUserId,
        );
        if (!inserted.length) {
          duplicateSourceKey += 1;
          await tx.$executeRawUnsafe(
            `INSERT INTO competency_training_rule_events(
               tenant_id,company_id,branch_id,staff_id,rule_id,event_type,profile_id,competency_id,required_level,current_level,gap,assessment_id,evidence,actor_user_id
             ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'DUPLICATE_SOURCE_KEY',$6::text,$7::text,$8,$9,$10,$11::text,$12::jsonb,$13::text)`,
            c.tenantId,c.companyId,staff.branchId,staffId,row.ruleId,row.profileId,row.competencyId,row.requiredLevel,row.currentLevel,row.gap,row.assessmentId,
            JSON.stringify({sourceKey,ruleVersion:row.ruleVersion}),actorUserId,
          );
          continue;
        }

        const assignment = inserted[0];
        created += 1;
        assignments.push({ assignmentId:assignment.id,ruleId:row.ruleId,courseId:row.courseId,competencyId:row.competencyId,gap:row.gap });
        await tx.$executeRawUnsafe(
          `INSERT INTO training_assignment_events(
             assignment_id,tenant_id,company_id,branch_id,event_type,to_status,actor_user_id,note,metadata
           ) VALUES($1::text,$2::text,$3::text,$4::text,'CREATED','ASSIGNED',$5::text,$6,$7::jsonb)`,
          assignment.id,c.tenantId,c.companyId,staff.branchId,actorUserId,'Created from competency gap',
          JSON.stringify({ruleId:row.ruleId,ruleVersion:row.ruleVersion,competencyId:row.competencyId,gap:row.gap,courseVersionId:assignment.courseVersionId}),
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO competency_training_rule_events(
             tenant_id,company_id,branch_id,staff_id,rule_id,assignment_id,event_type,profile_id,competency_id,required_level,current_level,gap,assessment_id,evidence,actor_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'ASSIGNMENT_CREATED',$7::text,$8::text,$9,$10,$11,$12::text,$13::jsonb,$14::text)`,
          c.tenantId,c.companyId,staff.branchId,staffId,row.ruleId,assignment.id,row.profileId,row.competencyId,row.requiredLevel,row.currentLevel,row.gap,row.assessmentId,
          JSON.stringify({courseId:row.courseId,courseVersionId:assignment.courseVersionId,sourceKey,ruleVersion:row.ruleVersion}),actorUserId,
        );
      }

      return {
        matched: candidates.length,
        created,
        skippedCooldown,
        skippedNoPublishedVersion,
        duplicateSourceKey,
        assignments,
      };
    },{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
