import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { VisitCheckoutReadinessService } from '../visits/visit-checkout-readiness.service';
import { OperationsAlertsService } from './operations-alerts.service';

describe('OperationsAlertsService', () => {
  const queryRawUnsafe = jest.fn();
  const getReadiness = jest.fn();
  const prisma = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaService;
  const tenantContext = {
    getTenantId: jest.fn().mockReturnValue('tenant-1'),
    getCompanyId: jest.fn().mockReturnValue('company-1'),
    getBranchId: jest.fn().mockReturnValue('branch-1'),
  } as unknown as TenantContext;
  const checkoutReadiness = { getReadiness } as unknown as VisitCheckoutReadinessService;
  const service = new OperationsAlertsService(prisma, tenantContext, checkoutReadiness);

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
    expect(getReadiness).not.toHaveBeenCalled();
    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('i.tenant_id = $1 AND i.company_id = $2 AND i.branch_id = $3'),
      'tenant-1',
      'company-1',
      'branch-1',
      15,
      15,
      100,
    );
    const sql = queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain("v.status::text = 'WAITING'");
    expect(sql).toContain("v.status::text = 'CHECKOUT_PENDING'");
    expect(sql).toContain("v.status::text = 'IN_SERVICE'");
    expect(sql).toContain("r.status IN ('CLEANING','OUT_OF_SERVICE')");
    expect(sql).toContain("'DEVICE_UNAVAILABLE'::text AS type");
    expect(sql).toContain("'RESOURCE_APPOINTMENT_IMPACT'::text AS type");
    expect(sql).toContain("'UPCOMING_STOCK_SHORTAGE'::text AS type");
    expect(sql).toContain("ap.\"startAt\" < CURRENT_TIMESTAMP + INTERVAL '24 hours'");
    expect(sql).toContain("i.status = 'OPEN'");
  });

  it('upgrades a stale checkout alert with authoritative blocker reasons', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'checkout:visit-1',
        type: 'CHECKOUT_STALE',
        severity: 'WARNING',
        title: 'Checkout işlemi bekliyor',
        message: 'Müşteri checkout aşamasında 20 dakikadır bekliyor.',
        sourceType: 'VISIT',
        sourceId: 'visit-1',
        startedAt: new Date('2026-09-15T17:00:00.000Z'),
        ageMinutes: 20,
        suggestedAction: 'Readiness kontrol et.',
        customerId: 'customer-1',
        customerName: 'Ayşe Yılmaz',
        staffId: null,
        staffName: null,
        resourceId: null,
        resourceName: null,
      },
    ]);
    getReadiness.mockResolvedValueOnce({
      visitId: 'visit-1',
      visitStatus: 'CHECKOUT_PENDING',
      appointmentIds: ['appointment-1'],
      canCheckout: false,
      blockers: [
        {
          code: 'PACKAGE_SESSION_NOT_CONSUMED',
          appointmentId: 'appointment-1',
          message: 'Package session is not consumed.',
        },
      ],
      warnings: [],
    });

    const result = await service.list({
      waitingMinutes: 15,
      checkoutMinutes: 15,
      limit: 100,
    });

    expect(result.alerts[0]).toMatchObject({
      type: 'CHECKOUT_BLOCKED',
      severity: 'HIGH',
      sourceId: 'visit-1',
    });
    expect(result.alerts[0]?.message).toContain('PACKAGE_SESSION_NOT_CONSUMED');
    expect(result.counts.HIGH).toBe(1);
    expect(getReadiness).toHaveBeenCalledWith('visit-1');
  });
});
