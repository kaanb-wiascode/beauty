import { Injectable, Scope } from '@nestjs/common';

import type { RoleScopeValue } from '../auth/jwt.strategy';

export interface TenantContextValue {
  tenantId: string;
  companyId: string;
  branchId: string | null;
  roleScope: RoleScopeValue;
}

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private context: TenantContextValue | null = null;

  setContext(context: TenantContextValue): void {
    this.context = context;
  }

  setTenantId(tenantId: string): void {
    const current = this.context;

    if (current) {
      this.context = {
        ...current,
        tenantId,
      };
      return;
    }

    throw new Error(
      'Organization context is not initialized; use setContext',
    );
  }

  getTenantId(): string {
    return this.getContext().tenantId;
  }

  getCompanyId(): string {
    return this.getContext().companyId;
  }

  getBranchId(): string | null {
    return this.getContext().branchId;
  }

  getRoleScope(): RoleScopeValue {
    return this.getContext().roleScope;
  }

  getContext(): TenantContextValue {
    if (!this.context) {
      throw new Error('Tenant context is not initialized');
    }

    return this.context;
  }
}
