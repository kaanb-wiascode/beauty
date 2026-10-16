import { Injectable } from '@nestjs/common';
import type {
  CrmProviderWebhookEvent,
  CrmProviderWebhookRequest,
} from './crm-message-webhook.types';

export type CrmMessageChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

export type CrmProviderMessage = {
  messageId: string;
  tenantId?: string;
  companyId?: string;
  branchId?: string;
  channel: CrmMessageChannel;
  recipient: string;
  subject?: string | null;
  body: string;
  idempotencyKey?: string | null;
};

export type CrmProviderSendResult = {
  externalMessageId: string;
  status: 'QUEUED' | 'SENT';
};

export interface CrmMessageProvider {
  readonly key: string;
  readonly channels: readonly CrmMessageChannel[];
  send(message: CrmProviderMessage): Promise<CrmProviderSendResult>;
  verifyWebhook?(request: CrmProviderWebhookRequest): Promise<boolean> | boolean;
  parseWebhook?(request: CrmProviderWebhookRequest): Promise<CrmProviderWebhookEvent | CrmProviderWebhookEvent[]> | CrmProviderWebhookEvent | CrmProviderWebhookEvent[];
  verifyChallenge?(query: Record<string, unknown>): Promise<string | null> | string | null;
}

@Injectable()
export class CrmMessageProviderRegistryService {
  private readonly providers = new Map<string, CrmMessageProvider>();

  register(provider: CrmMessageProvider) {
    this.providers.set(provider.key, provider);
  }

  list() {
    return Array.from(this.providers.values()).map((provider) => ({
      key: provider.key,
      channels: [...provider.channels],
      webhookReady: Boolean(provider.verifyWebhook && provider.parseWebhook),
      challengeReady: Boolean(provider.verifyChallenge),
    }));
  }

  resolveByKey(providerKey: string) {
    return this.providers.get(providerKey) ?? null;
  }

  resolve(channel: CrmMessageChannel, providerKey?: string | null) {
    if (providerKey) {
      const provider = this.providers.get(providerKey);
      return provider?.channels.includes(channel) ? provider : null;
    }
    return Array.from(this.providers.values()).find((provider) =>
      provider.channels.includes(channel),
    ) ?? null;
  }
}
