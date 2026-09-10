import { Injectable, NotFoundException } from '@nestjs/common';
import type { FinancialProviderAdapter } from './provider-adapter';

@Injectable()
export class ProviderRegistryService {
  private readonly adapters = new Map<string, FinancialProviderAdapter>();

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
    }));
  }

  private key(kind: string, provider: string) {
    return `${kind}:${provider.trim().toUpperCase()}`;
  }
}
