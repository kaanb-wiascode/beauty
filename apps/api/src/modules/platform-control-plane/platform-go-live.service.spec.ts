import { ConflictException } from '@nestjs/common';

import { PlatformGoLiveService } from './platform-go-live.service';

const completedSteps = [
  'TENANT',
  'SUBSCRIPTION',
  'ENTITLEMENTS',
  'COMPANY',
  'PRIMARY_BRANCH',
  'OWNER_INVITATION',
  'DEFAULT_ROLES_PERMISSIONS',
  'DEFAULT_CONFIGURATION',
  'ONBOARDING_CHECKLIST',
].map((stepKey) => ({ stepKey, status: 'COMPLETED' }));

describe('PlatformGoLiveService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const audit = { record: jest.fn() };
  const service = new PlatformGoLiveService(prisma as never, audit as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(1);
    audit.record.mockResolvedValue(undefined);
  });

  it('blocks go-live until the invited owner has accepted and has an active owner membership', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'run-1', tenantId: 'tenant-1', status: 'RUNNING' }])
      .mockResolvedValueOnce(completedSteps)
      .mockResolvedValueOnce([]);

    await expect(
      service.execute('run-1', 'platform-actor-1', 'Launch approved'),
    ).rejects.toMatchObject<Partial<ConflictException>>({ status: 409 });

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('blocks go-live while required onboarding work remains', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'run-1', tenantId: 'tenant-1', status: 'RUNNING' }])
      .mockResolvedValueOnce(completedSteps)
      .mockResolvedValueOnce([
        { userId: 'owner-1', invitationId: 'inv-1', membershipId: 'membership-1' },
      ])
      .mockResolvedValueOnce([
        { id: 'onboarding-1', status: 'IN_PROGRESS', ownerUserId: 'owner-1' },
      ])
      .mockResolvedValueOnce([{ remaining: 1n, blocked: 0n }]);

    await expect(
      service.execute('run-1', 'platform-actor-1', 'Launch approved'),
    ).rejects.toMatchObject<Partial<ConflictException>>({ status: 409 });

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('completes onboarding, go-live step and provisioning run atomically after all gates pass', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'run-1', tenantId: 'tenant-1', status: 'RUNNING' }])
      .mockResolvedValueOnce(completedSteps)
      .mockResolvedValueOnce([
        { userId: 'owner-1', invitationId: 'inv-1', membershipId: 'membership-1' },
      ])
      .mockResolvedValueOnce([
        { id: 'onboarding-1', status: 'READY_FOR_GO_LIVE', ownerUserId: 'owner-1' },
      ])
      .mockResolvedValueOnce([{ remaining: 0n, blocked: 0n }])
      .mockResolvedValueOnce([{ state: 'ACTIVE' }]);

    const result = await service.execute(
      'run-1',
      'platform-actor-1',
      'Launch approved',
      'request-1',
    );

    expect(result).toMatchObject({
      runId: 'run-1',
      tenantId: 'tenant-1',
      ownerUserId: 'owner-1',
      ownerMembershipId: 'membership-1',
      status: 'COMPLETED',
      onboardingStatus: 'COMPLETED',
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'platform-actor-1',
        action: 'go_live.complete',
        targetTenantId: 'tenant-1',
        reason: 'Launch approved',
        correlationId: 'request-1',
      }),
      tx,
    );
  });
});
