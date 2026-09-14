import type { CrmMessageChannel } from './crm-message-provider-registry.service';

export type CrmProviderWebhookRequest = {
  headers: Readonly<Record<string, string | string[] | undefined>>;
  rawBody?: Buffer;
  body: unknown;
};

type Scope = { tenantId: string; companyId: string; branchId: string };
type Base = Scope & { externalEventId: string };

export type CrmProviderWebhookEvent =
  | (Base & {
      type: 'DELIVERY';
      externalMessageId: string;
      status: 'SENT' | 'DELIVERED' | 'FAILED';
      errorMessage?: string | null;
    })
  | (Base & {
      type: 'INBOUND';
      channel: CrmMessageChannel;
      externalMessageId: string;
      sender: string;
      recipient: string;
      subject?: string | null;
      body: string;
      customerId?: string | null;
      leadId?: string | null;
      opportunityId?: string | null;
    });
