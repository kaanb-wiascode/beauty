import { SupplierOfferBuyerService } from './supplier-offer-buyer.service';

describe('SupplierOfferBuyerService', () => {
  it('returns offers only through active tenant/company supplier connections', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    const service = new SupplierOfferBuyerService(prisma, tenant);

    await service.listConnectedOffers('variant-a');

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("sc.tenant_id=$1::text AND sc.company_id=$2::text AND sc.status='ACTIVE'");
    expect(sql).toContain("org.status='ACTIVE' AND org.verification_status='VERIFIED'");
    expect(sql).toContain("so.status='ACTIVE'");
    expect(sql).toContain('so.valid_from IS NULL OR so.valid_from<=NOW()');
    expect(sql).toContain('so.valid_to IS NULL OR so.valid_to>NOW()');
    expect(query.mock.calls[0].slice(1)).toEqual(['tenant-a', 'company-a', 'variant-a']);
  });
});
