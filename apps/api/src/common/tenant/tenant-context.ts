import { Injectable, Scope } from '@nestjs/common';

import type { RoleScopeValue } from '../auth/jwt.strategy';

export interface TenantContextValue {
  tenantId: string;
  membershipId: string;
  companyId: string;
  branchId: string | null;
  roleScope: RoleScopeValue;
}

type SystemTenantContextValue = Omit<TenantContextValue, 'membershipId'>;
type TenantRuntimeContextValue = SystemTenantContextValue & {
  membershipId: string | null;
};

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private context: TenantRuntimeContextValue | null = null;

  setContext(context: TenantContextValue): void {
    this.context = context;
  }

  setSystemContext(context: SystemTenantContextValue): void {
    this.context = {
      ...context,
      membershipId: null,
    };
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
    return this.requireContext().tenantId;
  }

  getMembershipId(): string {
    const membershipId = this.requireContext().membershipId;
    if (!membershipId) {
      throw new Error('Membership context is unavailable for system context');
    }
    return membershipId;
  }

  getCompanyId(): string {
    return this.requireContext().companyId;
  }

  getBranchId(): string | null {
    return this.requireContext().branchId;
  }

  getRoleScope(): RoleScopeValue {
    return this.requireContext().roleScope;
  }

  getContext(): TenantContextValue {
    const context = this.requireContext();
    if (!context.membershipId) {
      throw new Error('Membership context is unavailable for system context');
    }

    return {
      ...context,
      membershipId: context.membershipId,
    };
  }

  private requireContext(): TenantRuntimeContextValue {
    if (!this.context) {
      throw new Error('Tenant context is not initialized');
    }

    return this.context;
  }
}
