import {
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Prisma, PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';

@Injectable()
export class ReportExportPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async assertCanQueue(user: JwtPayload) {
    const limit = this.activeJobLimit();
    const [result] = await this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "total"
      FROM "report_export_jobs"
      WHERE "tenant_id" = ${user.tenantId}
        AND "company_id" = ${user.companyId}
        AND "requested_by" = ${user.sub}
        AND "status" IN ('QUEUED', 'PROCESSING')
        ${user.branchId ? Prisma.sql`AND "branch_id" = ${user.branchId}` : Prisma.empty}
    `);

    const active = Number(result?.total ?? 0n);
    if (active >= limit) {
      throw new HttpException(
        `You already have ${active} active report exports. Wait for one to finish before starting another.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  assertRowLimit(rowCount: number) {
    const limit = this.rowLimit();
    if (rowCount > limit) {
      throw new ReportExportRowLimitError(limit, rowCount);
    }
  }

  private activeJobLimit() {
    return this.boundedInt('REPORT_EXPORT_ACTIVE_JOB_LIMIT', 3, 1, 20);
  }

  private rowLimit() {
    return this.boundedInt('REPORT_EXPORT_ROW_LIMIT', 50_000, 1_000, 500_000);
  }

  private boundedInt(key: string, fallback: number, min: number, max: number) {
    const value = Number(this.config.get<string>(key) ?? String(fallback));
    if (!Number.isInteger(value) || value < min || value > max) return fallback;
    return value;
  }
}

export class ReportExportRowLimitError extends Error {
  constructor(
    readonly limit: number,
    readonly rowCount: number,
  ) {
    super(`Report export row limit exceeded: ${rowCount} > ${limit}`);
    this.name = 'ReportExportRowLimitError';
  }
}
