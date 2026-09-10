import { NotFoundException } from '@nestjs/common';
import { PosWebhookQueueService } from './pos-webhook-queue.service';

describe('PosWebhookQueueService', () => {
  const tenant = {
    getTenantId: jest.fn(() => 'tenant-1'),
    getCompanyId: jest.fn(() => 'company-1'),
    getBranchId: jest.fn(() => 'branch-1'),
  };

  const createService = () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    const webhooks = { replayStored: jest.fn() };
    return {
      prisma,
      webhooks,
      service: new PosWebhookQueueService(prisma as never, tenant as never, webhooks as never),
    };
  };

  it('scopes manual replay to tenant, company and branch and rejects missing events', async () => {
    const { prisma, service } = createService();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(service.requestReplay('event-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id=$2::text AND company_id=$3::text'),
      'event-1',
      'tenant-1',
      'company-1',
      'branch-1',
    );
  });

  it('recovers stale processing claims before claiming due work', async () => {
    const { prisma, service } = createService();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    await service.processDue();

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status='RETRY_PENDING'"),
    );
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE SKIP LOCKED'),
      25,
      expect.any(String),
    );
  });

  it('uses exponential backoff and claim-token guarded rescheduling', async () => {
    const { prisma, webhooks, service } = createService();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: 'event-1', retryCount: 2, status: 'PROCESSING', claimToken: 'claim-1' },
    ]);
    webhooks.replayStored.mockRejectedValueOnce(new Error('temporary failure'));

    const result = await service.processDue();

    expect(result).toEqual([{ eventId: 'event-1', ok: false, status: 'RETRY_PENDING' }]);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('claim_token=$6'),
      'event-1',
      'RETRY_PENDING',
      3,
      4,
      'temporary failure',
      'claim-1',
    );
  });

  it('moves the eighth failed attempt to dead letter', async () => {
    const { prisma, webhooks, service } = createService();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: 'event-8', retryCount: 7, status: 'PROCESSING', claimToken: 'claim-8' },
    ]);
    webhooks.replayStored.mockRejectedValueOnce(new Error('still failing'));

    const result = await service.processDue();

    expect(result).toEqual([{ eventId: 'event-8', ok: false, status: 'DEAD_LETTER' }]);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status='DEAD_LETTER'"),
      'event-8',
      8,
      'still failing',
      'claim-8',
    );
  });

  it('keeps enrichment-required events queued instead of marking them processed', async () => {
    const { prisma, webhooks, service } = createService();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: 'event-enrich', retryCount: 0, status: 'PROCESSING', claimToken: 'claim-enrich' },
    ]);
    webhooks.replayStored.mockResolvedValueOnce({ requiresEnrichment: true });

    const result = await service.processDue();

    expect(result).toEqual([
      { eventId: 'event-enrich', ok: true, status: 'ENRICHMENT_PENDING' },
    ]);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('status=$2'),
      'event-enrich',
      'ENRICHMENT_PENDING',
      1,
      1,
      null,
      'claim-enrich',
    );
  });
});
