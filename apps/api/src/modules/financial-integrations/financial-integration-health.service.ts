import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { ProviderRegistryService } from './provider-registry.service';

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
      `SELECT i.id,i.kind,i.provider,i.status,i.auth_type AS "authType",
              i.consent_expires_at AS "consentExpiresAt",i.last_sync_at AS "lastSyncAt",
              i.last_error AS "lastError",i.updated_at AS "updatedAt",
              EXISTS(SELECT 1 FROM finance_integration_secrets s WHERE s.integration_id=i.id) AS "hasCredentials",
              (SELECT r.status FROM finance_integration_sync_runs r WHERE r.integration_id=i.id ORDER BY r.created_at DESC LIMIT 1) AS "lastSyncStatus",
              (SELECT r.completed_at FROM finance_integration_sync_runs r WHERE r.integration_id=i.id ORDER BY r.created_at DESC LIMIT 1) AS "lastSyncCompletedAt"
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
    const syncHealthy = !row.lastSyncStatus || row.lastSyncStatus === 'SUCCESS';
    const healthy = connected && adapterAvailable && Boolean(row.hasCredentials) && !consentExpired && syncHealthy;

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
        lastSyncAt: row.lastSyncAt,
        lastStatus: row.lastSyncStatus ?? null,
        lastCompletedAt: row.lastSyncCompletedAt ?? null,
      },
      lastError: row.lastError ?? null,
      capabilities: adapter?.capabilities ?? {},
    };
  }
}
