import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class CompetencyReviewService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private c() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  private assertBranch(branchId?: string | null) {
    const c = this.c();
    if (c.branchId && branchId && c.branchId !== branchId) {
      throw new BadRequestException('Branch outside active scope.');
    }
  }

  async createSchedule(
    input: {
      name: string;
      cadenceDays: number;
      dueOffsetDays?: number;
      branchId?: string | null;
      profileId?: string | null;
      nextRunAt?: string;
    },
    actorUserId: string,
  ) {
    const c = this.c();
    const name = input.name?.trim();
    const cadenceDays = Math.trunc(Number(input.cadenceDays));
    const dueOffsetDays = Math.trunc(Number(input.dueOffsetDays ?? 14));
    const branchId = input.branchId ?? c.branchId ?? null;
    this.assertBranch(branchId);
    if (!name) throw new BadRequestException('Schedule name is required.');
    if (!Number.isInteger(cadenceDays) || cadenceDays < 1) throw new BadRequestException('cadenceDays must be a positive integer.');
    if (!Number.isInteger(dueOffsetDays) || dueOffsetDays < 0) throw new BadRequestException('dueOffsetDays must be a non-negative integer.');
    const nextRunAt = input.nextRunAt ? new Date(input.nextRunAt) : new Date();
    if (Number.isNaN(nextRunAt.getTime())) throw new BadRequestException('nextRunAt is invalid.');

    if (input.profileId) {
      const profile = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM competency_profiles
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true LIMIT 1`,
        input.profileId,
        c.tenantId,
        c.companyId,
      );
      if (!profile.length) throw new NotFoundException('Active competency profile not found.');
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO competency_review_schedules(
         tenant_id,company_id,branch_id,name,cadence_days,due_offset_days,profile_id,next_run_at,created_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7::text,$8,$9::text)
       RETURNING id,name,branch_id AS "branchId",cadence_days AS "cadenceDays",
                 due_offset_days AS "dueOffsetDays",profile_id AS "profileId",is_active AS "isActive",
                 next_run_at AS "nextRunAt",last_run_at AS "lastRunAt"`,
      c.tenantId,
      c.companyId,
      branchId,
      name,
      cadenceDays,
      dueOffsetDays,
      input.profileId ?? null,
      nextRunAt,
      actorUserId,
    );
    return rows[0];
  }

  async listSchedules() {
    const c = this.c();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT s.id,s.name,s.branch_id AS "branchId",s.cadence_days AS "cadenceDays",
              s.due_offset_days AS "dueOffsetDays",s.profile_id AS "profileId",s.is_active AS "isActive",
              s.next_run_at AS "nextRunAt",s.last_run_at AS "lastRunAt",
              p.code AS "profileCode",p.name AS "profileName",p.version AS "profileVersion"
       FROM competency_review_schedules s
       LEFT JOIN competency_profiles p ON p.id=s.profile_id
       WHERE s.tenant_id=$1::text AND s.company_id=$2::text
         AND ($3::text IS NULL OR s.branch_id IS NULL OR s.branch_id=$3::text)
       ORDER BY s.is_active DESC,s.next_run_at,s.name`,
      c.tenantId,
      c.companyId,
      c.branchId,
    );
  }

  async processDue(actorUserId: string, limit = 50) {
    const c = this.c();
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit) || 50), 1), 200);
    return this.prisma.$transaction(
      async (tx) => {
        const schedules = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,branch_id AS "branchId",profile_id AS "profileId",cadence_days AS "cadenceDays",
                  due_offset_days AS "dueOffsetDays",next_run_at AS "nextRunAt"
           FROM competency_review_schedules
           WHERE tenant_id=$1::text AND company_id=$2::text AND is_active=true AND next_run_at<=now()
             AND ($3::text IS NULL OR branch_id IS NULL OR branch_id=$3::text)
           ORDER BY next_run_at,id
           FOR UPDATE SKIP LOCKED
           LIMIT $4`,
          c.tenantId,
          c.companyId,
          c.branchId,
          safeLimit,
        );

        let opened = 0;
        for (const schedule of schedules) {
          const reviews = await tx.$queryRawUnsafe<any[]>(
            `INSERT INTO competency_reviews(tenant_id,company_id,branch_id,schedule_id,staff_id,profile_id,due_at)
             SELECT sp.tenant_id,sp.company_id,sp.branch_id,$4::text,sp.staff_id,sp.profile_id,
                    now()+make_interval(days=>$5::int)
             FROM staff_competency_profiles sp
             JOIN staff st ON st.id=sp.staff_id AND st."tenantId"=sp.tenant_id AND st."branchId"=sp.branch_id
             WHERE sp.tenant_id=$1::text AND sp.company_id=$2::text
               AND sp.effective_from<=CURRENT_DATE AND (sp.effective_to IS NULL OR sp.effective_to>=CURRENT_DATE)
               AND ($3::text IS NULL OR sp.branch_id=$3::text)
               AND ($6::text IS NULL OR sp.profile_id=$6::text)
             ON CONFLICT DO NOTHING
             RETURNING id,branch_id AS "branchId"`,
            c.tenantId,
            c.companyId,
            schedule.branchId ?? c.branchId ?? null,
            schedule.id,
            Number(schedule.dueOffsetDays),
            schedule.profileId ?? null,
          );
          opened += reviews.length;
          for (const review of reviews) {
            await tx.$executeRawUnsafe(
              `INSERT INTO competency_review_events(
                 tenant_id,company_id,branch_id,review_id,event_type,actor_user_id,metadata
               ) VALUES($1::text,$2::text,$3::text,$4::text,'OPENED',$5::text,$6::jsonb)`,
              c.tenantId,
              c.companyId,
              review.branchId,
              review.id,
              actorUserId,
              JSON.stringify({ scheduleId: schedule.id }),
            );
          }
          await tx.$executeRawUnsafe(
            `UPDATE competency_review_schedules
             SET last_run_at=now(),
                 next_run_at=GREATEST(
                   next_run_at+make_interval(days=>cadence_days),
                   now()+make_interval(days=>cadence_days)
                 ),updated_at=now()
             WHERE id=$1::text`,
            schedule.id,
          );
        }
        return { claimedSchedules: schedules.length, openedReviews: opened };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listReviews(input: { staffId?: string; status?: string; limit?: number } = {}) {
    const c = this.c();
    const status = input.status?.trim().toUpperCase() || null;
    const limit = Math.min(Math.max(Math.trunc(Number(input.limit ?? 100)), 1), 300);
    if (status && !['OPEN', 'COMPLETED', 'CANCELLED'].includes(status)) throw new BadRequestException('Invalid competency review status.');
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.id,r.staff_id AS "staffId",r.profile_id AS "profileId",r.schedule_id AS "scheduleId",
              r.status,r.opened_at AS "openedAt",r.due_at AS "dueAt",r.completed_at AS "completedAt",
              p.code AS "profileCode",p.name AS "profileName",p.version AS "profileVersion"
       FROM competency_reviews r
       JOIN competency_profiles p ON p.id=r.profile_id
       WHERE r.tenant_id=$1::text AND r.company_id=$2::text
         AND ($3::text IS NULL OR r.branch_id=$3::text)
         AND ($4::text IS NULL OR r.staff_id=$4::text)
         AND ($5::text IS NULL OR r.status=$5::text)
       ORDER BY CASE WHEN r.status='OPEN' THEN 0 ELSE 1 END,r.due_at,r.opened_at DESC
       LIMIT $6`,
      c.tenantId,
      c.companyId,
      c.branchId,
      input.staffId ?? null,
      status,
      limit,
    );
  }

  async complete(reviewId: string, actorUserId: string) {
    const c = this.c();
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,branch_id AS "branchId",staff_id AS "staffId",profile_id AS "profileId",
                  status,opened_at AS "openedAt"
           FROM competency_reviews
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text IS NULL OR branch_id=$4::text)
           FOR UPDATE`,
          reviewId,
          c.tenantId,
          c.companyId,
          c.branchId,
        );
        if (!rows.length) throw new NotFoundException('Competency review not found.');
        const review = rows[0];
        if (review.status === 'COMPLETED') return { reviewId, status: 'COMPLETED', duplicate: true };
        if (review.status !== 'OPEN') throw new BadRequestException('Only an open competency review can be completed.');

        const missing = await tx.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS count
           FROM competency_profile_requirements req
           WHERE req.profile_id=$1::text
             AND NOT EXISTS(
               SELECT 1 FROM staff_competency_assessments a
               WHERE a.tenant_id=$2::text AND a.company_id=$3::text AND a.staff_id=$4::text
                 AND a.competency_id=req.competency_id AND a.assessed_at>=$5
             )`,
          review.profileId,
          c.tenantId,
          c.companyId,
          review.staffId,
          review.openedAt,
        );
        if (Number(missing[0]?.count ?? 0) > 0) {
          throw new BadRequestException('All profile competencies require a fresh assessment before review completion.');
        }

        const updated = await tx.$queryRawUnsafe<any[]>(
          `UPDATE competency_reviews
           SET status='COMPLETED',completed_at=now(),completed_by_user_id=$2::text,updated_at=now()
           WHERE id=$1::text
           RETURNING id,status,completed_at AS "completedAt"`,
          reviewId,
          actorUserId,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO competency_review_events(
             tenant_id,company_id,branch_id,review_id,event_type,actor_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,'COMPLETED',$5::text)`,
          c.tenantId,
          c.companyId,
          review.branchId,
          reviewId,
          actorUserId,
        );
        return { ...updated[0], duplicate: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async cancel(reviewId: string, reason: string | undefined, actorUserId: string) {
    const c = this.c();
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,branch_id AS "branchId",status FROM competency_reviews
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text IS NULL OR branch_id=$4::text)
           FOR UPDATE`,
          reviewId,
          c.tenantId,
          c.companyId,
          c.branchId,
        );
        if (!rows.length) throw new NotFoundException('Competency review not found.');
        if (rows[0].status === 'CANCELLED') return { reviewId, status: 'CANCELLED', duplicate: true };
        if (rows[0].status !== 'OPEN') throw new BadRequestException('Only an open competency review can be cancelled.');
        await tx.$executeRawUnsafe(`UPDATE competency_reviews SET status='CANCELLED',updated_at=now() WHERE id=$1::text`, reviewId);
        await tx.$executeRawUnsafe(
          `INSERT INTO competency_review_events(
             tenant_id,company_id,branch_id,review_id,event_type,actor_user_id,metadata
           ) VALUES($1::text,$2::text,$3::text,$4::text,'CANCELLED',$5::text,$6::jsonb)`,
          c.tenantId,
          c.companyId,
          rows[0].branchId,
          reviewId,
          actorUserId,
          JSON.stringify({ reason: reason?.trim() || null }),
        );
        return { reviewId, status: 'CANCELLED', duplicate: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
