import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { QualityScoreService } from './quality-score.service';

type Cadence = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type PeriodMode = 'PREVIOUS_DAY' | 'PREVIOUS_WEEK' | 'PREVIOUS_MONTH';

type ClaimedSchedule = {
  id: string;
  cadence: Cadence;
  periodMode: PeriodMode;
  policyId?: string | null;
  nextRunAt: Date | string;
};

@Injectable()
export class QualityScoreSchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly scores: QualityScoreService,
  ) {}

  private context() {
    return this.tenant.getContext();
  }

  private branchId() {
    const branchId = this.context().branchId;
    if (!branchId) throw new BadRequestException('Branch context is required for quality score scheduling.');
    return branchId;
  }

  private dateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private previousPeriod(mode: PeriodMode, now = new Date()) {
    const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    if (mode === 'PREVIOUS_DAY') {
      const day = new Date(current.getTime() - 86400000);
      const value = this.dateOnly(day);
      return { periodStart: value, periodEnd: value };
    }

    if (mode === 'PREVIOUS_WEEK') {
      const day = current.getUTCDay();
      const daysSinceMonday = (day + 6) % 7;
      const thisMonday = new Date(current.getTime() - daysSinceMonday * 86400000);
      const previousMonday = new Date(thisMonday.getTime() - 7 * 86400000);
      const previousSunday = new Date(thisMonday.getTime() - 86400000);
      return {
        periodStart: this.dateOnly(previousMonday),
        periodEnd: this.dateOnly(previousSunday),
      };
    }

    const firstThisMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1));
    const firstPreviousMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1));
    const lastPreviousMonth = new Date(firstThisMonth.getTime() - 86400000);
    return {
      periodStart: this.dateOnly(firstPreviousMonth),
      periodEnd: this.dateOnly(lastPreviousMonth),
    };
  }

  async createSchedule(
    input: {
      name: string;
      cadence?: Cadence;
      periodMode?: PeriodMode;
      policyId?: string | null;
      nextRunAt?: string;
    },
    actorUserId: string,
  ) {
    const c = this.context();
    const branchId = this.branchId();
    const name = input.name?.trim();
    const cadence = (input.cadence ?? 'MONTHLY').toUpperCase() as Cadence;
    const periodMode = (input.periodMode ?? 'PREVIOUS_MONTH').toUpperCase() as PeriodMode;
    if (!name) throw new BadRequestException('Schedule name is required.');
    if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(cadence)) throw new BadRequestException('Invalid score schedule cadence.');
    if (!['PREVIOUS_DAY', 'PREVIOUS_WEEK', 'PREVIOUS_MONTH'].includes(periodMode)) {
      throw new BadRequestException('Invalid score schedule periodMode.');
    }
    const nextRunAt = input.nextRunAt ? new Date(input.nextRunAt) : new Date();
    if (Number.isNaN(nextRunAt.getTime())) throw new BadRequestException('nextRunAt is invalid.');

    if (input.policyId) {
      const policy = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM quality_score_policies
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true LIMIT 1`,
        input.policyId,
        c.tenantId,
        c.companyId,
      );
      if (!policy.length) throw new NotFoundException('Active quality score policy not found.');
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO quality_score_schedules(
         tenant_id,company_id,branch_id,name,cadence,period_mode,policy_id,next_run_at,created_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7::text,$8,$9::text)
       ON CONFLICT(tenant_id,company_id,branch_id,name)
       DO UPDATE SET cadence=EXCLUDED.cadence,period_mode=EXCLUDED.period_mode,policy_id=EXCLUDED.policy_id,
                     next_run_at=EXCLUDED.next_run_at,is_active=true,last_error=NULL,updated_at=NOW()
       RETURNING id,name,cadence,period_mode AS "periodMode",policy_id AS "policyId",is_active AS "isActive",
                 next_run_at AS "nextRunAt",last_run_at AS "lastRunAt"`,
      c.tenantId,
      c.companyId,
      branchId,
      name,
      cadence,
      periodMode,
      input.policyId ?? null,
      nextRunAt,
      actorUserId,
    );
    return rows[0];
  }

  async listSchedules() {
    const c = this.context();
    const branchId = this.branchId();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT s.id,s.name,s.cadence,s.period_mode AS "periodMode",s.policy_id AS "policyId",
              s.is_active AS "isActive",s.next_run_at AS "nextRunAt",s.last_run_at AS "lastRunAt",
              s.last_period_start AS "lastPeriodStart",s.last_period_end AS "lastPeriodEnd",s.last_error AS "lastError",
              p.name AS "policyName",p.version AS "policyVersion"
       FROM quality_score_schedules s
       LEFT JOIN quality_score_policies p ON p.id=s.policy_id
       WHERE s.tenant_id=$1::text AND s.company_id=$2::text AND s.branch_id=$3::text
       ORDER BY s.is_active DESC,s.next_run_at,s.name`,
      c.tenantId,
      c.companyId,
      branchId,
    );
  }

  private async advanceSchedule(
    schedule: ClaimedSchedule,
    actorUserId: string,
    period: { periodStart: string; periodEnd: string },
    eventType: 'CALCULATED' | 'SKIPPED_EXISTING',
    scoreRunId?: string | null,
  ) {
    const c = this.context();
    const branchId = this.branchId();
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE quality_score_schedules
           SET last_run_at=NOW(),last_period_start=$2::date,last_period_end=$3::date,
               next_run_at=GREATEST(
                 CASE cadence
                   WHEN 'DAILY' THEN next_run_at+INTERVAL '1 day'
                   WHEN 'WEEKLY' THEN next_run_at+INTERVAL '1 week'
                   WHEN 'MONTHLY' THEN next_run_at+INTERVAL '1 month'
                 END,
                 CASE cadence
                   WHEN 'DAILY' THEN NOW()+INTERVAL '1 day'
                   WHEN 'WEEKLY' THEN NOW()+INTERVAL '1 week'
                   WHEN 'MONTHLY' THEN NOW()+INTERVAL '1 month'
                 END
               ),lease_owner=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=NOW()
           WHERE id=$1::text AND tenant_id=$4::text AND company_id=$5::text AND branch_id=$6::text`,
          schedule.id,
          period.periodStart,
          period.periodEnd,
          c.tenantId,
          c.companyId,
          branchId,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO quality_score_schedule_events(
             tenant_id,company_id,branch_id,schedule_id,event_type,period_start,period_end,score_run_id,actor_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6::date,$7::date,$8::text,$9::text)`,
          c.tenantId,
          c.companyId,
          branchId,
          schedule.id,
          eventType,
          period.periodStart,
          period.periodEnd,
          scoreRunId ?? null,
          actorUserId,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async failSchedule(
    schedule: ClaimedSchedule,
    actorUserId: string,
    period: { periodStart: string; periodEnd: string },
    error: unknown,
  ) {
    const c = this.context();
    const branchId = this.branchId();
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown score scheduler failure';
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE quality_score_schedules
           SET lease_owner=NULL,lease_expires_at=NULL,last_error=$2,updated_at=NOW()
           WHERE id=$1::text AND tenant_id=$3::text AND company_id=$4::text AND branch_id=$5::text`,
          schedule.id,
          message,
          c.tenantId,
          c.companyId,
          branchId,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO quality_score_schedule_events(
             tenant_id,company_id,branch_id,schedule_id,event_type,period_start,period_end,actor_user_id,metadata
           ) VALUES($1::text,$2::text,$3::text,$4::text,'FAILED',$5::date,$6::date,$7::text,$8::jsonb)`,
          c.tenantId,
          c.companyId,
          branchId,
          schedule.id,
          period.periodStart,
          period.periodEnd,
          actorUserId,
          JSON.stringify({ error: message }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return message;
  }

  async processDue(actorUserId: string, input: { limit?: number; workerId?: string } = {}) {
    const c = this.context();
    const branchId = this.branchId();
    const limit = Math.min(Math.max(Math.trunc(Number(input.limit ?? 20)), 1), 100);
    const workerId = (input.workerId?.trim() || `quality-score-scheduler:${actorUserId}`).slice(0, 120);

    const schedules = await this.prisma.$transaction(
      async (tx) => tx.$queryRawUnsafe<ClaimedSchedule[]>(
        `WITH candidates AS (
           SELECT id
           FROM quality_score_schedules
           WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
             AND is_active=true AND next_run_at<=NOW()
             AND (lease_expires_at IS NULL OR lease_expires_at<NOW())
           ORDER BY next_run_at,id
           LIMIT $4
           FOR UPDATE SKIP LOCKED
         )
         UPDATE quality_score_schedules s
         SET lease_owner=$5,lease_expires_at=NOW()+INTERVAL '10 minutes',updated_at=NOW()
         FROM candidates c
         WHERE s.id=c.id
         RETURNING s.id,s.cadence,s.period_mode AS "periodMode",s.policy_id AS "policyId",s.next_run_at AS "nextRunAt"`,
        c.tenantId,
        c.companyId,
        branchId,
        limit,
        workerId,
      ),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    let calculated = 0;
    let skippedExisting = 0;
    let failed = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const schedule of schedules) {
      const period = this.previousPeriod(schedule.periodMode);
      try {
        const existing = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT latest_run_id AS "latestRunId"
           FROM branch_quality_scores
           WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
             AND period_start=$4::date AND period_end=$5::date
           LIMIT 1`,
          c.tenantId,
          c.companyId,
          branchId,
          period.periodStart,
          period.periodEnd,
        );
        if (existing.length) {
          skippedExisting += 1;
          await this.advanceSchedule(schedule, actorUserId, period, 'SKIPPED_EXISTING', existing[0].latestRunId ?? null);
          results.push({ scheduleId: schedule.id, ...period, status: 'SKIPPED_EXISTING', runId: existing[0].latestRunId ?? null });
          continue;
        }

        const score = await this.scores.calculate(
          { periodStart: period.periodStart, periodEnd: period.periodEnd, policyId: schedule.policyId ?? null },
          actorUserId,
        );
        calculated += 1;
        await this.advanceSchedule(schedule, actorUserId, period, 'CALCULATED', score.runId);
        results.push({ scheduleId: schedule.id, ...period, status: 'CALCULATED', runId: score.runId, finalScore: score.finalScore });
      } catch (error) {
        failed += 1;
        const message = await this.failSchedule(schedule, actorUserId, period, error);
        results.push({ scheduleId: schedule.id, ...period, status: 'FAILED', error: message });
      }
    }

    return { claimed: schedules.length, calculated, skippedExisting, failed, results };
  }
}
