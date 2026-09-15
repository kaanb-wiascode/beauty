import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { Prisma, PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import type { ReportExportInput } from './dto/report-export.dto';

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
};

@Injectable()
export class ReportExportJobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create({ user, input, columns }: CreateExportJob) {
    const id = randomUUID();
    const filters = JSON.stringify({
      from: input.filters.from.toISOString(),
      to: input.filters.to.toISOString(),
    });
    const selectedColumns = JSON.stringify(columns);
    const sort = input.sort ? JSON.stringify(input.sort) : null;

    const [job] = await this.prisma.$queryRaw<ReportExportJobRecord[]>(Prisma.sql`
      INSERT INTO "report_export_jobs" (
        "id",
        "tenant_id",
        "company_id",
        "branch_id",
        "role_scope",
        "requested_by",
        "report_key",
        "format",
        "status",
        "filters",
        "columns",
        "sort",
        "include_summary",
        "include_charts"
      ) VALUES (
        ${id},
        ${user.tenantId},
        ${user.companyId},
        ${user.branchId},
        ${user.roleScope},
        ${user.sub},
        ${input.reportKey},
        ${input.format},
        'QUEUED',
        CAST(${filters} AS jsonb),
        CAST(${selectedColumns} AS jsonb),
        ${sort === null ? Prisma.sql`NULL` : Prisma.sql`CAST(${sort} AS jsonb)`},
        ${input.includeSummary},
        ${input.includeCharts}
      )
      RETURNING
        "id" AS "id",
        "tenant_id" AS "tenantId",
        "company_id" AS "companyId",
        "branch_id" AS "branchId",
        "role_scope" AS "roleScope",
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
        "error_code" AS "errorCode",
        "error_summary" AS "errorSummary",
        "requested_at" AS "requestedAt",
        "started_at" AS "startedAt",
        "completed_at" AS "completedAt",
        "expires_at" AS "expiresAt",
        "updated_at" AS "updatedAt"
    `);

    return job;
  }

  list(
    user: JwtPayload,
    input: { status?: ReportExportStatus; limit: number },
  ) {
    const scope = this.scopeSql(user);
    const status = input.status
      ? Prisma.sql`AND "status" = ${input.status}`
      : Prisma.empty;

    return this.prisma.$queryRaw<ReportExportJobRecord[]>(Prisma.sql`
      SELECT
        "id" AS "id",
        "tenant_id" AS "tenantId",
        "company_id" AS "companyId",
        "branch_id" AS "branchId",
        "role_scope" AS "roleScope",
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
        "error_code" AS "errorCode",
        "error_summary" AS "errorSummary",
        "requested_at" AS "requestedAt",
        "started_at" AS "startedAt",
        "completed_at" AS "completedAt",
        "expires_at" AS "expiresAt",
        "updated_at" AS "updatedAt"
      FROM "report_export_jobs"
      WHERE ${scope}
      ${status}
      ORDER BY "requested_at" DESC
      LIMIT ${input.limit}
    `);
  }

  async findById(user: JwtPayload, id: string) {
    const scope = this.scopeSql(user);
    const [job] = await this.prisma.$queryRaw<ReportExportJobRecord[]>(Prisma.sql`
      SELECT
        "id" AS "id",
        "tenant_id" AS "tenantId",
        "company_id" AS "companyId",
        "branch_id" AS "branchId",
        "role_scope" AS "roleScope",
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
        "error_code" AS "errorCode",
        "error_summary" AS "errorSummary",
        "requested_at" AS "requestedAt",
        "started_at" AS "startedAt",
        "completed_at" AS "completedAt",
        "expires_at" AS "expiresAt",
        "updated_at" AS "updatedAt"
      FROM "report_export_jobs"
      WHERE "id" = ${id}
        AND ${scope}
      LIMIT 1
    `);

    return job ?? null;
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
}
