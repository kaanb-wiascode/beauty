import { Injectable } from '@nestjs/common';
import { FinancialIntegrationHealthService } from './financial-integration-health.service';

const ALERT_THRESHOLDS = {
  syncStaleHours: 24,
  activeRunStaleMinutes: 30,
  minimumAttemptsForFailureRate: 3,
  warningFailureRatePercent: 20,
  criticalFailureRatePercent: 50,
  warningStaleRecoveries24h: 1,
  warningUnmatchedBankTransactions: 25,
} as const;

type Severity = 'WARNING' | 'CRITICAL';

@Injectable()
export class FinancialIntegrationAlertsService {
  constructor(private readonly health: FinancialIntegrationHealthService) {}

  async get(integrationId: string) {
    const health = await this.health.get(integrationId);
    const alerts: Array<{ code: string; severity: Severity; message: string }> = [];

    if (!health.adapterAvailable) {
      alerts.push({
        code: 'ADAPTER_UNAVAILABLE',
        severity: 'CRITICAL',
        message: 'Provider adapter is unavailable.',
      });
    }
    if (!health.hasCredentials) {
      alerts.push({
        code: 'CREDENTIALS_MISSING',
        severity: 'CRITICAL',
        message: 'Integration credentials are missing.',
      });
    }
    if (health.consent.expired) {
      alerts.push({
        code: 'CONSENT_EXPIRED',
        severity: 'CRITICAL',
        message: 'Open Banking consent has expired.',
      });
    } else if (health.consent.expiringSoon) {
      alerts.push({
        code: 'CONSENT_EXPIRING_SOON',
        severity: 'WARNING',
        message: 'Open Banking consent expires within 7 days.',
      });
    }
    if (health.sync.activeRun?.stale) {
      alerts.push({
        code: 'SYNC_RUN_STALE',
        severity: 'CRITICAL',
        message: `Active sync heartbeat is older than ${ALERT_THRESHOLDS.activeRunStaleMinutes} minutes.`,
      });
    }
    if (health.sync.stale) {
      alerts.push({
        code: 'SYNC_STALE',
        severity: 'WARNING',
        message: `No successful sync has been recorded within ${ALERT_THRESHOLDS.syncStaleHours} hours.`,
      });
    }

    const attempts = health.observability.attempts;
    const failureRate = attempts
      ? (health.observability.failures / attempts) * 100
      : 0;
    if (attempts >= ALERT_THRESHOLDS.minimumAttemptsForFailureRate) {
      if (failureRate >= ALERT_THRESHOLDS.criticalFailureRatePercent) {
        alerts.push({
          code: 'SYNC_FAILURE_RATE_CRITICAL',
          severity: 'CRITICAL',
          message: `Sync failure rate is ${failureRate.toFixed(1)}% in the last 24 hours.`,
        });
      } else if (failureRate >= ALERT_THRESHOLDS.warningFailureRatePercent) {
        alerts.push({
          code: 'SYNC_FAILURE_RATE_WARNING',
          severity: 'WARNING',
          message: `Sync failure rate is ${failureRate.toFixed(1)}% in the last 24 hours.`,
        });
      }
    }

    if (
      health.observability.staleRecoveries >=
      ALERT_THRESHOLDS.warningStaleRecoveries24h
    ) {
      alerts.push({
        code: 'STALE_SYNC_RECOVERED',
        severity: 'WARNING',
        message: `${health.observability.staleRecoveries} stale sync run(s) were recovered in the last 24 hours.`,
      });
    }
    if (
      health.banking &&
      health.banking.unmatchedTransactionCount >=
        ALERT_THRESHOLDS.warningUnmatchedBankTransactions
    ) {
      alerts.push({
        code: 'UNMATCHED_BANK_TRANSACTIONS_HIGH',
        severity: 'WARNING',
        message: `${health.banking.unmatchedTransactionCount} bank transactions are still unmatched.`,
      });
    }
    if (health.pos && health.pos.refundReviewRequiredCount > 0) {
      alerts.push({
        code: 'POS_REFUND_REVIEW_REQUIRED',
        severity: 'CRITICAL',
        message: `${health.pos.refundReviewRequiredCount} POS refund request(s) require manual provider verification before any retry.`,
      });
    }

    const state = alerts.some((alert) => alert.severity === 'CRITICAL')
      ? 'CRITICAL'
      : alerts.length
        ? 'WARNING'
        : 'HEALTHY';

    return {
      integrationId,
      state,
      thresholds: ALERT_THRESHOLDS,
      alerts,
    };
  }
}
