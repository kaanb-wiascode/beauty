import { QualityInspectionCatalogService } from './quality-inspection-catalog.service';

describe('QualityInspectionCatalogService', () => {
  const tenant = { getContext: () => ({ tenantId: 'tenant-1', companyId: 'company-1', branchId: null }) } as any;

  it('exposes six standard templates with supported cadences', () => {
    const service = new QualityInspectionCatalogService({} as any, tenant);
    const catalog = service.listCatalog();
    expect(catalog).toHaveLength(6);
    expect(catalog.map((x) => x.category)).toEqual(expect.arrayContaining([
      'GENERAL_BRANCH_AUDIT','HYGIENE','CAMERA_AUDIT','DOCUMENT_COMPLIANCE','PRODUCT_VERIFICATION','SERVICE_QUALITY',
    ]));
    expect(catalog.every((x) => ['WEEKLY','MONTHLY'].includes(x.cadence))).toBe(true);
  });

  it('installs the catalog transactionally and idempotently', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 't1', name: 'Genel Şube Denetimi', category: 'GENERAL_BRANCH_AUDIT', version: 1 }])
        .mockResolvedValueOnce([{ id: 'existing-2', name: 'Temizlik ve Hijyen Denetimi', category: 'HYGIENE', version: 1 }])
        .mockResolvedValueOnce([{ id: 'existing-3', name: 'Kamera Kontrol Denetimi', category: 'CAMERA_AUDIT', version: 1 }])
        .mockResolvedValueOnce([{ id: 'existing-4', name: 'Evrak ve Dokümantasyon Uyum Denetimi', category: 'DOCUMENT_COMPLIANCE', version: 1 }])
        .mockResolvedValueOnce([{ id: 'existing-5', name: 'Ürün Kullanım ve Doğrulama Denetimi', category: 'PRODUCT_VERIFICATION', version: 1 }])
        .mockResolvedValueOnce([{ id: 'existing-6', name: 'Hizmet Kalitesi Denetimi', category: 'SERVICE_QUALITY', version: 1 }]),
    };
    const prisma = { $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) } as any;
    const service = new QualityInspectionCatalogService(prisma, tenant);
    const result = await service.install('user-1');
    expect(result.catalogVersion).toBe(1);
    expect(result.installedCount).toBe(1);
    expect(tx.$executeRawUnsafe.mock.calls[0]?.[0]).toContain('pg_advisory_xact_lock');
    expect(tx.$executeRawUnsafe.mock.calls.some((call: unknown[]) => String(call[0]).includes("'SCORE'"))).toBe(true);
  });
});
