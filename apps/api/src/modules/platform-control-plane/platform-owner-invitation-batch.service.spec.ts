import { ServiceUnavailableException } from '@nestjs/common';

import { PlatformOwnerInvitationBatchService } from './platform-owner-invitation-batch.service';

describe('PlatformOwnerInvitationBatchService', () => {
  const prisma = { $queryRaw: jest.fn() };
  const dispatcher = { dispatch: jest.fn() };
  const service = new PlatformOwnerInvitationBatchService(
    prisma as never,
    dispatcher as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the delivery creator as audit actor for automated batches', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        provisioningRunId: 'run-1',
        createdByPlatformUserId: 'platform-creator-1',
      },
    ]);
    dispatcher.dispatch.mockResolvedValue({ status: 'SENT' });

    const result = await service.dispatchDue(
      null,
      'Automated owner invitation delivery retry.',
      25,
    );

    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      'run-1',
      'platform-creator-1',
      'Automated owner invitation delivery retry.',
      undefined,
    );
    expect(result).toMatchObject({ scanned: 1, sent: 1, failed: 0 });
  });

  it('uses the current operator for manually initiated batches', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        provisioningRunId: 'run-1',
        createdByPlatformUserId: 'platform-creator-1',
      },
    ]);
    dispatcher.dispatch.mockResolvedValue({ status: 'SENT' });

    await service.dispatchDue('platform-operator-2', 'Manual retry', 10, 'request-1');

    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      'run-1',
      'platform-operator-2',
      'Manual retry',
      'request-1',
    );
  });

  it('continues the batch when one delivery fails', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { provisioningRunId: 'run-1', createdByPlatformUserId: 'actor-1' },
      { provisioningRunId: 'run-2', createdByPlatformUserId: 'actor-2' },
    ]);
    dispatcher.dispatch
      .mockRejectedValueOnce(
        new ServiceUnavailableException({ code: 'PROVIDER_HTTP_503' }),
      )
      .mockResolvedValueOnce({ status: 'SENT' });

    const result = await service.dispatchDue(null, 'Automated retry', 10);

    expect(result).toEqual({
      scanned: 2,
      sent: 1,
      failed: 1,
      results: [
        {
          provisioningRunId: 'run-1',
          status: 'FAILED',
          error: 'PROVIDER_HTTP_503',
        },
        { provisioningRunId: 'run-2', status: 'SENT' },
      ],
    });
  });
});
