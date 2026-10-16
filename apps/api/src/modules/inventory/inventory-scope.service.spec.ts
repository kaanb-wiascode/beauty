import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { InventoryScopeService } from './inventory-scope.service';

describe('InventoryScopeService', () => {
  function createService(scope: unknown) {
    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue(scope),
    } as unknown as OrganizationScopeService;
    const tenantContext = {
      getCompanyId: jest.fn().mockReturnValue('company-1'),
    } as unknown as TenantContext;

    return {
      service: new InventoryScopeService(organizationScope, tenantContext),
      organizationScope,
    };
  }

  it('maps an explicitly selected branch to one warehouse branch id', async () => {
    const { service } = createService({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
    });

    await expect(service.getWarehouseScope()).resolves.toEqual({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchIds: ['branch-1'],
    });
  });

  it('maps COMPANY assigned branches to the allowed warehouse set', async () => {
    const { service } = createService({
      tenantId: 'tenant-1',
      branchId: { in: ['branch-1', 'branch-2'] },
    });

    await expect(service.getWarehouseScope()).resolves.toEqual({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchIds: ['branch-1', 'branch-2'],
    });
  });

  it('keeps CENTRAL without an active branch company-wide', async () => {
    const { service } = createService({
      tenantId: 'tenant-1',
      branch: { companyId: 'company-1' },
    });

    await expect(service.getWarehouseScope()).resolves.toEqual({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchIds: null,
    });
  });

  it('keeps a stale BRANCH context deny-safe with an empty warehouse set', async () => {
    const { service } = createService({
      tenantId: 'tenant-1',
      branchId: { in: [] },
    });

    await expect(service.getWarehouseScope()).resolves.toEqual({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchIds: [],
    });
  });
});
