import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { Prisma, PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import type {
  CreateReportSavedViewInput,
  UpdateReportSavedViewInput,
} from './dto/report-saved-view.dto';

export type ReportSavedViewRecord = {
  id: string;
  reportKey: string;
  name: string;
  filters: unknown;
  columns: unknown;
  sort: unknown;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ReportSavedViewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: JwtPayload, input: CreateReportSavedViewInput) {
    const id = randomUUID();
    const filters = JSON.stringify({
      from: input.filters.from.toISOString(),
      to: input.filters.to.toISOString(),
    });
    const columns = JSON.stringify([...new Set(input.columns)]);
    const sort = input.sort ? JSON.stringify(input.sort) : null;
    const [row] = await this.prisma.$queryRaw<ReportSavedViewRecord[]>(Prisma.sql`
      INSERT INTO "report_saved_views" (
        "id", "tenant_id", "company_id", "branch_id", "owner_id",
        "report_key", "name", "filters", "columns", "sort", "is_favorite"
      ) VALUES (
        ${id}, ${user.tenantId}, ${user.companyId}, ${user.branchId}, ${user.sub},
        ${input.reportKey}, ${input.name}, CAST(${filters} AS jsonb),
        CAST(${columns} AS jsonb),
        ${sort === null ? Prisma.sql`NULL` : Prisma.sql`CAST(${sort} AS jsonb)`},
        ${input.isFavorite}
      )
      RETURNING ${this.returningColumns()}
    `);
    return row ?? null;
  }

  async list(user: JwtPayload) {
    return this.prisma.$queryRaw<ReportSavedViewRecord[]>(Prisma.sql`
      SELECT ${this.selectColumns()}
      FROM "report_saved_views"
      WHERE ${this.ownerScope(user)}
      ORDER BY "is_favorite" DESC, "updated_at" DESC, "id" DESC
    `);
  }

  async findById(user: JwtPayload, id: string) {
    const [row] = await this.prisma.$queryRaw<ReportSavedViewRecord[]>(Prisma.sql`
      SELECT ${this.selectColumns()}
      FROM "report_saved_views"
      WHERE "id" = ${id}
        AND ${this.ownerScope(user)}
      LIMIT 1
    `);
    return row ?? null;
  }

  async update(user: JwtPayload, id: string, input: UpdateReportSavedViewInput) {
    const current = await this.findById(user, id);
    if (!current) return null;

    const name = input.name ?? current.name;
    const filters = JSON.stringify(
      input.filters
        ? { from: input.filters.from.toISOString(), to: input.filters.to.toISOString() }
        : current.filters,
    );
    const columns = JSON.stringify(
      input.columns ? [...new Set(input.columns)] : current.columns,
    );
    const sortValue = input.sort === undefined ? current.sort : input.sort;
    const sort = sortValue === null ? null : JSON.stringify(sortValue);
    const isFavorite = input.isFavorite ?? current.isFavorite;

    const [row] = await this.prisma.$queryRaw<ReportSavedViewRecord[]>(Prisma.sql`
      UPDATE "report_saved_views"
      SET
        "name" = ${name},
        "filters" = CAST(${filters} AS jsonb),
        "columns" = CAST(${columns} AS jsonb),
        "sort" = ${sort === null ? Prisma.sql`NULL` : Prisma.sql`CAST(${sort} AS jsonb)`},
        "is_favorite" = ${isFavorite},
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
        AND ${this.ownerScope(user)}
      RETURNING ${this.returningColumns()}
    `);
    return row ?? null;
  }

  async delete(user: JwtPayload, id: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      DELETE FROM "report_saved_views"
      WHERE "id" = ${id}
        AND ${this.ownerScope(user)}
      RETURNING "id"
    `);
    return rows.length > 0;
  }

  private ownerScope(user: JwtPayload) {
    const branch = user.branchId
      ? Prisma.sql`AND "branch_id" = ${user.branchId}`
      : Prisma.empty;
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
      "filters" AS "filters", "columns" AS "columns", "sort" AS "sort",
      "is_favorite" AS "isFavorite", "created_at" AS "createdAt",
      "updated_at" AS "updatedAt"
    `;
  }

  private returningColumns() {
    return this.selectColumns();
  }
}
