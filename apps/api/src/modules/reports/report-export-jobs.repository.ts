import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { Prisma, PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import type { ReportExportInput } from './dto/report-export.dto';
import type { ReportExportListInput } from './dto/report-export-list.dto';

export const reportExportStatuses = [
  'QUEUED',
  'PROCESSING',
  'READY',
  'FAILED',
  'EXPIRED',
] as const;

export type ReportExportStatus = (typeof reportExportStatuses)[number];

export type ReportExportJobRecord = {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string | null;
  roleScope: JwtPayload['roleScope'];
  membershipId: string;
  roleId: string;
  requestedBy: string;
  reportKey: string;
  format: string;
  status: ReportExportStatus;
  filters: unknown;
  columns: unknown;
  sort: unknown;
  includeSummary: boolean;
  includeCharts: boolean;
  rowCount: number | null;
  storageKey: string | null;
  scheduleRunId: string | null;
  errorCode: string | null;
  errorSummary: string | null;
  requestedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  updatedAt: Date;
};

type CreateExportJob = {
  user: JwtPayload;
  input: ReportExportInput;
  columns: readonly string[];
  scheduleRunId?: string | null;
};

@Injectable()
export class ReportExportJobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create({ user, input, columns, scheduleRunId = null }: CreateExportJob) {
    const id = randomUUID();
    const filters = JSON.stringify({
      from: input.filters.from.toISOString(),
      to: input.filters.to.toISOString(),
    });
    const selectedColumns = JSON.stringify(columns);
    const sort = input.sort ? JSON.stringify(input.sort) : null;

    const [job] = await this.prisma.$queryRaw<ReportExportJobRecord[]>(Prisma.sql`
      INSERT INTO "report_export_jobs" (
        "id", "tenant_id", "company_id", "branch_id", "role_scope",
        "membership_id", "role_id", "requested_by", "report_key", "format",
        "status", "filters", "columns", "sort", "include_summary", "include_charts",
        "schedule_run_id"
      ) VALUES (
        ${id}, ${user.tenantId}, ${user.companyId}, ${user.branchId},
        ${user.roleScope}, ${user.membershipId}, ${user.roleId}, ${user.sub},
        ${input.reportKey}, ${input.format}, 'QUEUED', CAST(${filters} AS jsonb),
        CAST(${selectedColumns} AS jsonb),
        ${sort === null ? Prisma.sql`NULL` : Prisma.sql`CAST(${sort} AS jsonb)`},
        ${input.includeSummary}, ${input.includeCharts}, ${scheduleRunId}
      )
      ON CONFLICT ("schedule_run_id") DO UPDATE
      SET "schedule_run_id" = EXCLUDED."schedule_run_id"
      RETURNING ${this.returningColumns()}
    `);

    return job;
  }

  async list(user: JwtPayload, input: ReportExportListInput) {
    const scope = this.scopeSql(user);
    const filters = this.listFiltersSql(user, input);
    const offset = (input.page - 1) * input.limit;

    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<ReportExportJobRecord[]>(Prisma.sql`
        SELECT ${this.selectColumns()}
        FROM "report_export_jobs"
        WHERE ${scope}
        ${filters}
        ORDER BY "requested_at" DESC, "id" DESC
        LIMIT ${input.limit}
        OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total"
        FROM "report_export_jobs"
        WHERE ${scope}
        ${filters}
      `),
    ]);

    const total = Number(counts[0]?.total ?? 0n);
    return {
      data: rows,
      meta: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / input.limit),
      },
    };
  }

  async findById(user: JwtPayload, id: string) {
    const scope = this.scopeSql(user);
    const [job] = await this.prisma.$queryRaw<ReportExportJobRecord[]>(Prisma.sql`
      SELECT ${this.selectColumns()}
      FROM "report_export_jobs"
      WHERE "id" = ${id}
        AND ${scope}
      LIMIT 1
    `);

    return job ?? null;
  }

  async claimNextQueued() {
    const [job] = await this.prisma.$queryRaw<ReportExportJobRecord[]>(Prisma.sql`
      WITH next_job AS (
        SELECT "id"
        FROM "report_export_jobs"
        WHERE "status" = 'QUEUED'
        ORDER BY "requested_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "report_export_jobs" AS job
      SET
        "status" = 'PROCESSING',
        "started_at" = CURRENT_TIMESTAMP,
        "updated_at" = CURRENT_TIMESTAMP
      FROM next_job
      WHERE job."id" = next_job."id"
      RETURNING ${this.returningColumns('job')}
    `);

    return job ?? null;
  }

  async markReady(
    id: string,
    input: { rowCount: number; storageKey: string; expiresAt: Date },
  ) {
    const [job] = await this.prisma.$queryRaw<ReportExportJobRecord[]>(Prisma.sql`
      UPDATE "report_export_jobs" AS job
      SET
        "status" = 'READY',
        "row_count" = ${input.rowCount},
        "storage_key" = ${input.storageKey},
        "completed_at" = CURRENT_TIMESTAMP,
        "expires_at" = ${input.expiresAt},
        "updated_at" = CURRENT_TIMESTAMP,
        "error_code" = NULL,
        "error_summary" = NULL
      WHERE job."id" = ${id}
        AND job."status" = 'PROCESSING'
      RETURNING ${this.returningColumns('job')}
    `);

    return job ?? null;
  }

  async markFailed(
    id: string,
    input: { errorCode: string; errorSummary: string },
  ) {
    const [job] = await this.prisma.$queryRaw<ReportExportJobRecord[]>(Prisma.sql`
      UPDATE "report_export_jobs" AS job
      SET
        "status" = 'FAILED',
        "completed_at" = CURRENT_TIMESTAMP,
        "updated_at" = CURRENT_TIMESTAMP,
        "error_code" = ${input.errorCode},
        "error_summary" = ${input.errorSummary.slice(0, 500)}
      WHERE job."id" = ${id}
        AND job."status" = 'PROCESSING'
      RETURNING ${this.returningColumns('job')}
    `);

    return job ?? null;
  }

  private listFiltersSql(user: JwtPayload, input: ReportExportListInput) {
    const fragments: Prisma.Sql[] = [];
    if (input.status) fragments.push(Prisma.sql`AND "status" = ${input.status}`);
    if (input.reportKey) fragments.push(Prisma.sql`AND "report_key" = ${input.reportKey}`);
    if (input.format) fragments.push(Prisma.sql`AND "format" = ${input.format}`);
    if (input.mine) fragments.push(Prisma.sql`AND "requested_by" = ${user.sub}`);
    return fragments.length ? Prisma.join(fragments, ' ') : Prisma.empty;
  }

  private scopeSql(user: JwtPayload) {
    if (user.branchId) {
      return Prisma.sql`
        "tenant_id" = ${user.tenantId}
        AND "company_id" = ${user.companyId}
        AND "branch_id" = ${user.branchId}
      `;
    }

    return Prisma.sql`
      "tenant_id" = ${user.tenantId}
      AND "company_id" = ${user.companyId}
    `;
  }

  private selectColumns() {
    return Prisma.sql`
      "id" AS "id",
      "tenant_id" AS "tenantId",
      "company_id" AS "companyId",
      "branch_id" AS "branchId",
      "role_scope" AS "roleScope",
      "membership_id" AS "membershipId",
      "role_id" AS "roleId",
      "requested_by" AS "requestedBy",
      "report_key" AS "reportKey",
      "format" AS "format",
      "status" AS "status",
      "filters" AS "filters",
      "columns" AS "columns",
      "sort" AS "sort",
      "include_summary" AS "includeSummary",
      "include_charts" AS "includeCharts",
      "row_count" AS "rowCount",
      "storage_key" AS "storageKey",
      "schedule_run_id" AS "scheduleRunId",
      "error_code" AS "errorCode",
      "error_summary" AS "errorSummary",
      "requested_at" AS "requestedAt",
      "started_at" AS "startedAt",
      "completed_at" AS "completedAt",
      "expires_at" AS "expiresAt",
      "updated_at" AS "updatedAt"
    `;
  }

  private returningColumns(alias?: string) {
    const prefix = alias ? Prisma.raw(`${alias}.`) : Prisma.empty;
    return Prisma.sql`
      ${prefix}"id" AS "id",
      ${prefix}"tenant_id" AS "tenantId",
      ${prefix}"company_id" AS "companyId",
      ${prefix}"branch_id" AS "branchId",
      ${prefix}"role_scope" AS "roleScope",
      ${prefix}"membership_id" AS "membershipId",
      ${prefix}"role_id" AS "roleId",
      ${prefix}"requested_by" AS "requestedBy",
      ${prefix}"report_key" AS "reportKey",
      ${prefix}"format" AS "format",
      ${prefix}"status" AS "status",
      ${prefix}"filters" AS "filters",
      ${prefix}"columns" AS "columns",
      ${prefix}"sort" AS "sort",
      ${prefix}"include_summary" AS "includeSummary",
      ${prefix}"include_charts" AS "includeCharts",
      ${prefix}"row_count" AS "rowCount",
      ${prefix}"storage_key" AS "storageKey",
      ${prefix}"schedule_run_id" AS "scheduleRunId",
      ${prefix}"error_code" AS "errorCode",
      ${prefix}"error_summary" AS "errorSummary",
      ${prefix}"requested_at" AS "requestedAt",
      ${prefix}"started_at" AS "startedAt",
      ${prefix}"completed_at" AS "completedAt",
      ${prefix}"expires_at" AS "expiresAt",
      ${prefix}"updated_at" AS "updatedAt"
    `;
  }
}
