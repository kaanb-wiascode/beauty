import { PlatformOwnerInvitationWorkerService } from './platform-owner-invitation-worker.service';

describe('PlatformOwnerInvitationWorkerService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not dispatch when invitation delivery is not configured', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const batch = { dispatchDue: jest.fn() };
    const service = new PlatformOwnerInvitationWorkerService(
      config as never,
      batch as never,
    );

    await expect(service.runOnce()).resolves.toEqual({
      skipped: true,
      reason: 'INVITATION_DELIVERY_NOT_CONFIGURED',
    });
    expect(batch.dispatchDue).not.toHaveBeenCalled();
  });

  it('dispatches a bounded automated batch when delivery is configured', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'PLATFORM_INVITATION_WEBHOOK_URL'
          ? 'https://delivery.example.test/invitations'
          : key === 'PLATFORM_INVITATION_WEBHOOK_SECRET'
            ? 's'.repeat(32)
            : undefined,
      ),
    };
    const batch = {
      dispatchDue: jest.fn().mockResolvedValue({ scanned: 0, sent: 0, failed: 0 }),
    };
    const service = new PlatformOwnerInvitationWorkerService(
      config as never,
      batch as never,
    );

    await service.runOnce();

    expect(batch.dispatchDue).toHaveBeenCalledWith(
      null,
      'Automated owner invitation delivery retry.',
      25,
      null,
    );
  });

  it('schedules work only when the provider is configured', () => {
    jest.useFakeTimers();
    const config = {
      get: jest.fn((key: string) =>
        key === 'PLATFORM_INVITATION_WEBHOOK_URL'
          ? 'https://delivery.example.test/invitations'
          : key === 'PLATFORM_INVITATION_WEBHOOK_SECRET'
            ? 's'.repeat(32)
            : undefined,
      ),
    };
    const batch = { dispatchDue: jest.fn().mockResolvedValue({ scanned: 0 }) };
    const service = new PlatformOwnerInvitationWorkerService(
      config as never,
      batch as never,
    );

    service.onApplicationBootstrap();
    expect(jest.getTimerCount()).toBe(1);

    service.onApplicationShutdown();
    expect(jest.getTimerCount()).toBe(0);
  });
});
