import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  versionId: string | null;
  version: number | null;
  currency: string | null;
  monthlyPrice: string | null;
  annualPrice: string | null;
  branchLimit: number | null;
  userLimit: number | null;
  effectiveFrom: Date | null;
};

type SubscriptionRow = {
  id: string;
  tenantId: string;
  status: string;
  planId: string;
  planCode: string;
  planName: string;
  planVersionId: string;
  planVersion: number;
  currency: string;
  contractedMonthlyPrice: string | null;
  contractedAnnualPrice: string | null;
  discountPercent: string;
  startsAt: Date;
  renewsAt: Date | null;
  endsAt: Date | null;
  version: number;
  updatedAt: Date;
};

@Injectable()
export class PlatformSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async listPlans() {
    return this.prisma.$queryRaw<PlanRow[]>`
      SELECT
        p.id, p.code, p.name, p.description, p.status,
        pv.id AS "versionId", pv.version,
        pv.currency, pv.monthly_price::text AS "monthlyPrice",
        pv.annual_price::text AS "annualPrice",
        pv.branch_limit AS "branchLimit", pv.user_limit AS "userLimit",
        pv.effective_from AS "effectiveFrom"
      FROM platform_plans p
      LEFT JOIN LATERAL (
        SELECT * FROM platform_plan_versions x
        WHERE x.plan_id = p.id AND x.status = 'ACTIVE'
        ORDER BY x.version DESC LIMIT 1
      ) pv ON TRUE
      ORDER BY p.name ASC, p.code ASC
    `;
  }

  async getTenantSubscription(tenantId: string) {
    await this.assertTenant(tenantId);
    const rows = await this.prisma.$queryRaw<SubscriptionRow[]>`
      SELECT
        s.id, s.tenant_id AS "tenantId", s.status,
        p.id AS "planId", p.code AS "planCode", p.name AS "planName",
        pv.id AS "planVersionId", pv.version AS "planVersion",
        s.currency,
        s.contracted_monthly_price::text AS "contractedMonthlyPrice",
        s.contracted_annual_price::text AS "contractedAnnualPrice",
        s.discount_percent::text AS "discountPercent",
        s.starts_at AS "startsAt", s.renews_at AS "renewsAt", s.ends_at AS "endsAt",
        s.version, s.updated_at AS "updatedAt"
      FROM platform_tenant_subscriptions s
      INNER JOIN platform_plan_versions pv ON pv.id = s.plan_version_id
      INNER JOIN platform_plans p ON p.id = pv.plan_id
      WHERE s.tenant_id = ${tenantId}
        AND s.status IN ('TRIAL','ACTIVE','PAST_DUE')
      ORDER BY s.created_at DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async createPlanVersion(actorUserId: string, input: {
    code: string;
    name: string;
    description?: string | null;
    currency?: string;
    monthlyPrice?: number | null;
    annualPrice?: number | null;
    branchLimit?: number | null;
    userLimit?: number | null;
  }) {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    const currency = (input.currency ?? 'TRY').trim().toUpperCase();
    if (!code || code.length > 50 || !name || name.length > 150 || currency.length !== 3) {
      throw new BadRequestException('Valid plan code, name and 3-letter currency are required.');
    }
    if (input.monthlyPrice != null && input.monthlyPrice < 0) throw new BadRequestException('monthlyPrice must be non-negative.');
    if (input.annualPrice != null && input.annualPrice < 0) throw new BadRequestException('annualPrice must be non-negative.');

    const result = await this.prisma.$transaction(async (tx) => {
      const plans = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO platform_plans (code, name, description, updated_at)
        VALUES (${code}, ${name}, ${input.description?.trim() || null}, NOW())
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          updated_at = NOW()
        RETURNING id
      `;
      const planId = plans[0]!.id;
      const versions = await tx.$queryRaw<Array<{ id: string; version: number }>>`
        INSERT INTO platform_plan_versions (
          plan_id, version, currency, monthly_price, annual_price, branch_limit, user_limit, status
        )
        SELECT ${planId}, COALESCE(MAX(version), 0) + 1, ${currency},
          ${input.monthlyPrice ?? null}, ${input.annualPrice ?? null},
          ${input.branchLimit ?? null}, ${input.userLimit ?? null}, 'ACTIVE'
        FROM platform_plan_versions WHERE plan_id = ${planId}
        RETURNING id, version
      `;
      return { planId, versionId: versions[0]!.id, version: versions[0]!.version };
    });

    await this.audit.record({
      actorUserId,
      resource: 'subscriptions',
      action: 'plan.version.create',
      targetEntityType: 'platform_plan',
      targetEntityId: result.planId,
      afterState: { code, name, ...result },
    });
    return result;
  }

  async assignSubscription(actorUserId: string, tenantId: string, input: {
    planVersionId: string;
    status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE';
    contractedMonthlyPrice?: number | null;
    contractedAnnualPrice?: number | null;
    discountPercent?: number;
    startsAt?: string | null;
    renewsAt?: string | null;
  }) {
    await this.assertTenant(tenantId);
    const planRows = await this.prisma.$queryRaw<Array<{ id: string; currency: string; monthlyPrice: string | null; annualPrice: string | null }>>`
      SELECT id, currency, monthly_price::text AS "monthlyPrice", annual_price::text AS "annualPrice"
      FROM platform_plan_versions WHERE id = ${input.planVersionId} AND status = 'ACTIVE' LIMIT 1
    `;
    const plan = planRows[0];
    if (!plan) throw new NotFoundException('Active plan version was not found.');
    const status = input.status ?? 'ACTIVE';
    const discountPercent = input.discountPercent ?? 0;
    if (discountPercent < 0 || discountPercent > 100) throw new BadRequestException('discountPercent must be between 0 and 100.');
    const monthly = input.contractedMonthlyPrice ?? (plan.monthlyPrice == null ? null : Number(plan.monthlyPrice));
    const annual = input.contractedAnnualPrice ?? (plan.annualPrice == null ? null : Number(plan.annualPrice));
    const startsAt = this.parseDate(input.startsAt) ?? new Date();
    const renewsAt = this.parseDate(input.renewsAt);
    const before = await this.getTenantSubscription(tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE platform_tenant_subscriptions
        SET status = 'CANCELLED', ends_at = NOW(), updated_by_user_id = ${actorUserId}, updated_at = NOW(), version = version + 1
        WHERE tenant_id = ${tenantId} AND status IN ('TRIAL','ACTIVE','PAST_DUE')
      `;
      await tx.$executeRaw`
        INSERT INTO platform_tenant_subscriptions (
          tenant_id, plan_version_id, status, currency,
          contracted_monthly_price, contracted_annual_price, discount_percent,
          starts_at, renews_at, created_by_user_id, updated_by_user_id
        ) VALUES (
          ${tenantId}, ${input.planVersionId}, ${status}, ${plan.currency},
          ${monthly}, ${annual}, ${discountPercent}, ${startsAt}, ${renewsAt}, ${actorUserId}, ${actorUserId}
        )
      `;
    });
    const after = await this.getTenantSubscription(tenantId);
    await this.audit.record({
      actorUserId,
      resource: 'subscriptions',
      action: 'subscription.assign',
      targetTenantId: tenantId,
      targetEntityType: 'tenant_subscription',
      targetEntityId: after?.id ?? null,
      beforeState: before,
      afterState: after,
    });
    return after;
  }

  private async assertTenant(tenantId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1`;
    if (!rows[0]) throw new NotFoundException('Platform customer tenant was not found.');
  }

  private parseDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date value.');
    return date;
  }
}
