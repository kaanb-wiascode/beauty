import { BadRequestException } from '@nestjs/common';
import { QualityScoreSchedulerService } from './quality-score-scheduler.service';

describe('QualityScoreSchedulerService', () => {
  function tenant(branchId: string | null = 'branch-1') {
    return {
      getContext: jest.fn(() => ({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId,
        roleScope: branchId ? 'BRANCH' : 'CENTRAL',
      })),
    } as any;
  }

  it('requires an active branch context for schedules', async () => {
    const prisma = { $queryRawUnsafe: jest.fn() } as any;
    const scores = { calculate: jest.fn() } as any;
    const service = new QualityScoreSchedulerService(prisma, tenant(null), scores);

    await expect(service.listSchedules()).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('calculates a claimed schedule and advances it', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([
        {
          id: 'schedule-1',
          cadence: 'MONTHLY',
          periodMode: 'PREVIOUS_MONTH',
          policyId: 'policy-1',
          nextRunAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    } as any;
    const scores = {
      calculate: jest.fn().mockResolvedValue({ runId: 'run-1', finalScore: 91.25 }),
    } as any;
    const service = new QualityScoreSchedulerService(prisma, tenant(), scores);

    const result = await service.processDue('user-1', { workerId: 'worker-1' });

    expect(scores.calculate).toHaveBeenCalledWith(
      expect.objectContaining({ policyId: 'policy-1' }),
      'user-1',
    );
    expect(result).toEqual(
      expect.objectContaining({ claimed: 1, calculated: 1, skippedExisting: 0, failed: 0 }),
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('skips calculation when the period already has a branch score', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([
        {
          id: 'schedule-1',
          cadence: 'DAILY',
          periodMode: 'PREVIOUS_DAY',
          policyId: null,
          nextRunAt: new Date('2026-09-12T00:00:00.000Z'),
        },
      ]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ latestRunId: 'run-existing' }]),
    } as any;
    const scores = { calculate: jest.fn() } as any;
    const service = new QualityScoreSchedulerService(prisma, tenant(), scores);

    const result = await service.processDue('user-1');

    expect(scores.calculate).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ claimed: 1, calculated: 0, skippedExisting: 1, failed: 0 }),
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });
});
