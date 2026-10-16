import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type TargetType = 'PERSONNEL' | 'BRANCH' | 'POSITION';

@Injectable()
export class TrainingBulkAssignmentService {
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

  async targets() {
    const c = this.context();
    const [branches, staff, positions] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT b.id,b.name
         FROM branches b
         JOIN companies co ON co.id=b."companyId"
         WHERE co.id=$1::text AND co."tenantId"=$2::text
           AND b.status='ACTIVE' AND ($3::text IS NULL OR b.id=$3::text)
         ORDER BY b.name,b.id`,
        c.companyId,c.tenantId,c.branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT s.id,concat(s."firstName",' ',s."lastName") AS name,s."branchId" AS "branchId",
                ea.position_id AS "positionId",p.name AS "positionName"
         FROM staff s
         JOIN branches b ON b.id=s."branchId"
         LEFT JOIN hr_employee_assignments ea ON ea.staff_id=s.id
           AND ea.tenant_id=$1::text AND ea.company_id=$2::text
           AND ea.effective_from<=CURRENT_DATE AND (ea.effective_to IS NULL OR ea.effective_to>=CURRENT_DATE)
         LEFT JOIN hr_positions p ON p.id=ea.position_id
         WHERE s."tenantId"=$1::text AND b."companyId"=$2::text
           AND s.status='ACTIVE' AND ($3::text IS NULL OR s."branchId"=$3::text)
         ORDER BY s."firstName",s."lastName",s.id`,
        c.tenantId,c.companyId,c.branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT p.id,p.name,p.code,COUNT(DISTINCT s.id)::int AS "staffCount"
         FROM hr_positions p
         LEFT JOIN hr_employee_assignments ea ON ea.position_id=p.id
           AND ea.tenant_id=p.tenant_id AND ea.company_id=p.company_id
           AND ea.effective_from<=CURRENT_DATE AND (ea.effective_to IS NULL OR ea.effective_to>=CURRENT_DATE)
         LEFT JOIN staff s ON s.id=ea.staff_id AND s.status='ACTIVE'
           AND ($3::text IS NULL OR s."branchId"=$3::text)
         WHERE p.tenant_id=$1::text AND p.company_id=$2::text AND p.status='ACTIVE'
         GROUP BY p.id
         ORDER BY p.name,p.id`,
        c.tenantId,c.companyId,c.branchId,
      ),
    ]);
    return { branches, staff, positions };
  }

  async createBulk(input: {
    courseId: string;
    targetType: TargetType;
    targetIds: string[];
    dueAt?: string | null;
    note?: string | null;
    idempotencyKey: string;
  }, actorUserId: string) {
    const c = this.context();
    const targetIds = [...new Set(input.targetIds.map(id => id.trim()).filter(Boolean))];
    if (!targetIds.length) throw new BadRequestException('At least one assignment target is required.');
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) throw new BadRequestException('idempotencyKey is required.');
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new BadRequestException('dueAt is invalid.');

    const published = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT v.id,v.version
       FROM training_course_versions v
       JOIN training_courses tc ON tc.id=v.course_id
       WHERE v.course_id=$1::text AND v.tenant_id=$2::text AND v.company_id=$3::text
         AND v.status='PUBLISHED' AND tc.is_active=true
       ORDER BY v.version DESC LIMIT 1`,
      input.courseId,c.tenantId,c.companyId,
    );
    if (!published.length) throw new NotFoundException('Published course version not found for assignment.');
    const courseVersionId = String(published[0].id);

    const staff = await this.resolveStaff(input.targetType,targetIds);
    if (!staff.length) throw new BadRequestException('No active staff matched the selected targets.');

