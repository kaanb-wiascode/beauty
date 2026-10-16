import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { Prisma, PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import type {
  CreateReportScheduleInput,
  UpdateReportScheduleInput,
} from './dto/report-schedule.dto';
import type { ReportKey } from './report-definition';

export type ReportScheduleRecord = {
  id: string;
  reportKey: ReportKey;
  name: string;
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
  enabled: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastExportJobId: string | null;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ReportSchedulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    user: JwtPayload,
    input: CreateReportScheduleInput,
    nextRunAt: Date | null,
  ) {
    const id = randomUUID();
    const filters = JSON.stringify({ datePreset: input.datePreset });
    const columns = JSON.stringify([...new Set(input.columns)]);
    const sort = input.sort ? JSON.stringify(input.sort) : null;
    const [row] = await this.prisma.$queryRaw<ReportScheduleRecord[]>(Prisma.sql`
      INSERT INTO "report_schedules" (
        "id", "tenant_id", "company_id", "branch_id", "owner_id",
        "membership_id", "role_id", "role_scope", "name", "report_key",
        "frequency", "timezone", "local_hour", "local_minute", "day_of_week",
        "day_of_month", "format", "filters", "columns", "sort",
        "include_summary", "enabled", "next_run_at"
      ) VALUES (
        ${id}, ${user.tenantId}, ${user.companyId}, ${user.branchId}, ${user.sub},
        ${user.membershipId}, ${user.roleId}, ${user.roleScope}, ${input.name}, ${input.reportKey},
        ${input.frequency}, ${input.timezone}, ${input.localHour}, ${input.localMinute},
        ${input.dayOfWeek ?? null}, ${input.dayOfMonth ?? null}, ${input.format},
        CAST(${filters} AS jsonb), CAST(${columns} AS jsonb),
        ${sort === null ? Prisma.sql`NULL` : Prisma.sql`CAST(${sort} AS jsonb)`},
        ${input.includeSummary}, ${input.enabled}, ${nextRunAt}
      )
      RETURNING ${this.returningColumns()}
    `);
    return row ?? null;
  }

  list(user: JwtPayload) {
    return this.prisma.$queryRaw<ReportScheduleRecord[]>(Prisma.sql`
      SELECT ${this.selectColumns()}
      FROM "report_schedules"
      WHERE ${this.ownerScope(user)}
      ORDER BY "enabled" DESC, "next_run_at" ASC NULLS LAST, "updated_at" DESC
    `);
  }

  async findById(user: JwtPayload, id: string) {
    const [row] = await this.prisma.$queryRaw<ReportScheduleRecord[]>(Prisma.sql`
      SELECT ${this.selectColumns()}
      FROM "report_schedules"
      WHERE "id" = ${id} AND ${this.ownerScope(user)}
      LIMIT 1
    `);
    return row ?? null;
  }

  async update(
    user: JwtPayload,
    id: string,
    input: UpdateReportScheduleInput,
    nextRunAt: Date | null | undefined,
  ) {
    const nextRun = nextRunAt === undefined
      ? Prisma.empty
      : Prisma.sql`, "next_run_at" = ${nextRunAt}`;
    const [row] = await this.prisma.$queryRaw<ReportScheduleRecord[]>(Prisma.sql`
      UPDATE "report_schedules"
      SET
        "name" = COALESCE(${input.name ?? null}, "name"),
        "enabled" = COALESCE(${input.enabled ?? null}, "enabled"),
        "updated_at" = CURRENT_TIMESTAMP
        ${nextRun}
      WHERE "id" = ${id} AND ${this.ownerScope(user)}
      RETURNING ${this.returningColumns()}
    `);
    return row ?? null;
  }

  async delete(user: JwtPayload, id: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      DELETE FROM "report_schedules"
      WHERE "id" = ${id} AND ${this.ownerScope(user)}
      RETURNING "id"
    `);
    return rows.length > 0;
  }

  private ownerScope(user: JwtPayload) {
    const branch = user.branchId
      ? Prisma.sql`AND "branch_id" = ${user.branchId}`
      : Prisma.sql`AND "branch_id" IS NULL`;
    return Prisma.sql`
      "tenant_id" = ${user.tenantId}
      AND "company_id" = ${user.companyId}
      AND "owner_id" = ${user.sub}
      ${branch}
    `;
  }

  private selectColumns() {
    return Prisma.sql`
      "id" AS "id", "report_key" AS "reportKey", "name" AS "name",
      "frequency" AS "frequency", "timezone" AS "timezone",
      "local_hour" AS "localHour", "local_minute" AS "localMinute",
      "day_of_week" AS "dayOfWeek", "day_of_month" AS "dayOfMonth",
      "format" AS "format", "filters" AS "filters", "columns" AS "columns",
      "sort" AS "sort", "include_summary" AS "includeSummary",
      "enabled" AS "enabled", "next_run_at" AS "nextRunAt",
      "last_run_at" AS "lastRunAt", "last_export_job_id" AS "lastExportJobId",
      "last_error_code" AS "lastErrorCode", "created_at" AS "createdAt",
      "updated_at" AS "updatedAt"
    `;
  }

  private returningColumns() {
    return this.selectColumns();
  }
}
