import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context() {
    return { tenantId: this.tenant.getTenantId(), companyId: this.tenant.getCompanyId(), branchId: this.tenant.getBranchId() };
  }

  async createCourse(input: { code: string; title: string; description?: string | null; category: string; deliveryType?: string }, actorUserId: string) {
    const c = this.context();
    const code = input.code?.trim().toUpperCase();
    const title = input.title?.trim();
    const category = input.category?.trim().toUpperCase();
    const deliveryType = (input.deliveryType ?? 'BLENDED').trim().toUpperCase();
    if (!code || !title) throw new BadRequestException('Course code and title are required.');
    if (!['SERVICE','SALES','CUSTOMER_EXPERIENCE','CORPORATE','MANAGEMENT','QUALITY','OTHER'].includes(category)) throw new BadRequestException('Invalid training category.');
    if (!['THEORY','PRACTICAL','BLENDED'].includes(deliveryType)) throw new BadRequestException('Invalid delivery type.');
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO training_courses(tenant_id,company_id,code,title,description,category,delivery_type,created_by_user_id)
       VALUES($1::text,$2::text,$3,$4,$5,$6,$7,$8::text)
       ON CONFLICT(tenant_id,company_id,code) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,category=EXCLUDED.category,delivery_type=EXCLUDED.delivery_type,is_active=true,updated_at=now()
       RETURNING id,code,title,category,delivery_type AS "deliveryType",is_active AS "isActive"`,
      c.tenantId,c.companyId,code,title,input.description?.trim()||null,category,deliveryType,actorUserId,
    );
    return rows[0];
  }

  async listCourses() {
    const c = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,code,title,description,category,delivery_type AS "deliveryType",is_active AS "isActive",created_at AS "createdAt"
       FROM training_courses WHERE tenant_id=$1::text AND company_id=$2::text ORDER BY is_active DESC,category,title`,
      c.tenantId,c.companyId,
    );
  }

  async createQualityRule(input: { name: string; courseId: string; findingCategory?: string | null; minimumSeverity?: string | null; occurrenceThreshold?: number; lookbackDays?: number; cooldownDays?: number; targetScope?: 'BRANCH'|'STAFF'; effectiveFrom?: string; effectiveTo?: string | null }, actorUserId: string) {
    const c = this.context();
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Rule name is required.');
    const course = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM training_courses WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true LIMIT 1`,input.courseId,c.tenantId,c.companyId);
    if (!course.length) throw new NotFoundException('Training course not found.');
    const minimumSeverity = input.minimumSeverity?.trim().toUpperCase() || null;
    if (minimumSeverity && !['LOW','MEDIUM','HIGH','CRITICAL'].includes(minimumSeverity)) throw new BadRequestException('Invalid minimumSeverity.');
    const occurrenceThreshold = Math.trunc(input.occurrenceThreshold ?? 2);
    const lookbackDays = Math.trunc(input.lookbackDays ?? 90);
    const cooldownDays = Math.trunc(input.cooldownDays ?? 30);
    if (occurrenceThreshold < 1 || occurrenceThreshold > 1000) throw new BadRequestException('occurrenceThreshold must be between 1 and 1000.');
    if (lookbackDays < 1 || lookbackDays > 3650) throw new BadRequestException('lookbackDays must be between 1 and 3650.');
    if (cooldownDays < 0 || cooldownDays > 3650) throw new BadRequestException('cooldownDays must be between 0 and 3650.');
    const targetScope = input.targetScope ?? 'BRANCH';
    const effectiveFrom = input.effectiveFrom ?? new Date().toISOString().slice(0,10);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`quality-training-rule:${c.tenantId}:${c.companyId}:${name}`);
      const versions = await tx.$queryRawUnsafe<any[]>(`SELECT COALESCE(MAX(version),0)+1 AS version FROM quality_training_rules WHERE tenant_id=$1::text AND company_id=$2::text AND name=$3`,c.tenantId,c.companyId,name);
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO quality_training_rules(tenant_id,company_id,name,version,course_id,finding_category,minimum_severity,occurrence_threshold,lookback_days,cooldown_days,target_scope,effective_from,effective_to,created_by_user_id)
         VALUES($1::text,$2::text,$3,$4,$5::text,$6,$7,$8,$9,$10,$11,$12::date,$13::date,$14::text)
         RETURNING id,name,version,course_id AS "courseId",finding_category AS "findingCategory",minimum_severity AS "minimumSeverity",occurrence_threshold AS "occurrenceThreshold",lookback_days AS "lookbackDays",cooldown_days AS "cooldownDays",target_scope AS "targetScope",is_active AS "isActive"`,
        c.tenantId,c.companyId,name,Number(versions[0]?.version??1),input.courseId,input.findingCategory?.trim()||null,minimumSeverity,occurrenceThreshold,lookbackDays,cooldownDays,targetScope,effectiveFrom,input.effectiveTo??null,actorUserId,
      );
      return rows[0];
    },{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listQualityRules() {
    const c = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.id,r.name,r.version,r.finding_category AS "findingCategory",r.minimum_severity AS "minimumSeverity",r.occurrence_threshold AS "occurrenceThreshold",r.lookback_days AS "lookbackDays",r.cooldown_days AS "cooldownDays",r.target_scope AS "targetScope",r.is_active AS "isActive",c.id AS "courseId",c.code AS "courseCode",c.title AS "courseTitle"
       FROM quality_training_rules r JOIN training_courses c ON c.id=r.course_id
       WHERE r.tenant_id=$1::text AND r.company_id=$2::text ORDER BY r.created_at DESC,r.version DESC`,
      c.tenantId,c.companyId,
    );
  }

  async processQualityRules(actorUserId: string, limit = 100) {
    const c = this.context();
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 100),1),500);
    return this.prisma.$transaction(async tx => {
      const rules = await tx.$queryRawUnsafe<any[]>(
        `SELECT r.id,r.name,r.version,r.course_id AS "courseId",r.finding_category AS "findingCategory",r.minimum_severity AS "minimumSeverity",r.occurrence_threshold AS "occurrenceThreshold",r.lookback_days AS "lookbackDays",r.cooldown_days AS "cooldownDays",r.target_scope AS "targetScope"
         FROM quality_training_rules r
         WHERE r.tenant_id=$1::text AND r.company_id=$2::text AND r.is_active=true AND r.effective_from<=CURRENT_DATE AND (r.effective_to IS NULL OR r.effective_to>=CURRENT_DATE)
         ORDER BY r.created_at,r.id FOR UPDATE SKIP LOCKED LIMIT $3`,
        c.tenantId,c.companyId,safeLimit,
      );
      let created=0,skippedCooldown=0,noEligibleStaff=0,matches=0;
      for (const rule of rules) {
        const groups = await tx.$queryRawUnsafe<any[]>(
          `SELECT f.branch_id AS "branchId",
                  CASE WHEN $8='STAFF' THEN qc.staff_id ELSE NULL END AS "staffId",
                  COUNT(*)::int AS occurrences,
                  ARRAY_AGG(f.id ORDER BY f.created_at DESC)[1:20] AS "findingIds"
           FROM quality_findings f
           LEFT JOIN quality_cases qc ON qc.id=f.quality_case_id AND qc.tenant_id=f.tenant_id AND qc.company_id=f.company_id
           WHERE f.tenant_id=$1::text AND f.company_id=$2::text AND ($3::text IS NULL OR f.branch_id=$3::text)
             AND f.created_at >= now()-($4::int*interval '1 day')
             AND ($5::text IS NULL OR upper(f.category)=upper($5))
             AND ($6::text IS NULL OR (CASE f.severity WHEN 'LOW' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'HIGH' THEN 3 WHEN 'CRITICAL' THEN 4 END) >= (CASE $6 WHEN 'LOW' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'HIGH' THEN 3 WHEN 'CRITICAL' THEN 4 END))
           GROUP BY f.branch_id,CASE WHEN $8='STAFF' THEN qc.staff_id ELSE NULL END
           HAVING COUNT(*) >= $7::int`,
          c.tenantId,c.companyId,c.branchId,Number(rule.lookbackDays),rule.findingCategory,rule.minimumSeverity,Number(rule.occurrenceThreshold),rule.targetScope,
        );
        for (const group of groups) {
          matches += 1;
          if (rule.targetScope==='STAFF' && !group.staffId) {
            noEligibleStaff += 1;
            await tx.$executeRawUnsafe(`INSERT INTO quality_training_rule_events(tenant_id,company_id,branch_id,rule_id,event_type,occurrence_count,evidence,actor_user_id) VALUES($1::text,$2::text,$3::text,$4::text,'NO_ELIGIBLE_STAFF',$5,$6::jsonb,$7::text)`,c.tenantId,c.companyId,group.branchId,rule.id,Number(group.occurrences),JSON.stringify({findingIds:group.findingIds}),actorUserId);
            continue;
          }
          const recent = await tx.$queryRawUnsafe<any[]>(
            `SELECT id FROM training_assignments WHERE tenant_id=$1::text AND company_id=$2::text AND source_rule_id=$3::text AND branch_id=$4::text AND staff_id IS NOT DISTINCT FROM $5::text AND created_at >= now()-($6::int*interval '1 day') LIMIT 1`,
            c.tenantId,c.companyId,rule.id,group.branchId,group.staffId??null,Number(rule.cooldownDays),
          );
          if (recent.length) {
            skippedCooldown += 1;
            await tx.$executeRawUnsafe(`INSERT INTO quality_training_rule_events(tenant_id,company_id,branch_id,rule_id,staff_id,event_type,occurrence_count,evidence,actor_user_id) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'SKIPPED_COOLDOWN',$6,$7::jsonb,$8::text)`,c.tenantId,c.companyId,group.branchId,rule.id,group.staffId??null,Number(group.occurrences),JSON.stringify({findingIds:group.findingIds}),actorUserId);
            continue;
          }
          const sourceKey=`quality-rule:${rule.id}:${group.branchId}:${group.staffId??'BRANCH'}:${new Date().toISOString().slice(0,10)}`;
          const assignments = await tx.$queryRawUnsafe<any[]>(
            `INSERT INTO training_assignments(tenant_id,company_id,branch_id,course_id,staff_id,source_type,source_rule_id,source_key,rationale,assigned_by_user_id)
             VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'QUALITY_RULE',$6::text,$7,$8::jsonb,$9::text)
             ON CONFLICT(tenant_id,company_id,source_key) DO NOTHING RETURNING id`,
            c.tenantId,c.companyId,group.branchId,rule.courseId,group.staffId??null,rule.id,sourceKey,JSON.stringify({ruleName:rule.name,ruleVersion:rule.version,occurrences:Number(group.occurrences),findingIds:group.findingIds}),actorUserId,
          );
          if (!assignments.length) { skippedCooldown += 1; continue; }
          created += 1;
          await tx.$executeRawUnsafe(`INSERT INTO quality_training_rule_events(tenant_id,company_id,branch_id,rule_id,assignment_id,staff_id,event_type,occurrence_count,evidence,actor_user_id) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'ASSIGNMENT_CREATED',$7,$8::jsonb,$9::text)`,c.tenantId,c.companyId,group.branchId,rule.id,assignments[0].id,group.staffId??null,Number(group.occurrences),JSON.stringify({findingIds:group.findingIds}),actorUserId);
        }
      }
      return { processedRules: rules.length, matches, created, skippedCooldown, noEligibleStaff };
    },{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listAssignments(input: { status?: string; staffId?: string; limit?: number }) {
    const c=this.context();
    const limit=Math.min(Math.max(input.limit??50,1),200);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT a.id,a.branch_id AS "branchId",b.name AS "branchName",a.staff_id AS "staffId",CASE WHEN s.id IS NULL THEN NULL ELSE concat(s."firstName",' ',s."lastName") END AS "staffName",a.source_type AS "sourceType",a.status,a.rationale,a.assigned_at AS "assignedAt",a.due_at AS "dueAt",c.id AS "courseId",c.code AS "courseCode",c.title AS "courseTitle"
       FROM training_assignments a JOIN training_courses c ON c.id=a.course_id JOIN branches b ON b.id=a.branch_id LEFT JOIN staff s ON s.id=a.staff_id
       WHERE a.tenant_id=$1::text AND a.company_id=$2::text AND ($3::text IS NULL OR a.branch_id=$3::text) AND ($4::text IS NULL OR a.status=$4) AND ($5::text IS NULL OR a.staff_id=$5::text)
       ORDER BY a.assigned_at DESC LIMIT $6`,
      c.tenantId,c.companyId,c.branchId,input.status??null,input.staffId??null,limit,
    );
  }
}
