import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { IntegrationSecretVaultService } from './integration-secret-vault.service';
import { ProviderRegistryService } from './provider-registry.service';
import { PosSettlementService } from './pos-settlement.service';

@Injectable()
export class PosSettlementImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly providers: ProviderRegistryService,
    private readonly vault: IntegrationSecretVaultService,
    private readonly settlements: PosSettlementService,
  ) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  async import(integrationId: string, date: Date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new BadRequestException('Settlement import date is invalid.');
    }
    const ctx = this.context();
    const integrations = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      provider: string;
      kind: string;
      status: string;
      branchId: string | null;
    }>>(
      `SELECT id,provider,kind,status,branch_id AS "branchId"
       FROM finance_integrations
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      integrationId,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
    );
    if (!integrations.length) throw new NotFoundException('Financial integration not found.');
    const integration = integrations[0];
    if (integration.kind !== 'VIRTUAL_POS') {
      throw new BadRequestException('Only virtual POS integrations can import settlements.');
    }
    if (integration.status !== 'CONNECTED') {
      throw new BadRequestException('POS integration must be connected.');
    }

    const adapter = this.providers.get('VIRTUAL_POS', integration.provider);
    if (!adapter.capabilities?.settlementImport || !adapter.listPosSettlements) {
      throw new ServiceUnavailableException('Provider does not support automated settlement import.');
    }
    const credentials = await this.vault.loadOpaque(integrationId);
    if (!credentials) throw new ServiceUnavailableException('Provider credentials are not configured.');

    const batches = await adapter.listPosSettlements({ credentials, date });
    const imported: unknown[] = [];
    const skipped: Array<{ providerSettlementId: string; reason: string }> = [];

    for (const batch of batches) {
      if (batch.requiresReview) {
        skipped.push({
          providerSettlementId: batch.providerSettlementId,
          reason: batch.reviewReason ? `PROVIDER_REVIEW_REQUIRED:${batch.reviewReason}` : 'PROVIDER_REVIEW_REQUIRED',
        });
        continue;
      }

      const existing = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM pos_settlements
         WHERE integration_id=$1::text AND provider_settlement_id=$2
           AND tenant_id=$3::text AND company_id=$4::text
         LIMIT 1`,
        integrationId,
        batch.providerSettlementId,
        ctx.tenantId,
        ctx.companyId,
      );
      if (existing.length) {
        skipped.push({ providerSettlementId: batch.providerSettlementId, reason: 'ALREADY_IMPORTED' });
        continue;
      }

      const providerIds = Array.from(new Set(batch.providerTransactionIds.map((id) => id.trim()).filter(Boolean)));
      if (!providerIds.length) {
        skipped.push({ providerSettlementId: batch.providerSettlementId, reason: 'NO_TRANSACTIONS' });
        continue;
      }
      const local = await this.prisma.$queryRawUnsafe<Array<{
        id: string;
        providerTransactionId: string;
        currency: string;
        status: string;
        settledAt: Date | null;
      }>>(
        `SELECT p.id,p.provider_transaction_id AS "providerTransactionId",p.currency,p.status,p.settled_at AS "settledAt"
         FROM pos_transactions p
         JOIN pos_terminals t ON t.id=p.terminal_id
         WHERE t.integration_id=$1::text
           AND p.tenant_id=$2::text AND p.company_id=$3::text
           AND ($4::text IS NULL OR p.branch_id=$4::text)
           AND p.provider_transaction_id = ANY($5::text[])`,
        integrationId,
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
        providerIds,
      );
      const localIds = new Set(local.map((row) => row.providerTransactionId));
      const missing = providerIds.filter((id) => !localIds.has(id));
      if (missing.length) {
        skipped.push({ providerSettlementId: batch.providerSettlementId, reason: `UNMATCHED_TRANSACTIONS:${missing.length}` });
        continue;
      }
      if (local.some((row) => row.currency.toUpperCase() !== batch.currency.toUpperCase())) {
        skipped.push({ providerSettlementId: batch.providerSettlementId, reason: 'CURRENCY_MISMATCH' });
        continue;
      }
      if (local.some((row) => row.status !== 'CAPTURED' || row.settledAt)) {
        skipped.push({ providerSettlementId: batch.providerSettlementId, reason: 'TRANSACTION_NOT_SETTLEABLE' });
        continue;
      }
      if (!(batch.settledAt instanceof Date) || Number.isNaN(batch.settledAt.getTime()) || batch.settledAt.getTime() <= 0) {
        skipped.push({ providerSettlementId: batch.providerSettlementId, reason: 'SETTLEMENT_DATE_INVALID' });
        continue;
      }

      imported.push(await this.settlements.record(integrationId, {
        providerSettlementId: batch.providerSettlementId,
        transactionIds: local.map((row) => row.id),
        settledAt: batch.settledAt,
      }));
    }

    return {
      integrationId,
      provider: integration.provider,
      requestedDate: date,
      providerBatchCount: batches.length,
      importedCount: imported.length,
      skippedCount: skipped.length,
      imported,
      skipped,
    };
  }
}
