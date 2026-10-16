import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { ProviderRegistryService } from './provider-registry.service';

const SYNC_STALE_HOURS = 24;
const ACTIVE_RUN_STALE_MINUTES = 30;

@Injectable()
export class FinancialIntegrationHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly providers: ProviderRegistryService,
  ) {}

  async get(integrationId: string) {
    const tenantId = this.tenant.getTenantId();
    const companyId = this.tenant.getCompanyId();
    const branchId = this.tenant.getBranchId();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id,i.kind,i.provider,i.status,i.auth_type AS "authType",i.metadata,
              i.consent_expires_at AS "consentExpiresAt",i.last_sync_at AS "lastSyncAt",
              i.last_error AS "lastError",i.updated_at AS "updatedAt",
              EXISTS(SELECT 1 FROM finance_integration_secrets s WHERE s.integration_id=i.id) AS "hasCredentials",
              (SELECT r.status FROM finance_integration_sync_runs r WHERE r.integration_id=i.id ORDER BY r.started_at DESC LIMIT 1) AS "lastSyncStatus",
              (SELECT r.completed_at FROM finance_integration_sync_runs r WHERE r.integration_id=i.id ORDER BY r.started_at DESC LIMIT 1) AS "lastSyncCompletedAt",
              (SELECT r.id FROM finance_integration_sync_runs r
               WHERE r.integration_id=i.id AND r.status='RUNNING'
               ORDER BY r.started_at DESC LIMIT 1) AS "activeRunId",
              (SELECT r.started_at FROM finance_integration_sync_runs r
               WHERE r.integration_id=i.id AND r.status='RUNNING'
               ORDER BY r.started_at DESC LIMIT 1) AS "activeRunStartedAt",
              (SELECT r.heartbeat_at FROM finance_integration_sync_runs r
               WHERE r.integration_id=i.id AND r.status='RUNNING'
               ORDER BY r.started_at DESC LIMIT 1) AS "activeRunHeartbeatAt",
              (SELECT COUNT(*)::int FROM finance_integration_sync_runs r
               WHERE r.integration_id=i.id AND r.status='SUCCESS' AND r.started_at>=NOW()-INTERVAL '24 hours') AS "syncSuccess24h",
              (SELECT COUNT(*)::int FROM finance_integration_sync_runs r
               WHERE r.integration_id=i.id AND r.status='FAILED' AND r.started_at>=NOW()-INTERVAL '24 hours') AS "syncFailure24h",
              (SELECT COUNT(*)::int FROM finance_integration_sync_runs r
               WHERE r.integration_id=i.id AND r.recovered_at>=NOW()-INTERVAL '24 hours') AS "staleRecovered24h",
              (SELECT MAX(r.recovered_at) FROM finance_integration_sync_runs r
               WHERE r.integration_id=i.id AND r.recovered_at IS NOT NULL) AS "lastRecoveredAt",
              (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (r.completed_at-r.started_at))*1000),0)::bigint
               FROM finance_integration_sync_runs r
               WHERE r.integration_id=i.id AND r.completed_at IS NOT NULL AND r.started_at>=NOW()-INTERVAL '24 hours') AS "avgSyncDurationMs24h",
              (SELECT COUNT(*)::int FROM bank_accounts a WHERE a.integration_id=i.id AND a.active=TRUE) AS "activeAccountCount",
              (SELECT COUNT(*)::int FROM bank_accounts a WHERE a.integration_id=i.id AND a.active=FALSE) AS "inactiveAccountCount",
              (SELECT MAX(a.balance_as_of) FROM bank_accounts a WHERE a.integration_id=i.id AND a.active=TRUE) AS "latestBalanceAsOf",
              COALESCE((
                SELECT jsonb_object_agg(b.currency,b.total)
                FROM (
                  SELECT a.currency,SUM(COALESCE(a.current_balance,0))::text AS total
                  FROM bank_accounts a
                  WHERE a.integration_id=i.id AND a.active=TRUE
                  GROUP BY a.currency
                ) b
              ),'{}'::jsonb) AS "currentBalancesByCurrency",
              (SELECT MAX(t.booked_at)
               FROM bank_transactions t
               JOIN bank_accounts a ON a.id=t.bank_account_id
               WHERE a.integration_id=i.id) AS "latestBankTransactionAt",
              (SELECT COUNT(*)::int
               FROM bank_transactions t
               JOIN bank_accounts a ON a.id=t.bank_account_id
               WHERE a.integration_id=i.id AND t.reconciliation_status='UNMATCHED') AS "unmatchedBankTransactionCount",
              (SELECT COUNT(*)::int
               FROM pos_refund_requests rr
               WHERE rr.integration_id=i.id
                 AND rr.tenant_id=i.tenant_id
                 AND rr.company_id=i.company_id
                 AND rr.status='REVIEW_REQUIRED') AS "refundReviewRequiredCount"
       FROM finance_integrations i
       WHERE i.id=$1::text AND i.tenant_id=$2::text AND i.company_id=$3::text
         AND ($4::text IS NULL OR i.branch_id=$4::text)
       LIMIT 1`,
      integrationId,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Financial integration not found.');
    const row = rows[0];
    const adapterAvailable = this.providers.has(row.kind, row.provider);
    const adapter = adapterAvailable ? this.providers.get(row.kind, row.provider) : null;
    const consentExpiresAt = row.consentExpiresAt ? new Date(row.consentExpiresAt) : null;
    const consentExpired = Boolean(consentExpiresAt && consentExpiresAt.getTime() <= Date.now());
    const consentExpiringSoon = Boolean(
      consentExpiresAt &&
        !consentExpired &&
        consentExpiresAt.getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000,
    );
    const connected = row.status === 'CONNECTED';
    const lastSyncAt = row.lastSyncAt ? new Date(row.lastSyncAt) : null;
    const syncStale = Boolean(
      lastSyncAt &&
        lastSyncAt.getTime() < Date.now() - SYNC_STALE_HOURS * 60 * 60 * 1000,
    );
    const activeRunStartedAt = row.activeRunStartedAt ? new Date(row.activeRunStartedAt) : null;
    const activeRunHeartbeatAt = row.activeRunHeartbeatAt
      ? new Date(row.activeRunHeartbeatAt)
      : activeRunStartedAt;
    const activeRunStale = Boolean(
      row.activeRunId &&
        activeRunHeartbeatAt &&
        activeRunHeartbeatAt.getTime() <
          Date.now() - ACTIVE_RUN_STALE_MINUTES * 60 * 1000,
    );
    const syncHealthy =
      !row.lastSyncStatus ||
      row.lastSyncStatus === 'SUCCESS' ||
      (row.lastSyncStatus === 'RUNNING' && !activeRunStale);
    const success24h = Number(row.syncSuccess24h ?? 0);
    const failure24h = Number(row.syncFailure24h ?? 0);
    const attempts24h = success24h + failure24h;
    const healthy =
      connected &&
      adapterAvailable &&
      Boolean(row.hasCredentials) &&
      !consentExpired &&
      syncHealthy &&
      !activeRunStale;
    const metadata =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const watermarkRaw = metadata.bankTransactionWatermark;
    const transactionWatermark =
      typeof watermarkRaw === 'string' && !Number.isNaN(new Date(watermarkRaw).getTime())
        ? new Date(watermarkRaw)
        : null;
    const overlapRaw = metadata.bankTransactionOverlapHours;
    const transactionOverlapHours =
      typeof overlapRaw === 'number' && Number.isFinite(overlapRaw) ? overlapRaw : null;

    return {
      integrationId: row.id,
      kind: row.kind,
      provider: row.provider,
      status: row.status,
      authType: row.authType,
      healthy,
      adapterAvailable,
      runtimeReady: adapter?.runtimeReady ?? false,
      hasCredentials: Boolean(row.hasCredentials),
      consent: {
        expiresAt: consentExpiresAt,
        expired: consentExpired,
        expiringSoon: consentExpiringSoon,
      },
      sync: {
        lastSyncAt,
        lastStatus: row.lastSyncStatus ?? null,
        lastCompletedAt: row.lastSyncCompletedAt ?? null,
        stale: syncStale,
        staleAfterHours: SYNC_STALE_HOURS,
        activeRun: row.activeRunId
          ? {
              id: row.activeRunId,
              startedAt: activeRunStartedAt,
              heartbeatAt: activeRunHeartbeatAt,
              stale: activeRunStale,
              staleAfterMinutes: ACTIVE_RUN_STALE_MINUTES,
            }
          : null,
      },
      observability: {
        windowHours: 24,
        attempts: attempts24h,
        successes: success24h,
        failures: failure24h,
        successRate: attempts24h
          ? Number(((success24h / attempts24h) * 100).toFixed(2))
          : null,
        averageDurationMs: Number(row.avgSyncDurationMs24h ?? 0),
        staleRecoveries: Number(row.staleRecovered24h ?? 0),
        lastRecoveredAt: row.lastRecoveredAt ? new Date(row.lastRecoveredAt) : null,
      },
      banking:
        row.kind === 'OPEN_BANKING'
          ? {
              activeAccountCount: Number(row.activeAccountCount ?? 0),
              inactiveAccountCount: Number(row.inactiveAccountCount ?? 0),
              latestBalanceAsOf: row.latestBalanceAsOf
                ? new Date(row.latestBalanceAsOf)
                : null,
              currentBalancesByCurrency: row.currentBalancesByCurrency ?? {},
              latestTransactionAt: row.latestBankTransactionAt
                ? new Date(row.latestBankTransactionAt)
                : null,
              unmatchedTransactionCount: Number(row.unmatchedBankTransactionCount ?? 0),
              transactionWatermark,
              transactionOverlapHours,
            }
          : null,
      pos:
        row.kind === 'VIRTUAL_POS'
          ? {
              refundReviewRequiredCount: Number(row.refundReviewRequiredCount ?? 0),
            }
          : null,
      lastError: row.lastError ?? null,
      capabilities: adapter?.capabilities ?? {},
    };
  }
}
