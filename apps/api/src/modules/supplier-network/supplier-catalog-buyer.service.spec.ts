import { NotFoundException } from '@nestjs/common';
import { SupplierCatalogBuyerService } from './supplier-catalog-buyer.service';

describe('SupplierCatalogBuyerService', () => {
  function tenant() {
    return {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
    } as never;
  }

  it('scopes local catalog links by tenant and company', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const service = new SupplierCatalogBuyerService(prisma, tenant());

    await service.listLinks();

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('l.tenant_id=$1::text');
    expect(sql).toContain('l.company_id=$2::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['tenant-a', 'company-a']);
  });

  it('rejects a product outside company scope before linking', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'variant-1' }]);
    const prisma = { $queryRawUnsafe: query } as never;
    const service = new SupplierCatalogBuyerService(prisma, tenant());

    await expect(
      service.linkProduct('product-x', 'variant-1', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(String(query.mock.calls[0][0])).toContain('tenant_id=$2::text');
    expect(String(query.mock.calls[0][0])).toContain('company_id=$3::text');
    expect(query.mock.calls[0].slice(1)).toEqual([
      'product-x',
      'tenant-a',
      'company-a',
    ]);
  });
});
