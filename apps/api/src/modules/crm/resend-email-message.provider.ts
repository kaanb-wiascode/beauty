import { BadRequestException, Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { CrmMessageProviderConnectionsService } from './crm-message-provider-connections.service';
import { CrmMessageProviderVaultService } from './crm-message-provider-vault.service';
import {
  CrmMessageProvider,
  CrmMessageProviderRegistryService,
  CrmProviderMessage,
  CrmProviderSendResult,
} from './crm-message-provider-registry.service';

@Injectable()
export class ResendEmailMessageProvider implements CrmMessageProvider, OnModuleInit {
  readonly key = 'resend-email';
  readonly channels = ['EMAIL'] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: CrmMessageProviderConnectionsService,
    private readonly vault: CrmMessageProviderVaultService,
    private readonly registry: CrmMessageProviderRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async send(message: CrmProviderMessage): Promise<CrmProviderSendResult> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ tenantId: string; companyId: string; branchId: string }>
    >(
      `SELECT tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId"
       FROM crm_messages WHERE id=$1::text LIMIT 1`,
      message.messageId,
    );
    const scope = rows[0];
    if (!scope) throw new BadRequestException('CRM message scope could not be resolved.');

    const connection = await this.connections.getScoped(this.key, 'EMAIL', scope);
    if (!connection?.enabled) {
      throw new ServiceUnavailableException('Resend e-mail connection is not enabled for this branch.');
    }
    const secrets = await this.vault.load(connection.id);
    const apiKey = secrets?.apiKey?.trim();
    if (!apiKey) throw new ServiceUnavailableException('Resend API key is not configured.');

    const fromEmail = String(connection.publicConfig.fromEmail ?? '').trim();
    const fromName = String(connection.publicConfig.fromName ?? '').trim();
    const to = message.recipient.trim();
    if (!/^\S+@\S+\.\S+$/.test(fromEmail) || !/^\S+@\S+\.\S+$/.test(to)) {
      throw new BadRequestException('Valid sender and recipient e-mail addresses are required.');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        to: [to],
        subject: message.subject?.trim() || 'Bilgilendirme',
        text: message.body,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const payload = (await response.json()) as { id?: string; message?: string; name?: string };
    if (!response.ok || !payload.id) {
      throw new ServiceUnavailableException(
        payload.message?.slice(0, 500) || `Resend e-mail send failed with HTTP ${response.status}.`,
      );
    }
    return { externalMessageId: payload.id, status: 'QUEUED' };
  }
}
