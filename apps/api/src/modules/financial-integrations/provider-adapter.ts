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
  status: 'AUTHORIZED' | 'CAPTURED' | 'REFUNDED' | 'FAILED';
  expectedSettlementAt?: Date;
}

export interface FinancialProviderAdapter {
  readonly provider: string;
  readonly kind: 'OPEN_BANKING' | 'VIRTUAL_POS';

  beginAuthorization?(request: ProviderAuthorizationRequest): Promise<ProviderAuthorizationResult>;
  exchangeAuthorizationCode?(input: {
    code: string;
    callbackUrl: string;
  }): Promise<ProviderTokenSet>;
  refreshTokens?(tokens: ProviderTokenSet): Promise<ProviderTokenSet>;
  revoke?(tokens: ProviderTokenSet): Promise<void>;

  listBankAccounts?(tokens: ProviderTokenSet): Promise<ProviderBankAccount[]>;
  listBankTransactions?(tokens: ProviderTokenSet, since?: Date): Promise<ProviderBankTransaction[]>;
  listPosTransactions?(tokens: ProviderTokenSet, since?: Date): Promise<ProviderPosTransaction[]>;
}
