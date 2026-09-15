import { Injectable } from '@nestjs/common';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';

export interface InventoryWarehouseScope {
  tenantId: string;
  companyId: string;
  branchIds: string[] | null;
}

@Injectable()
export class InventoryScopeService {
  constructor(
    private readonly organizationScope: OrganizationScopeService,
    private readonly tenantContext: TenantContext,
  ) {}

  async getWarehouseScope(): Promise<InventoryWarehouseScope> {
    const scope = await this.organizationScope.getBranchScopedWhere();

    if ('branchId' in scope) {
      return {
        tenantId: scope.tenantId,
        companyId: this.tenantContext.getCompanyId(),
        branchIds:
          typeof scope.branchId === 'string'
            ? [scope.branchId]
            : scope.branchId.in,
      };
    }

    return {
      tenantId: scope.tenantId,
      companyId: this.tenantContext.getCompanyId(),
      branchIds: null,
    };
  }
}
