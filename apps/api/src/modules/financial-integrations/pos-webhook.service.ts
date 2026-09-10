import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { IntegrationSecretVaultService } from './integration-secret-vault.service';
import { ProviderRegistryService } from './provider-registry.service';
import { PosSalePaymentLinkageService } from './pos-sale-payment-linkage.service';
import { PosFinancialEventsService } from './pos-financial-events.service';

@Injectable()
export class PosWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistryService,
    private readonly vault: IntegrationSecretVaultService,
    private readonly paymentLinkage: PosSalePaymentLinkageService,
    private readonly financialEvents: PosFinancialEventsService,
  ) {}

  async ingest(
    integrationId: string,
    providerName: string,
    headers: Record<string, string | string[] | undefined>,
    payload: unknown,
  ) {
    const integrations = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",kind,provider,status
       FROM finance_integrations WHERE id=$1::text LIMIT 1`,
      integrationId,
    );
    if (!integrations.length) throw new BadRequestException('Financial integration not found.');
    const integration = integrations[0];
    if (integration.kind !== 'VIRTUAL_POS') throw new BadRequestException('Webhook target is not a virtual POS integration.');
    if (integration.status !== 'CONNECTED') throw new ServiceUnavailableException('Virtual POS integration is not connected.');
    if (integration.provider !== providerName.trim().toUpperCase()) throw new BadRequestException('Webhook provider does not match integration provider.');

    const adapter = this.providers.get('VIRTUAL_POS', integration.provider);
    if (!adapter.capabilities?.webhooks || !adapter.verifyWebhook || !adapter.parseWebhook) {
      throw new ServiceUnavailableException('Provider webhook runtime is not enabled yet.');
    }
    const credentials = await this.vault.loadOpaque(integrationId);
    if (!credentials) throw new ServiceUnavailableException('Provider credentials are not configured.');

    const canonicalPayload = JSON.stringify(payload ?? {});
    const payloadHash = createHash('sha256').update(canonicalPayload).digest('hex');
    const verified = await adapter.verifyWebhook({ headers, payload, credentials });
    if (!verified.valid) throw new BadRequestException('Webhook signature is invalid.');
    const event = await adapter.parseWebhook({ headers, payload, credentials });
    if (!event.externalEventId || !event.eventType) throw new BadRequestException('Provider webhook event is incomplete.');

    const eventId = randomUUID();
    const inserted = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO pos_webhook_events(
         id,tenant_id,company_id,branch_id,integration_id,provider,external_event_id,event_type,signature_valid,payload_hash,payload
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,TRUE,$9,$10::jsonb)
       ON CONFLICT(integration_id,external_event_id) DO NOTHING
       RETURNING id,status`,
      eventId,
      integration.tenantId,
      integration.companyId,
      integration.branchId,
      integrationId,
      integration.provider,
      event.externalEventId,
      event.eventType,
      payloadHash,
      canonicalPayload,
    );
    if (!inserted.length) return { duplicate: true, accepted: true };

    const scope = {
      tenantId: integration.tenantId as string,
      companyId: integration.companyId as string,
      branchId: (integration.branchId as string | null) ?? null,
    };

    try {
      let posTransactionId: string | null = null;
      let linkageResult: unknown = null;
      let financialEventResult: unknown = null;

      if (event.transaction) {
        const terminalRows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM pos_terminals WHERE integration_id=$1::text AND active=TRUE ORDER BY created_at LIMIT 1`,
          integrationId,
        );
        let terminalId = terminalRows[0]?.id;
        if (!terminalId) {
          terminalId = randomUUID();
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO pos_terminals(id,tenant_id,company_id,branch_id,integration_id,name,currency)
             VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7)`,
            terminalId,
            integration.tenantId,
            integration.companyId,
            integration.branchId,
            integrationId,
            `${integration.provider} POS`,
            event.transaction.currency,
          );
        }
        const upserted = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO pos_transactions(
             id,tenant_id,company_id,branch_id,terminal_id,provider_transaction_id,status,amount,fee_amount,net_amount,currency,
             installment_count,expected_settlement_at,created_at,updated_at
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
           ON CONFLICT(company_id,provider_transaction_id) DO UPDATE SET
             status=EXCLUDED.status,amount=EXCLUDED.amount,fee_amount=EXCLUDED.fee_amount,net_amount=EXCLUDED.net_amount,
             currency=EXCLUDED.currency,installment_count=EXCLUDED.installment_count,
             expected_settlement_at=EXCLUDED.expected_settlement_at,updated_at=NOW()
           RETURNING id`,
          randomUUID(),
          integration.tenantId,
          integration.companyId,
          integration.branchId,
          terminalId,
          event.transaction.externalTransactionId,
          event.transaction.status,
          event.transaction.grossAmount,
          event.transaction.feeAmount,
          event.transaction.netAmount,
          event.transaction.currency,
          event.transaction.installmentCount ?? 1,
          event.transaction.expectedSettlementAt ?? null,
          event.transaction.occurredAt,
        );
        posTransactionId = upserted[0]?.id ?? null;

        if (posTransactionId && ['AUTHORIZED', 'CAPTURED'].includes(event.transaction.status)) {
          linkageResult = await this.paymentLinkage.autoLinkOneInScope(scope, posTransactionId);
        }
      }

      if (event.financialEvent) {
        if (event.transaction && event.transaction.externalTransactionId !== event.financialEvent.providerTransactionId) {
          throw new BadRequestException('Webhook transaction and financial event references do not match.');
        }
        if (!posTransactionId) {
          const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT p.id
             FROM pos_transactions p
             JOIN pos_terminals t ON t.id=p.terminal_id
             WHERE t.integration_id=$1::text AND p.provider_transaction_id=$2
               AND p.tenant_id=$3::text AND p.company_id=$4::text
             LIMIT 1`,
            integrationId,
            event.financialEvent.providerTransactionId,
            integration.tenantId,
            integration.companyId,
          );
          posTransactionId = rows[0]?.id ?? null;
        }
        if (!posTransactionId) {
          throw new BadRequestException('Financial event references an unknown POS transaction.');
        }
        financialEventResult = await this.financialEvents.recordInScope(scope, posTransactionId, {
          eventType: event.financialEvent.eventType,
          externalEventId: event.financialEvent.externalEventId,
          amount: event.financialEvent.amount,
          feeAmount: event.financialEvent.feeAmount,
          occurredAt: event.financialEvent.occurredAt,
        });
      }

      const processingResult = {
        posTransactionId,
        linkage: linkageResult,
        financialEvent: financialEventResult,
      };
      await this.prisma.$executeRawUnsafe(
        `UPDATE pos_webhook_events
         SET status='PROCESSED',processed_at=NOW(),pos_transaction_id=$2::text,processing_result=$3::jsonb,error_message=NULL
         WHERE id=$1::text`,
        eventId,
        posTransactionId,
        JSON.stringify(processingResult),
      );
      return { duplicate: false, accepted: true, eventId, ...processingResult };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown webhook processing error';
      await this.prisma.$executeRawUnsafe(
        `UPDATE pos_webhook_events SET status='FAILED',error_message=$2,processed_at=NOW() WHERE id=$1::text`,
        eventId,
        message.slice(0, 1000),
      );
      throw error;
    }
  }
}
