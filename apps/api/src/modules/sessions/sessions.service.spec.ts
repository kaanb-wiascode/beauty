import { PrismaService } from '@beauty-erp/database';
import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TenantContext } from '../../common/tenant/tenant-context';
import { SessionsService } from './sessions.service';

describe('SessionsService concurrency guards', () => {
  async function createService(options?: {
    sessionStatus?: 'AVAILABLE' | 'RESERVED' | 'CONSUMED' | 'CANCELLED';
    updateCount?: number;
    appointmentId?: string | null;
  }) {
    const sessionStatus = options?.sessionStatus ?? 'AVAILABLE';
    const appointmentId =
      options?.appointmentId === undefined
        ? sessionStatus === 'RESERVED'
          ? 'appointment-a'
          : null
        : options.appointmentId;

    const session = {
      id: 'session-a',
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      customerPackageId: 'package-a',
      serviceId: 'service-a',
      status: sessionStatus,
      appointmentId,
      customerPackage: {
        customerId: 'customer-a',
        package: {},
        customer: {},
      },
      service: {},
      appointment: null,
    };

    const tx = {
      appointment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'appointment-a' }),
      },
      session: {
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: options?.updateCount ?? 1 }),
        findUnique: jest.fn().mockResolvedValue({
          ...session,
          status: sessionStatus === 'AVAILABLE' ? 'RESERVED' : sessionStatus,
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      customerPackage: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const prisma = {
      session: {
        findFirst: jest.fn().mockResolvedValue(session),
        findMany: jest.fn(),
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: options?.updateCount ?? 1 }),
        findUnique: jest.fn().mockResolvedValue(session),
      },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };

    const tenant = new TenantContext();
    tenant.setContext({
      tenantId: 'tenant-a',
      membershipId: 'membership-a',
      companyId: 'company-a',
      branchId: 'branch-a',
      roleScope: 'BRANCH',
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: tenant },
      ],
    }).compile();

    return {
      service: moduleRef.get(SessionsService),
      prisma,
      tx,
    };
  }

  it('claims AVAILABLE session atomically when reserving', async () => {
    const { service, tx } = await createService();

    await service.reserve('session-a', 'appointment-a');

    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-a',
        tenantId: 'tenant-a',
        branchId: 'branch-a',
        status: 'AVAILABLE',
        appointmentId: null,
      },
      data: {
        status: 'RESERVED',
        appointmentId: 'appointment-a',
      },
    });
  });

  it('returns 409 when another reservation wins the race', async () => {
    const { service } = await createService({ updateCount: 0 });

    await expect(
      service.reserve('session-a', 'appointment-a'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 409 for an invalid state transition instead of a generic error', async () => {
    const { service } = await createService({
      sessionStatus: 'CONSUMED',
      appointmentId: 'appointment-a',
    });

    await expect(service.release('session-a')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('claims RESERVED session atomically when releasing it', async () => {
    const { service, prisma } = await createService({
      sessionStatus: 'RESERVED',
      appointmentId: 'appointment-a',
    });

    await service.release('session-a');

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-a',
        tenantId: 'tenant-a',
        branchId: 'branch-a',
        status: 'RESERVED',
        appointmentId: 'appointment-a',
      },
      data: {
        status: 'AVAILABLE',
        appointmentId: null,
      },
    });
  });
});
