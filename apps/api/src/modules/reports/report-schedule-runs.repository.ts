import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { Prisma, PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import type { ReportKey } from './report-definition';

export type ReportScheduleRunStatus = 'CLAIMED' | 'QUEUED' | 'FAILED';

export type ClaimedReportScheduleRun = {
  runId: string;
  runStatus: ReportScheduleRunStatus;
  scheduledFor: Date;
  exportJobId: string | null;
  scheduleId: string;
  tenantId: string;
  companyId: string;
  branchId: string | null;
  ownerId: string;
  membershipId: string;
  roleId: string;
  roleScope: JwtPayload['roleScope'];
  reportKey: ReportKey;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  timezone: string;
  localHour: number;
  localMinute: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  format: 'CSV' | 'XLSX' | 'PDF';
  filters: unknown;
  columns: unknown;
  sort: unknown;
  includeSummary: boolean;
};

export type PublicReportScheduleRun = {
  id: string;
  scheduledFor: Date;
  status: ReportScheduleRunStatus;
  exportJobId: string | null;
  errorCode: string | null;
  errorSummary: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

@Injectable()
export class ReportScheduleRunsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claimDue() {
    const runId = randomUUID();
    const [row] = await this.prisma.$queryRaw<ClaimedReportScheduleRun[]>(Prisma.sql`
      WITH due AS (
        SELECT "id", "next_run_at"
        FROM "report_schedules"
        WHERE "enabled" = TRUE
          AND "next_run_at" IS NOT NULL
          AND "next_run_at" <= CURRENT_TIMESTAMP
        ORDER BY "next_run_at" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      ), inserted AS (
        INSERT INTO "report_schedule_runs" (
          "id", "schedule_id", "tenant_id", "company_id", "branch_id",
          "owner_id", "scheduled_for", "status"
        )
        SELECT
          ${runId}, s."id", s."tenant_id", s."company_id", s."branch_id",
          s."owner_id", s."next_run_at", 'CLAIMED'
        FROM "report_schedules" s
        JOIN due d ON d."id" = s."id"
        ON CONFLICT ("schedule_id", "scheduled_for") DO NOTHING
        RETURNING "id", "schedule_id", "scheduled_for", "status", "export_job_id"
      ), chosen AS (
        SELECT * FROM inserted
        UNION ALL
        SELECT r."id", r."schedule_id", r."scheduled_for", r."status", r."export_job_id"
        FROM "report_schedule_runs" r
        JOIN due d
          ON d."id" = r."schedule_id"
         AND d."next_run_at" = r."scheduled_for"
        WHERE NOT EXISTS (SELECT 1 FROM inserted)
        LIMIT 1
      )
      SELECT
        c."id" AS "runId",
        c."status" AS "runStatus",
        c."scheduled_for" AS "scheduledFor",
        c."export_job_id" AS "exportJobId",
        s."id" AS "scheduleId",
        s."tenant_id" AS "tenantId",
        s."company_id" AS "companyId",
        s."branch_id" AS "branchId",
        s."owner_id" AS "ownerId",
        s."membership_id" AS "membershipId",
        s."role_id" AS "roleId",
        s."role_scope" AS "roleScope",
        s."report_key" AS "reportKey",
        s."frequency" AS "frequency",
        s."timezone" AS "timezone",
        s."local_hour" AS "localHour",
        s."local_minute" AS "localMinute",
        s."day_of_week" AS "dayOfWeek",
        s."day_of_month" AS "dayOfMonth",
        s."format" AS "format",
        s."filters" AS "filters",
        s."columns" AS "columns",
        s."sort" AS "sort",
        s."include_summary" AS "includeSummary"
      FROM chosen c
      JOIN "report_schedules" s ON s."id" = c."schedule_id"
      LIMIT 1
    `);
    return row ?? null;
  }

  async markQueued(runId: string, exportJobId: string) {
    const [row] = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "report_schedule_runs"
      SET
        "status" = 'QUEUED',
        "export_job_id" = ${exportJobId},
        "error_code" = NULL,
        "error_summary" = NULL,
        "completed_at" = CURRENT_TIMESTAMP,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${runId}
        AND "status" IN ('CLAIMED','QUEUED','FAILED')
      RETURNING "id"
    `);
    return Boolean(row);
  }

  async markFailed(runId: string, errorCode: string, errorSummary: string) {
    const [row] = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "report_schedule_runs"
      SET
        "status" = 'FAILED',
        "error_code" = ${errorCode},
        "error_summary" = ${errorSummary.slice(0, 500)},
        "completed_at" = CURRENT_TIMESTAMP,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${runId}
        AND "status" = 'CLAIMED'
      RETURNING "id"
    `);
    return Boolean(row);
  }

  async advanceSchedule(
    input: {
      scheduleId: string;
      scheduledFor: Date;
      nextRunAt: Date;
      exportJobId?: string | null;
      errorCode?: string | null;
    },
  ) {
    const [row] = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "report_schedules"
      SET
        "last_run_at" = ${input.scheduledFor},
        "next_run_at" = ${input.nextRunAt},
        "last_export_job_id" = ${input.exportJobId ?? null},
        "last_error_code" = ${input.errorCode ?? null},
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.scheduleId}
        AND "enabled" = TRUE
        AND "next_run_at" = ${input.scheduledFor}
      RETURNING "id"
    `);
    return Boolean(row);
  }

  async listForOwner(user: JwtPayload, scheduleId: string, limit = 20) {
    const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
    const branch = user.branchId
      ? Prisma.sql`AND s."branch_id" = ${user.branchId}`
      : Prisma.sql`AND s."branch_id" IS NULL`;
    return this.prisma.$queryRaw<PublicReportScheduleRun[]>(Prisma.sql`
      SELECT
        r."id" AS "id",
        r."scheduled_for" AS "scheduledFor",
        r."status" AS "status",
        r."export_job_id" AS "exportJobId",
        r."error_code" AS "errorCode",
        r."error_summary" AS "errorSummary",
        r."created_at" AS "createdAt",
        r."completed_at" AS "completedAt"
      FROM "report_schedule_runs" r
      JOIN "report_schedules" s ON s."id" = r."schedule_id"
      WHERE s."id" = ${scheduleId}
        AND s."tenant_id" = ${user.tenantId}
        AND s."company_id" = ${user.companyId}
        AND s."owner_id" = ${user.sub}
        ${branch}
      ORDER BY r."scheduled_for" DESC, r."id" DESC
      LIMIT ${bounded}
    `;
  }
}
