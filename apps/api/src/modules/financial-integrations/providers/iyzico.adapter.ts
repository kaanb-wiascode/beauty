import { Injectable } from '@nestjs/common';
import type { FinancialProviderAdapter } from '../provider-adapter';

@Injectable()
export class IyzicoAdapter implements FinancialProviderAdapter {
  readonly provider = 'IYZICO';
  readonly displayName = 'iyzico';
  readonly kind = 'VIRTUAL_POS' as const;
  readonly runtimeReady = false;
  readonly credentialFields = [
    { key: 'apiKey', label: 'API Key', secret: true, required: true },
    { key: 'secretKey', label: 'Secret Key', secret: true, required: true },
    { key: 'merchantId', label: 'Merchant ID', secret: false, required: false },
    { key: 'baseUrl', label: 'API Base URL', secret: false, required: false },
  ];
  readonly capabilities = {
    apiCredentials: true,
    posTransactions: true,
    settlements: true,
    webhooks: true,
  };
}
