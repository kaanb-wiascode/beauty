import { Injectable, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import type { FinancialProviderAdapter } from './provider-adapter';
import { ProviderResilienceService } from './provider-resilience.service';
import { GarantiBbvaAdapter } from './providers/garanti-bbva.adapter';
import { IyzicoAdapter } from './providers/iyzico.adapter';
import { PaytrAdapter } from './providers/paytr.adapter';

const RESILIENT_READ_METHODS = new Set([
  'listBankAccountPage',
  'listBankTransactionPage',
  'listBankAccounts',
  'listBankTransactions',
  'listPosTransactions',
]);

@Injectable()
export class ProviderRegistryService implements OnModuleInit {
  private readonly adapters = new Map<string, FinancialProviderAdapter>();
  private readonly resilientAdapters = new Map<string, FinancialProviderAdapter>();

  constructor(
    private readonly garantiBbva: GarantiBbvaAdapter,
    private readonly iyzico: IyzicoAdapter,
    private readonly paytr: PaytrAdapter,
    @Optional() private readonly resilience?: ProviderResilienceService,
  ) {}

  onModuleInit() {
    this.register(this.garantiBbva);
    this.register(this.iyzico);
    this.register(this.paytr);
  }

  register(adapter: FinancialProviderAdapter) {
    const key = this.key(adapter.kind, adapter.provider);
    this.adapters.set(key, adapter);
    this.resilientAdapters.delete(key);
  }

  get(kind: 'OPEN_BANKING' | 'VIRTUAL_POS', provider: string) {
    const key = this.key(kind, provider);
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new NotFoundException(
        `Provider adapter is not configured for ${kind}:${provider}.`,
      );
    }
    if (!this.resilience) return adapter;

    const cached = this.resilientAdapters.get(key);
    if (cached) return cached;

    const resilience = this.resilience;
    const proxy = new Proxy(adapter, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof property !== 'string' || typeof value !== 'function' || !RESILIENT_READ_METHODS.has(property)) {
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return (...args: unknown[]) => resilience.execute(
          `${kind}:${provider.trim().toUpperCase()}:${property}`,
          () => value.apply(target, args),
          { retries: 2, timeoutMs: 10_000, retryDelayMs: 250 },
        );
      },
    }) as FinancialProviderAdapter;
    this.resilientAdapters.set(key, proxy);
    return proxy;
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
