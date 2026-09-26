import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PlatformTenantHealthService } from './platform-tenant-health.service';

const SEGMENTS = ['SMB', 'MID_MARKET', 'ENTERPRISE', 'STRATEGIC'] as const;
const SUCCESS_STAGES = ['ONBOARDING', 'ADOPTION', 'GROWTH', 'RENEWAL', 'AT_RISK', 'OFFBOARDING'] as const;
const RISK_STATUSES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const EVENT_SEVERITIES = ['INFO', 'WATCH', 'RISK', 'CRITICAL'] as const;

type Segment = (typeof SEGMENTS)[number];
type SuccessStage = (typeof SUCCESS_STAGES)[number];
type RiskStatus = (typeof RISK_STATUSES)[number];
type EventSeverity = (typeof EVENT_SEVERITIES)[number];

type PortfolioRow = {
  tenantId: string;
  legalName: string | null;
  accountOwnerUserId: string | null;
  customerSuccessOwnerUserId: string | null;
  customerSuccessOwnerEmail: string | null;
  goLiveAt: Date | null;
  renewalAt: Date | null;
  segment: Segment;
  successStage: SuccessStage;
  riskStatus: RiskStatus;
  riskReason: string | null;
  nextReviewAt: Date | null;
  healthScore: number | null;
  healthRiskBand: string | null;
  healthCalculatedAt: Date | null;
  updatedAt: Date;
};

type SuccessEventRow = {
  id: string;
  tenantId: string;
  eventType: string;
  severity: EventSeverity;
  summary: string;
  details: unknown;
  createdByPlatformUserId: string;
  happenedAt: Date;
  createdAt: Date;
};

