import { BadRequestException } from '@nestjs/common';
import { TaxService } from './tax.service';

describe('TaxService', () => {
  function createService(queryRows: any[] = []) {
    const query = jest.fn().mockResolvedValue(queryRows);
    const execute = jest.fn().mockResolvedValue(1);
    const prisma = { $queryRawUnsafe: query, $executeRawUnsafe: execute } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    return { service: new TaxService(prisma, tenant), query, execute };
  }

  it('calculates VAT from tax-inclusive amounts', () => {
    const { service } = createService();
    expect(service.calculate(120, 20, true)).toEqual({ net: 100, vat: 20, gross: 120, rate: 20 });
  });

  it('calculates VAT on top of tax-exclusive amounts', () => {
    const { service } = createService();
    expect(service.calculate(100, 20, false)).toEqual({ net: 100, vat: 20, gross: 120, rate: 20 });
  });

  it('keeps current behavior when VAT rate is zero', () => {
    const { service } = createService();
    expect(service.calculate(875.5, 0, true)).toEqual({ net: 875.5, vat: 0, gross: 875.5, rate: 0 });
  });

  it('rejects invalid VAT rates', () => {
    const { service } = createService();
    expect(() => service.calculate(100, 101, true)).toThrow(BadRequestException);
  });

  it('loads settings in exact tenant and company scope', async () => {
    const { service, query } = createService([{ salesVatRate: '20', purchaseVatRate: '10', pricesIncludeVat: true }]);
    await expect(service.getSettings()).resolves.toEqual({ salesVatRate: 20, purchaseVatRate: 10, pricesIncludeVat: true });
    expect(String(query.mock.calls[0][0])).toContain('tenant_id=$1::text');
    expect(String(query.mock.calls[0][0])).toContain('company_id=$2::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['tenant-a', 'company-a']);
  });

  it('returns zero-rate settings when company has no VAT configuration', async () => {
    const { service } = createService([]);
    await expect(service.getSettings()).resolves.toEqual({ salesVatRate: 0, purchaseVatRate: 0, pricesIncludeVat: true });
  });
});
