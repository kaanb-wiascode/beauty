import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { VisitCheckoutReadinessService } from './visit-checkout-readiness.service';

describe('VisitCheckoutReadinessService', () => {
  const queryRawUnsafe = jest.fn();
  const appointmentFindMany = jest.fn();

  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
    appointment: { findMany: appointmentFindMany },
  } as unknown as PrismaService;

  const tenantContext = {
    getTenantId: jest.fn().mockReturnValue('tenant-1'),
    getBranchId: jest.fn().mockReturnValue('branch-1'),
  } as unknown as TenantContext;

  const service = new VisitCheckoutReadinessService(prisma, tenantContext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects visits outside the active tenant and branch scope', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(service.getReadiness('visit-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('blocks checkout when a direct appointment payment is pending', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        { id: 'visit-1', status: 'CHECKOUT_PENDING', source: 'APPOINTMENT' },
      ])
      .mockResolvedValueOnce([{ appointmentId: 'appointment-1' }]);
    appointmentFindMany.mockResolvedValueOnce([
      { id: 'appointment-1', payment: null, session: null },
    ]);

    const readiness = await service.getReadiness('visit-1');

    expect(readiness.canCheckout).toBe(false);
    expect(readiness.blockers).toEqual([
      expect.objectContaining({
        code: 'PAYMENT_PENDING',
        appointmentId: 'appointment-1',
      }),
    ]);
  });

  it('blocks checkout when a package session has not been consumed', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        { id: 'visit-1', status: 'CHECKOUT_PENDING', source: 'APPOINTMENT' },
      ])
      .mockResolvedValueOnce([{ appointmentId: 'appointment-1' }]);
    appointmentFindMany.mockResolvedValueOnce([
      {
        id: 'appointment-1',
        payment: null,
        session: { status: 'RESERVED' },
      },
    ]);

    const readiness = await service.getReadiness('visit-1');

    expect(readiness.canCheckout).toBe(false);
    expect(readiness.blockers[0]).toEqual(
      expect.objectContaining({ code: 'PACKAGE_SESSION_NOT_CONSUMED' }),
    );
  });

  it('allows checkout for a consumed package session', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        { id: 'visit-1', status: 'CHECKOUT_PENDING', source: 'APPOINTMENT' },
      ])
      .mockResolvedValueOnce([{ appointmentId: 'appointment-1' }]);
    appointmentFindMany.mockResolvedValueOnce([
      {
        id: 'appointment-1',
        payment: null,
        session: { status: 'CONSUMED' },
      },
    ]);

    const readiness = await service.getReadiness('visit-1');

    expect(readiness.canCheckout).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });

  it('hard-blocks a walk-in without linked commercial context', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        { id: 'visit-1', status: 'CHECKOUT_PENDING', source: 'WALK_IN' },
      ])
      .mockResolvedValueOnce([]);

    const readiness = await service.getReadiness('visit-1');

    expect(readiness.canCheckout).toBe(false);
    expect(readiness.blockers).toEqual([
      expect.objectContaining({ code: 'COMMERCIAL_CONTEXT_UNVERIFIED' }),
    ]);
    expect(readiness.warnings).toEqual([]);
  });
});