@Injectable()
export class PlatformCustomerSuccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly health: PlatformTenantHealthService,
  ) {}

  async listPortfolio(input: {
    segment?: string;
    successStage?: string;
    riskStatus?: string;
    limit?: number;
  } = {}) {
    const segment = this.optionalEnum(input.segment, SEGMENTS, 'segment');
    const successStage = this.optionalEnum(input.successStage, SUCCESS_STAGES, 'successStage');
    const riskStatus = this.optionalEnum(input.riskStatus, RISK_STATUSES, 'riskStatus');
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('limit must be an integer between 1 and 200.');
    }

    return this.prisma.$queryRaw<PortfolioRow[]>`
      SELECT
        pca.tenant_id AS "tenantId",
        pca.legal_name AS "legalName",
        pca.account_owner_user_id AS "accountOwnerUserId",
        pca.customer_success_owner_user_id AS "customerSuccessOwnerUserId",
        cs.email AS "customerSuccessOwnerEmail",
        pca.go_live_at AS "goLiveAt",
        pca.renewal_at AS "renewalAt",
        pca.segment,
        pca.success_stage AS "successStage",
        pca.risk_status AS "riskStatus",
        pca.risk_reason AS "riskReason",
        pca.next_review_at AS "nextReviewAt",
        health.total_score AS "healthScore",
        health.risk_band AS "healthRiskBand",
        health.calculated_at AS "healthCalculatedAt",
        pca.updated_at AS "updatedAt"
      FROM platform_customer_accounts pca
      LEFT JOIN users cs ON cs.id = pca.customer_success_owner_user_id
      LEFT JOIN LATERAL (
        SELECT total_score, risk_band, calculated_at
        FROM platform_tenant_health_snapshots
        WHERE tenant_id = pca.tenant_id
        ORDER BY calculated_at DESC, id DESC
        LIMIT 1
      ) health ON TRUE
      WHERE (${segment}::text IS NULL OR pca.segment = ${segment})
        AND (${successStage}::text IS NULL OR pca.success_stage = ${successStage})
        AND (${riskStatus}::text IS NULL OR pca.risk_status = ${riskStatus})
      ORDER BY
        CASE pca.risk_status
          WHEN 'CRITICAL' THEN 4
          WHEN 'HIGH' THEN 3
          WHEN 'MEDIUM' THEN 2
          ELSE 1
        END DESC,
        health.total_score ASC NULLS FIRST,
        pca.next_review_at ASC NULLS LAST,
        pca.tenant_id ASC
      LIMIT ${limit}
    `;
  }

  async getDetail(tenantId: string) {
    const accounts = await this.prisma.$queryRaw<PortfolioRow[]>`
      SELECT
        pca.tenant_id AS "tenantId",
        pca.legal_name AS "legalName",
        pca.account_owner_user_id AS "accountOwnerUserId",
        pca.customer_success_owner_user_id AS "customerSuccessOwnerUserId",
        cs.email AS "customerSuccessOwnerEmail",
        pca.go_live_at AS "goLiveAt",
        pca.renewal_at AS "renewalAt",
        pca.segment,
        pca.success_stage AS "successStage",
        pca.risk_status AS "riskStatus",
        pca.risk_reason AS "riskReason",
        pca.next_review_at AS "nextReviewAt",
        health.total_score AS "healthScore",
        health.risk_band AS "healthRiskBand",
        health.calculated_at AS "healthCalculatedAt",
        pca.updated_at AS "updatedAt"
      FROM platform_customer_accounts pca
      LEFT JOIN users cs ON cs.id = pca.customer_success_owner_user_id
      LEFT JOIN LATERAL (
        SELECT total_score, risk_band, calculated_at
        FROM platform_tenant_health_snapshots
        WHERE tenant_id = pca.tenant_id
        ORDER BY calculated_at DESC, id DESC
        LIMIT 1
      ) health ON TRUE
      WHERE pca.tenant_id = ${tenantId}
      LIMIT 1
    `;
    const account = accounts[0];
    if (!account) throw new NotFoundException('Customer success account not found.');

    const events = await this.prisma.$queryRaw<SuccessEventRow[]>`
      SELECT
        id,
        tenant_id AS "tenantId",
        event_type AS "eventType",
        severity,
        summary,
        details,
        created_by_platform_user_id AS "createdByPlatformUserId",
        happened_at AS "happenedAt",
        created_at AS "createdAt"
      FROM platform_customer_success_events
      WHERE tenant_id = ${tenantId}
      ORDER BY happened_at DESC, id DESC
      LIMIT 100
    `;

    return {
      account,
      latestHealth: await this.health.getLatest(tenantId),
      events,
    };
  }

  async updateAccount(
    tenantId: string,
    actorUserId: string,
    input: {
      segment?: string;
      successStage?: string;
      riskStatus?: string;
      riskReason?: string | null;
      nextReviewAt?: string | null;
    },
    reason: string,
    correlationId?: string | null,
  ) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new BadRequestException('Customer success changes require a reason.');
    }
    const segment = input.segment === undefined ? undefined : this.requiredEnum(input.segment, SEGMENTS, 'segment');
    const successStage = input.successStage === undefined
      ? undefined
      : this.requiredEnum(input.successStage, SUCCESS_STAGES, 'successStage');
    const riskStatus = input.riskStatus === undefined
      ? undefined
      : this.requiredEnum(input.riskStatus, RISK_STATUSES, 'riskStatus');
    const riskReason = input.riskReason === undefined ? undefined : this.cleanText(input.riskReason, 2000);
    const nextReviewAt = input.nextReviewAt === undefined ? undefined : this.parseDate(input.nextReviewAt);

    return this.prisma.$transaction(async (tx) => {
      const beforeRows = await tx.$queryRaw<PortfolioRow[]>`
        SELECT
          tenant_id AS "tenantId",
          legal_name AS "legalName",
          account_owner_user_id AS "accountOwnerUserId",
          customer_success_owner_user_id AS "customerSuccessOwnerUserId",
          NULL::text AS "customerSuccessOwnerEmail",
          go_live_at AS "goLiveAt",
          renewal_at AS "renewalAt",
          segment,
          success_stage AS "successStage",
          risk_status AS "riskStatus",
          risk_reason AS "riskReason",
          next_review_at AS "nextReviewAt",
          NULL::integer AS "healthScore",
          NULL::text AS "healthRiskBand",
          NULL::timestamp AS "healthCalculatedAt",
          updated_at AS "updatedAt"
        FROM platform_customer_accounts
        WHERE tenant_id = ${tenantId}
        FOR UPDATE
      `;
      const before = beforeRows[0];
      if (!before) throw new NotFoundException('Customer success account not found.');

      const nextSegment = segment ?? before.segment;
      const nextSuccessStage = successStage ?? before.successStage;
      const nextRiskStatus = riskStatus ?? before.riskStatus;
      const nextRiskReason = riskReason === undefined ? before.riskReason : riskReason;
      const nextReview = nextReviewAt === undefined ? before.nextReviewAt : nextReviewAt;

      await tx.$executeRaw`
        UPDATE platform_customer_accounts
        SET segment = ${nextSegment},
            success_stage = ${nextSuccessStage},
            risk_status = ${nextRiskStatus},
            risk_reason = ${nextRiskReason},
            next_review_at = ${nextReview},
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ${tenantId}
      `;

      const after = {
        ...before,
        segment: nextSegment,
        successStage: nextSuccessStage,
        riskStatus: nextRiskStatus,
        riskReason: nextRiskReason,
        nextReviewAt: nextReview,
      };
      await this.audit.record(
        {
          actorUserId,
          resource: 'customer_success',
          action: 'account.update',
          targetTenantId: tenantId,
          targetEntityType: 'platform_customer_account',
          targetEntityId: tenantId,
          reason: normalizedReason,
          beforeState: before,
          afterState: after,
          correlationId: correlationId ?? null,
        },
        tx,
      );
      return after;
    });
  }

  async addEvent(
    tenantId: string,
    actorUserId: string,
    input: {
      eventType?: string;
      severity?: string;
      summary?: string;
      details?: unknown;
      happenedAt?: string | null;
    },
    correlationId?: string | null,
  ) {
    const eventType = input.eventType?.trim().toUpperCase();
    const summary = input.summary?.trim();
    if (!eventType || eventType.length > 80) {
      throw new BadRequestException('eventType must contain between 1 and 80 characters.');
    }
    if (!summary || summary.length > 1000) {
      throw new BadRequestException('summary must contain between 1 and 1000 characters.');
    }
    const severity = this.requiredEnum(input.severity ?? 'INFO', EVENT_SEVERITIES, 'severity');
    const happenedAt = this.parseDate(input.happenedAt ?? null) ?? new Date();
    const details = input.details == null ? null : JSON.stringify(input.details);

    const tenantRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1
    `;
    if (!tenantRows[0]) throw new NotFoundException('Tenant not found.');

    const rows = await this.prisma.$queryRaw<SuccessEventRow[]>`
      INSERT INTO platform_customer_success_events (
        tenant_id,
        event_type,
        severity,
        summary,
        details,
        created_by_platform_user_id,
        happened_at
      ) VALUES (
        ${tenantId},
        ${eventType},
        ${severity},
        ${summary},
        ${details}::jsonb,
        ${actorUserId},
        ${happenedAt}
      )
      RETURNING
        id,
        tenant_id AS "tenantId",
        event_type AS "eventType",
        severity,
        summary,
        details,
        created_by_platform_user_id AS "createdByPlatformUserId",
        happened_at AS "happenedAt",
        created_at AS "createdAt"
    `;
    const event = rows[0];
    await this.audit.record({
      actorUserId,
      resource: 'customer_success',
      action: 'event.create',
      targetTenantId: tenantId,
      targetEntityType: 'platform_customer_success_event',
      targetEntityId: event?.id ?? null,
      afterState: event,
      correlationId: correlationId ?? null,
    });
    return event;
  }

  private optionalEnum<const T extends readonly string[]>(
    value: string | undefined,
    allowed: T,
    field: string,
  ): T[number] | null {
    if (value == null || value.trim() === '') return null;
    return this.requiredEnum(value, allowed, field);
  }

  private requiredEnum<const T extends readonly string[]>(
    value: string,
    allowed: T,
    field: string,
  ): T[number] {
    const normalized = value.trim().toUpperCase();
    if (!allowed.includes(normalized as T[number])) {
      throw new BadRequestException(`Invalid ${field}.`);
    }
    return normalized as T[number];
  }

  private cleanText(value: string | null, maxLength: number) {
    if (value == null) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) {
      throw new BadRequestException(`Value must not exceed ${maxLength} characters.`);
    }
    return normalized;
  }

  private parseDate(value: string | null) {
    if (value == null || value.trim() === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date value.');
    return date;
  }
}
