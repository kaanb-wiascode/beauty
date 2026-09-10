export interface ProviderAuthorizationRequest {
  integrationId: string;
  callbackUrl: string;
  state: string;
}

export interface ProviderAuthorizationResult {
  authorizationUrl: string;
}

export interface ProviderTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  externalConnectionId?: string;
  consentExpiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ProviderBankAccount {
  externalAccountId: string;
  bankName: string;
  accountName: string;
  ibanMasked?: string;
  currency: string;
  currentBalance?: number;
  availableBalance?: number;
  balanceAsOf?: Date;
}

export interface ProviderBankTransaction {
  externalTransactionId: string;
  externalAccountId: string;
  bookedAt: Date;
  valueAt?: Date;
  amount: number;
  currency: string;
  description?: string;
  counterpartyName?: string;
  counterpartyIbanMasked?: string;
}

export interface ProviderPosTransaction {
  externalTransactionId: string;
  merchantId?: string;
  terminalId?: string;
  occurredAt: Date;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  currency: string;
  status: 'AUTHORIZED' | 'CAPTURED' | 'REFUNDED' | 'CHARGEBACK' | 'FAILED';
  expectedSettlementAt?: Date;
  installmentCount?: number;
}

export interface ProviderPosTransactionLookup {
  credentials: Record<string, string>;
  providerTransactionId: string;
  merchantReference?: string;
  occurredAt?: Date;
}

export interface ProviderPosRefundRequest {
  credentials: Record<string, string>;
  providerTransactionId: string;
  merchantReference?: string;
  amount: number;
  currency: string;
  externalEventId: string;
}

export interface ProviderPosRefundResult {
  providerTransactionId: string;
  externalEventId: string;
  amount: number;
  currency: string;
  occurredAt: Date;
  providerReference?: string;
}

export interface ProviderPosSettlementBatch {
  providerSettlementId: string;
  settledAt: Date;
  currency: string;
  providerTransactionIds: string[];
  requiresReview?: boolean;
  reviewReason?: string;
}

export interface ProviderPosSettlementQuery {
  credentials: Record<string, string>;
  date: Date;
}

export interface ProviderWebhookVerificationResult {
  valid: boolean;
}

export interface ProviderWebhookFinancialEvent {
  eventType: 'REFUND' | 'CHARGEBACK';
  externalEventId: string;
  providerTransactionId: string;
  amount: number;
  feeAmount?: number;
  occurredAt: Date;
}

export interface ProviderWebhookCorrelation {
  providerTransactionId: string;
  merchantReference?: string;
  occurredAt?: Date;
  status?: 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED' | 'CHARGEBACK';
  requiresEnrichment?: boolean;
}

export interface ProviderWebhookEvent {
  externalEventId: string;
  eventType: string;
  transaction?: ProviderPosTransaction;
  correlation?: ProviderWebhookCorrelation;
  financialEvent?: ProviderWebhookFinancialEvent;
}

export interface ProviderCredentialField {
  key: string;
  label: string;
  secret?: boolean;
  required?: boolean;
}

export interface ProviderCapabilities {
  oauth?: boolean;
  apiCredentials?: boolean;
  credentialTokenAuth?: boolean;
  accounts?: boolean;
  balances?: boolean;
  bankTransactions?: boolean;
  posTransactions?: boolean;
  posTransactionEnrichment?: boolean;
  posRefunds?: boolean;
  settlements?: boolean;
  settlementImport?: boolean;
  webhooks?: boolean;
}

export interface FinancialProviderAdapter {
  readonly provider: string;
  readonly displayName?: string;
  readonly kind: 'OPEN_BANKING' | 'VIRTUAL_POS';
  readonly credentialFields?: ProviderCredentialField[];
  readonly capabilities?: ProviderCapabilities;
  readonly runtimeReady?: boolean;

  beginAuthorization?(request: ProviderAuthorizationRequest): Promise<ProviderAuthorizationResult>;
  exchangeAuthorizationCode?(input: {
    code: string;
    callbackUrl: string;
  }): Promise<ProviderTokenSet>;
  authenticateCredentials?(credentials: Record<string, string>): Promise<ProviderTokenSet>;
  refreshTokens?(tokens: ProviderTokenSet): Promise<ProviderTokenSet>;
  revoke?(tokens: ProviderTokenSet): Promise<void>;

  listBankAccounts?(tokens: ProviderTokenSet): Promise<ProviderBankAccount[]>;
  listBankTransactions?(tokens: ProviderTokenSet, since?: Date): Promise<ProviderBankTransaction[]>;
  listPosTransactions?(tokens: ProviderTokenSet, since?: Date): Promise<ProviderPosTransaction[]>;
  retrievePosTransaction?(input: ProviderPosTransactionLookup): Promise<ProviderPosTransaction>;
  refundPosTransaction?(input: ProviderPosRefundRequest): Promise<ProviderPosRefundResult>;
  listPosSettlements?(input: ProviderPosSettlementQuery): Promise<ProviderPosSettlementBatch[]>;

  verifyWebhook?(input: {
    headers: Record<string, string | string[] | undefined>;
    payload: unknown;
    credentials: Record<string, string>;
  }): Promise<ProviderWebhookVerificationResult>;
  parseWebhook?(input: {
    headers: Record<string, string | string[] | undefined>;
    payload: unknown;
    credentials: Record<string, string>;
  }): Promise<ProviderWebhookEvent>;
}
