import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private tenantId: string | null = null;

  setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  getTenantId(): string {
    if (!this.tenantId) {
      throw new Error('Tenant context is not initialized');
    }

    return this.tenantId;
  }
}