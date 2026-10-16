import { BadRequestException } from '@nestjs/common';
import { QualityFeedbackRequestService } from './quality-feedback-request.service';

describe('QualityFeedbackRequestService', () => {
  const tenantContext = {
    getContext: jest.fn(() => ({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      roleScope: 'BRANCH',
    })),
  };

  it('processes completed appointments with an idempotent insert and audit event', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          id: 'request-1',
          appointmentId: 'appointment-1',
          customerId: 'customer-1',
          serviceId: 'service-1',
          branchId: 'branch-1',
          status: 'PENDING',
        },
      ]),
    };
    const service = new QualityFeedbackRequestService(
      prisma as any,
      tenantContext as any,
    );

    const result = await service.processCompletedAppointments('user-1', 25);

    expect(result.processed).toBe(1);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, tenantId, companyId, branchId, actorUserId, limit] =
      prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("a.status='COMPLETED'");
    expect(sql).toContain('FOR UPDATE OF a SKIP LOCKED');
    expect(sql).toContain('ON CONFLICT (appointment_id) DO NOTHING');
    expect(sql).toContain("'REQUESTED'");
    expect(tenantId).toBe('tenant-1');
    expect(companyId).toBe('company-1');
    expect(branchId).toBe('branch-1');
    expect(actorUserId).toBe('user-1');
    expect(limit).toBe(25);
  });

  it('returns zero when all completed appointments already have requests', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const service = new QualityFeedbackRequestService(
      prisma as any,
      tenantContext as any,
    );

    await expect(
      service.processCompletedAppointments('user-1'),
    ).resolves.toEqual({ processed: 0, requests: [] });
  });

  it('rejects invalid limits and caps large batches', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const service = new QualityFeedbackRequestService(
      prisma as any,
      tenantContext as any,
    );

    await expect(
      service.processCompletedAppointments('user-1', 0),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.processCompletedAppointments('user-1', 999);
    expect(prisma.$queryRawUnsafe.mock.calls[0][5]).toBe(200);
  });

  it('lists only the active tenant/company/branch scope', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const service = new QualityFeedbackRequestService(
      prisma as any,
      tenantContext as any,
    );

    await service.list({ status: 'PENDING', limit: 10 });
    const [sql, tenantId, companyId, branchId, status, limit] =
      prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('r.tenant_id=$1::text');
    expect(sql).toContain('r.company_id=$2::text');
    expect(sql).toContain('r.branch_id=$3::text');
    expect([tenantId, companyId, branchId, status, limit]).toEqual([
      'tenant-1',
      'company-1',
      'branch-1',
      'PENDING',
      10,
    ]);
  });
});
