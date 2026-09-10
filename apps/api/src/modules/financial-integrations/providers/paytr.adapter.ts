import { Injectable } from '@nestjs/common';
import type { FinancialProviderAdapter } from '../provider-adapter';

@Injectable()
export class PaytrAdapter implements FinancialProviderAdapter {
  readonly provider = 'PAYTR';
  readonly displayName = 'PayTR';
  readonly kind = 'VIRTUAL_POS' as const;
  readonly runtimeReady = false;
  readonly credentialFields = [
    { key: 'merchantId', label: 'Merchant ID', secret: false, required: true },
    { key: 'merchantKey', label: 'Merchant Key', secret: true, required: true },
    { key: 'merchantSalt', label: 'Merchant Salt', secret: true, required: true },
  ];
  readonly capabilities = {
    apiCredentials: true,
    posTransactions: true,
    settlements: true,
    webhooks: true,
  };
}
