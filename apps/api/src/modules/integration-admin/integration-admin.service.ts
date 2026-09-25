import { Injectable } from '@nestjs/common';

import { FinancialIntegrationHealthService } from '../financial-integrations/financial-integration-health.service';
import { FinancialIntegrationsService } from '../financial-integrations/financial-integrations.service';

@Injectable()
export class IntegrationAdminService {
  constructor(
    private readonly integrations: FinancialIntegrationsService,
    private readonly health: FinancialIntegrationHealthService,
  ) {}

  async catalog() {
    const rows = await this.integrations.list();
    const items = await Promise.all(
      rows.map(async (integration: any) => {
        try {
          const health = await this.health.get(integration.id);
          return {
            id: integration.id,
            category: this.category(integration.kind),
            kind: integration.kind,
            provider: integration.provider,
            displayName: integration.displayName,
            branchId: integration.branchId ?? null,
            status: this.status(health),
            sourceStatus: integration.status,
            healthy: health.healthy,
            runtimeReady: health.runtimeReady,
            hasCredentials: health.hasCredentials,
            consentExpiresAt: health.consent?.expiresAt ?? null,
            lastSyncAt: health.sync?.lastSyncAt ?? null,
            lastSyncStatus: health.sync?.lastStatus ?? null,
            lastError: this.safeError(health.lastError),
            issues: this.issues(health),
          };
        } catch {
          return {
            id: integration.id,
            category: this.category(integration.kind),
            kind: integration.kind,
            provider: integration.provider,
            displayName: integration.displayName,
            branchId: integration.branchId ?? null,
            status: integration.status === 'CONNECTED' ? 'DEGRADED' : 'DISCONNECTED',
            sourceStatus: integration.status,
            healthy: false,
            runtimeReady: false,
            hasCredentials: null,
            consentExpiresAt: integration.consentExpiresAt ?? null,
            lastSyncAt: integration.lastSyncAt ?? null,
            lastSyncStatus: null,
            lastError: this.safeError(integration.lastError),
            issues: ['Health details are currently unavailable.'],
          };
        }
      }),
    );

    const summary = items.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.status] += 1;
        if (item.issues.length) acc.withIssues += 1;
        return acc;
      },
      { total: 0, CONNECTED: 0, DEGRADED: 0, ERROR: 0, DISCONNECTED: 0, withIssues: 0 } as Record<string, number>,
    );

    return { summary, items };
  }

  private category(kind: string) {
    if (kind === 'OPEN_BANKING') return 'BANKING';
    if (kind === 'VIRTUAL_POS') return 'PAYMENTS';
    return 'OTHER';
  }

  private status(health: any): 'CONNECTED' | 'DEGRADED' | 'ERROR' | 'DISCONNECTED' {
    if (health.status === 'DISCONNECTED') return 'DISCONNECTED';
    if (health.lastError && !health.healthy) return 'ERROR';
    if (!health.healthy) return 'DEGRADED';
    return 'CONNECTED';
  }

  private issues(health: any) {
    const issues: string[] = [];
    if (!health.adapterAvailable) issues.push('Provider adapter unavailable.');
    if (!health.runtimeReady) issues.push('Provider runtime is not ready.');
    if (!health.hasCredentials) issues.push('Credentials are not configured.');
    if (health.consent?.expired) issues.push('Provider consent has expired.');
    else if (health.consent?.expiringSoon) issues.push('Provider consent expires soon.');
    if (health.sync?.stale) issues.push('Synchronization is stale.');
    if (health.sync?.activeRun?.stale) issues.push('Active synchronization run is stale.');
    if (health.sync?.lastStatus === 'FAILED') issues.push('Last synchronization failed.');
    return issues;
  }

  private safeError(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null;
    return value.replace(/(token|secret|password|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]').slice(0, 500);
  }
}
