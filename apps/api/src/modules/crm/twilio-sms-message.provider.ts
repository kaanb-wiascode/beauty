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
export class TwilioSmsMessageProvider implements CrmMessageProvider, OnModuleInit {
  readonly key = 'twilio-sms';
  readonly channels = ['SMS'] as const;

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

    const connection = await this.connections.getScoped(this.key, 'SMS', scope);
    if (!connection?.enabled) {
      throw new ServiceUnavailableException('Twilio SMS connection is not enabled for this branch.');
    }
    const secrets = await this.vault.load(connection.id);
    const accountSid = secrets?.accountSid?.trim();
    const authToken = secrets?.authToken?.trim();
    if (!accountSid || !authToken) {
      throw new ServiceUnavailableException('Twilio SMS credentials are not configured.');
    }

    const from = this.e164(String(connection.publicConfig.fromNumber ?? ''));
    const to = this.e164(message.recipient);
    const body = new URLSearchParams({ To: to, From: from, Body: message.body });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(10000),
      },
    );
    const payload = (await response.json()) as {
      sid?: string;
      status?: string;
      message?: string;
      code?: number;
    };
    if (!response.ok || !payload.sid) {
      const detail = payload.message?.slice(0, 500) || `Twilio SMS send failed with HTTP ${response.status}.`;
      throw new ServiceUnavailableException(detail);
    }
    return { externalMessageId: payload.sid, status: 'QUEUED' };
  }

  private e164(value: string) {
    const normalized = value.trim().replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      throw new BadRequestException('SMS number must use E.164 format.');
    }
    return normalized;
  }
}
