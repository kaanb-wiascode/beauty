import { BadRequestException, ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { BranchWorkingHoursCheckInput, UpdateBranchWorkingHoursInput } from './dto/branch-working-hours.dto';

type HoursRow = {
  id: string;
  weekday: number;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  crossesMidnight: boolean;
  timeZone: string;
  version: number;
};

@Injectable()
export class OperationsBranchWorkingHoursService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    if (!tenantId || !companyId) throw new InternalServerErrorException('Organization context is incomplete.');
    if (!branchId) throw new BadRequestException('A branch must be selected for this operation.');
    return { tenantId, companyId, branchId };
  }

  async list() {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<HoursRow[]>(
      `SELECT id,weekday,is_closed AS "isClosed",opens_at::text AS "opensAt",closes_at::text AS "closesAt",crosses_midnight AS "crossesMidnight",time_zone AS "timeZone",version
       FROM operations_branch_working_hours
       WHERE tenant_id=$1 AND company_id=$2 AND branch_id=$3
       ORDER BY weekday`, tenantId, companyId, branchId,
    );
  }

  async upsert(input: UpdateBranchWorkingHoursInput) {
    const { tenantId, companyId, branchId } = this.context();
    const current = await this.prisma.$queryRawUnsafe<Array<{ version: number }>>(
      `SELECT version FROM operations_branch_working_hours WHERE tenant_id=$1 AND company_id=$2 AND branch_id=$3 AND weekday=$4 LIMIT 1`,
      tenantId, companyId, branchId, input.weekday,
    );
    if (current[0] && current[0].version !== input.expectedVersion) {
      throw new ConflictException('Working-hours rule changed since it was read. Refresh and retry.');
    }
    if (!current[0] && input.expectedVersion !== 0) {
      throw new ConflictException('Working-hours rule no longer matches the expected version.');
    }
    const rows = await this.prisma.$queryRawUnsafe<HoursRow[]>(
      `INSERT INTO operations_branch_working_hours(tenant_id,company_id,branch_id,weekday,is_closed,opens_at,closes_at,crosses_midnight,time_zone)
       VALUES($1,$2,$3,$4,$5,$6::time,$7::time,$8,$9)
       ON CONFLICT (tenant_id,company_id,branch_id,weekday) DO UPDATE SET
         is_closed=EXCLUDED.is_closed, opens_at=EXCLUDED.opens_at, closes_at=EXCLUDED.closes_at,
         crosses_midnight=EXCLUDED.crosses_midnight, time_zone=EXCLUDED.time_zone,
         version=operations_branch_working_hours.version+1, updated_at=CURRENT_TIMESTAMP
       WHERE operations_branch_working_hours.version=$10
       RETURNING id,weekday,is_closed AS "isClosed",opens_at::text AS "opensAt",closes_at::text AS "closesAt",crosses_midnight AS "crossesMidnight",time_zone AS "timeZone",version`,
      tenantId, companyId, branchId, input.weekday, input.isClosed,
      input.isClosed ? null : input.opensAt, input.isClosed ? null : input.closesAt,
      input.isClosed ? false : input.crossesMidnight, input.timeZone, input.expectedVersion,
    );
    if (!rows[0]) throw new ConflictException('Working-hours rule changed during update.');
    return rows[0];
  }

  async check(input: BranchWorkingHoursCheckInput) {
    if (input.endAt <= input.startAt) throw new BadRequestException('Working-hours check requires a valid interval.');
    const { tenantId, companyId, branchId } = this.context();
    const configured = await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM operations_branch_working_hours WHERE tenant_id=$1 AND company_id=$2 AND branch_id=$3`,
      tenantId, companyId, branchId,
    );
    if (!configured[0]?.count) {
      return { configured: false, allowed: true, reason: 'BRANCH_HOURS_NOT_CONFIGURED' as const, rule: null };
    }
    const rules = await this.prisma.$queryRawUnsafe<HoursRow[]>(
      `SELECT id,weekday,is_closed AS "isClosed",opens_at::text AS "opensAt",closes_at::text AS "closesAt",crosses_midnight AS "crossesMidnight",time_zone AS "timeZone",version
       FROM operations_branch_working_hours
       WHERE tenant_id=$1 AND company_id=$2 AND branch_id=$3
         AND weekday = EXTRACT(DOW FROM ($4::timestamptz AT TIME ZONE time_zone))::int
       LIMIT 1`, tenantId, companyId, branchId, input.startAt,
    );
    const rule = rules[0];
    if (!rule || rule.isClosed || !rule.opensAt || !rule.closesAt) {
      return { configured: true, allowed: false, reason: 'BRANCH_CLOSED' as const, rule: rule ?? null };
    }
    const result = await this.prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
      `SELECT CASE WHEN $7::boolean THEN
          (($4::timestamptz AT TIME ZONE $6)::time >= $5::time OR ($4::timestamptz AT TIME ZONE $6)::time < $8::time)
          AND (($9::timestamptz AT TIME ZONE $6)::time > $5::time OR ($9::timestamptz AT TIME ZONE $6)::time <= $8::time)
        ELSE
          (($4::timestamptz AT TIME ZONE $6)::time >= $5::time AND ($9::timestamptz AT TIME ZONE $6)::time <= $8::time)
        END AS allowed`,
      tenantId, companyId, branchId, input.startAt, rule.opensAt, rule.timeZone, rule.crossesMidnight, rule.closesAt, input.endAt,
    );
    return { configured: true, allowed: Boolean(result[0]?.allowed), reason: result[0]?.allowed ? 'WITHIN_BRANCH_HOURS' as const : 'OUTSIDE_BRANCH_HOURS' as const, rule };
  }

  async assertOpen(input: BranchWorkingHoursCheckInput) {
    const result = await this.check(input);
    if (!result.allowed) throw new ConflictException({ code: result.reason, message: 'Requested interval is outside configured branch working hours.', rule: result.rule });
    return result;
  }
}
