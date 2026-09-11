export type QualityNotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

export interface QualityNotificationDispatchRequest {
  outboxId: string;
  feedbackRequestId: string;
  channel: QualityNotificationChannel;
  recipient: string;
  templateKey: 'quality.feedback-request';
  data: {
    tenantId: string;
    companyId: string;
    branchId: string;
    customerId: string;
  };
}

export interface QualityNotificationDispatchResult {
  providerMessageId?: string | null;
}

export class QualityNotificationProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'QualityNotificationProviderError';
  }
}

export interface QualityNotificationProvider {
  readonly key: string;
  isConfigured(): boolean;
  supports(channel: QualityNotificationChannel): boolean;
  send(request: QualityNotificationDispatchRequest): Promise<QualityNotificationDispatchResult>;
}