    return this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1))) SELECT 1 FROM _advisory_lock`,
        `training-bulk:${c.tenantId}:${c.companyId}:${idempotencyKey}`,
      );
      let created = 0;
      let duplicates = 0;
      const assignmentIds: string[] = [];
      for (const person of staff) {
        const sourceKey = `bulk:${idempotencyKey}:${person.id}:${courseVersionId}`;
        const rows = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO training_assignments(
             tenant_id,company_id,branch_id,course_id,course_version_id,staff_id,
             source_type,source_key,rationale,due_at,assigned_by_user_id,updated_by_user_id
           )
           VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'MANUAL',$7,$8::jsonb,$9,$10::text,$10::text)
           ON CONFLICT(tenant_id,company_id,source_key) DO NOTHING
           RETURNING id`,
          c.tenantId,c.companyId,person.branchId,input.courseId,courseVersionId,person.id,sourceKey,
          JSON.stringify({ note: input.note?.trim() || null, targetType: input.targetType, targetIds }),
          dueAt,actorUserId,
        );
        if (!rows.length) {
          duplicates += 1;
          continue;
        }
        const assignmentId = String(rows[0].id);
        assignmentIds.push(assignmentId);
        created += 1;
        await tx.$executeRawUnsafe(
          `INSERT INTO training_assignment_events(
             assignment_id,tenant_id,company_id,branch_id,event_type,to_status,actor_user_id,note,metadata
           ) VALUES($1::text,$2::text,$3::text,$4::text,'CREATED','ASSIGNED',$5::text,$6,$7::jsonb)`,
          assignmentId,c.tenantId,c.companyId,person.branchId,actorUserId,
          input.note?.trim() || 'Bulk training assignment created',
          JSON.stringify({ courseVersionId, targetType: input.targetType }),
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO training_assignment_events(
             assignment_id,tenant_id,company_id,branch_id,event_type,to_status,actor_user_id,note,metadata
           ) VALUES($1::text,$2::text,$3::text,$4::text,'COURSE_VERSION_PINNED','ASSIGNED',$5::text,$6,$7::jsonb)`,
          assignmentId,c.tenantId,c.companyId,person.branchId,actorUserId,
          `Pinned to published course version ${published[0].version}`,
          JSON.stringify({ courseVersionId, courseVersion: Number(published[0].version) }),
        );
      }
      return {
        courseId: input.courseId,
        courseVersionId,
        courseVersion: Number(published[0].version),
        matchedStaff: staff.length,
        created,
        duplicates,
        assignmentIds,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async resolveStaff(targetType: TargetType, targetIds: string[]) {
    const c = this.context();
    let rows: any[];
    if (targetType === 'PERSONNEL') {
      rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT s.id,s."branchId" AS "branchId"
         FROM staff s JOIN branches b ON b.id=s."branchId"
         WHERE s."tenantId"=$1::text AND b."companyId"=$2::text AND s.status='ACTIVE'
           AND ($3::text IS NULL OR s."branchId"=$3::text) AND s.id=ANY($4::text[])`,
        c.tenantId,c.companyId,c.branchId,targetIds,
      );
      if (rows.length !== targetIds.length) throw new BadRequestException('One or more personnel targets are outside the active scope.');
      return rows;
    }
    if (targetType === 'BRANCH') {
      const branches = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT b.id FROM branches b JOIN companies co ON co.id=b."companyId"
         WHERE co.id=$1::text AND co."tenantId"=$2::text AND b.status='ACTIVE'
           AND ($3::text IS NULL OR b.id=$3::text) AND b.id=ANY($4::text[])`,
        c.companyId,c.tenantId,c.branchId,targetIds,
      );
      if (branches.length !== targetIds.length) throw new BadRequestException('One or more branch targets are outside the active scope.');
      return this.prisma.$queryRawUnsafe<any[]>(
        `SELECT s.id,s."branchId" AS "branchId"
         FROM staff s JOIN branches b ON b.id=s."branchId"
         WHERE s."tenantId"=$1::text AND b."companyId"=$2::text AND s.status='ACTIVE'
           AND s."branchId"=ANY($3::text[])
         ORDER BY s."branchId",s.id`,
        c.tenantId,c.companyId,targetIds,
      );
    }
    const positions = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM hr_positions
       WHERE tenant_id=$1::text AND company_id=$2::text AND status='ACTIVE' AND id=ANY($3::text[])`,
      c.tenantId,c.companyId,targetIds,
    );
    if (positions.length !== targetIds.length) throw new BadRequestException('One or more position targets are outside the active scope.');
    rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT s.id,s."branchId" AS "branchId"
       FROM hr_employee_assignments ea
       JOIN staff s ON s.id=ea.staff_id
       JOIN branches b ON b.id=s."branchId"
       WHERE ea.tenant_id=$1::text AND ea.company_id=$2::text
         AND ea.position_id=ANY($3::text[]) AND ea.effective_from<=CURRENT_DATE
         AND (ea.effective_to IS NULL OR ea.effective_to>=CURRENT_DATE)
         AND s.status='ACTIVE' AND ($4::text IS NULL OR s."branchId"=$4::text)
       ORDER BY s.id`,
      c.tenantId,c.companyId,targetIds,c.branchId,
    );
    return rows;
  }
}
