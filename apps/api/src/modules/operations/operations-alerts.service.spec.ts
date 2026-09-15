import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { OperationsAlertsService } from './operations-alerts.service';

describe('OperationsAlertsService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaService;
  const tenantContext = {
    getTenantId: jest.fn().mockReturnValue('tenant-1'),
    getCompanyId: jest.fn().mockReturnValue('company-1'),
    getBranchId: jest.fn().mockReturnValue('branch-1'),
  } as unknown as TenantContext;
  const service = new OperationsAlertsService(prisma, tenantContext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds branch-scoped alerts from authoritative operational sources', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'waiting:visit-1',
        type: 'WAITING_TOO_LONG',
        severity: 'WARNING',
        title: 'Müşteri bekleme süresi aşıldı',
        message: 'Müşteri 18 dakikadır bekliyor.',
        sourceType: 'VISIT',
        sourceId: 'visit-1',
        startedAt: new Date('2026-09-15T17:00:00.000Z'),
        ageMinutes: 18,
        suggestedAction: 'Bekleme nedenini kontrol et.',
        customerId: 'customer-1',
        customerName: 'Ayşe Yılmaz',
        staffId: null,
        staffName: null,
        resourceId: null,
        resourceName: null,
      },
      {
        id: 'incident:incident-1',
        type: 'ACTIVE_INCIDENT',
        severity: 'CRITICAL',
        title: 'Cihaz arızası',
        message: 'Lazer cihazı devre dışı',
        sourceType: 'INCIDENT',
        sourceId: 'incident-1',
        startedAt: new Date('2026-09-15T16:30:00.000Z'),
        ageMinutes: 48,
        suggestedAction: 'Etkilenen randevuları kontrol et.',
        customerId: null,
        customerName: null,
        staffId: null,
        staffName: null,
        resourceId: 'asset-1',
        resourceName: 'Lazer 1',
      },
    ]);

    const result = await service.list({
      waitingMinutes: 15,
      checkoutMinutes: 15,
      limit: 100,
    });

    expect(result.counts).toEqual({
      INFO: 0,
      WARNING: 1,
      HIGH: 0,
      CRITICAL: 1,
    });
    expect(result.alerts).toHaveLength(2);
    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('i.tenant_id = $1 AND i.company_id = $2 AND i.branch_id = $3'),
      'tenant-1',
      'company-1',
      'branch-1',
      15,
      15,
      100,
    );
    expect(queryRawUnsafe.mock.calls[0][0]).toContain("v.status::text = 'WAITING'");
    expect(queryRawUnsafe.mock.calls[0][0]).toContain("v.status::text = 'CHECKOUT_PENDING'");
    expect(queryRawUnsafe.mock.calls[0][0]).toContain("v.status::text = 'IN_SERVICE'");
    expect(queryRawUnsafe.mock.calls[0][0]).toContain("r.status IN ('CLEANING','OUT_OF_SERVICE')");
    expect(queryRawUnsafe.mock.calls[0][0]).toContain("i.status = 'OPEN'");
  });
});
