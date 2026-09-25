import { BadRequestException } from '@nestjs/common';
import { QualityInspectionLifecycleService } from './quality-inspection-lifecycle.service';

describe('QualityInspectionLifecycleService', () => {
  const tenant = {
    getContext: () => ({ tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' }),
  };

  it('cancels only planned inspections and writes an audit event', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'inspection-1', status: 'PLANNED', branchId: 'branch-1' }])
        .mockResolvedValueOnce([{ id: 'inspection-1', status: 'CANCELLED', cancelReason: 'Branch closed' }]),
      $executeRawUnsafe: jest.fn(async () => 1),
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const service = new QualityInspectionLifecycleService(prisma as any, tenant as any);

    await expect(service.cancel('inspection-1', 'Branch closed', 'user-1')).resolves.toMatchObject({
      id: 'inspection-1',
      status: 'CANCELLED',
      duplicate: false,
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('quality_inspection_events'),
      'inspection-1',
      'tenant-1',
      'company-1',
      'branch-1',
      'Branch closed',
      'user-1',
    );
  });

  it('requires a cancellation reason', async () => {
    const service = new QualityInspectionLifecycleService({} as any, tenant as any);
    await expect(service.cancel('inspection-1', '   ', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid reschedule dates', async () => {
    const service = new QualityInspectionLifecycleService({} as any, tenant as any);
    await expect(
      service.reschedule('inspection-1', { plannedFor: 'not-a-date' }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
