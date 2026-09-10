import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { FinancialProviderAdapter } from './provider-adapter';
import { IyzicoAdapter } from './providers/iyzico.adapter';
import { PaytrAdapter } from './providers/paytr.adapter';

@Injectable()
export class ProviderRegistryService implements OnModuleInit {
  private readonly adapters = new Map<string, FinancialProviderAdapter>();

  constructor(
    private readonly iyzico: IyzicoAdapter,
    private readonly paytr: PaytrAdapter,
  ) {}

  onModuleInit() {
    this.register(this.iyzico);
    this.register(this.paytr);
  }

  register(adapter: FinancialProviderAdapter) {
    this.adapters.set(this.key(adapter.kind, adapter.provider), adapter);
  }

  get(kind: 'OPEN_BANKING' | 'VIRTUAL_POS', provider: string) {
    const adapter = this.adapters.get(this.key(kind, provider));
    if (!adapter) {
      throw new NotFoundException(
        `Provider adapter is not configured for ${kind}:${provider}.`,
      );
    }
    return adapter;
  }

  has(kind: 'OPEN_BANKING' | 'VIRTUAL_POS', provider: string) {
    return this.adapters.has(this.key(kind, provider));
  }

  list() {
    return Array.from(this.adapters.values()).map((adapter) => ({
      kind: adapter.kind,
      provider: adapter.provider,
      displayName: adapter.displayName ?? adapter.provider,
      credentialFields: adapter.credentialFields ?? [],
      capabilities: adapter.capabilities ?? {},
      runtimeReady: adapter.runtimeReady ?? false,
    }));
  }

  private key(kind: string, provider: string) {
    return `${kind}:${provider.trim().toUpperCase()}`;
  }
}
