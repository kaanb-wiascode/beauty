import { QualityNotificationDispatcherService } from './quality-notification-dispatcher.service';
import { QualityNotificationProviderError } from './quality-notification-provider';

describe('QualityNotificationDispatcherService', () => {
  const tenantContext = {
    getContext: () => ({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      roleScope: 'BRANCH',
    }),
  } as any;

  it('dispatches email without persisting the raw recipient', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ email: 'Person@Example.com' }]),
    } as any;
    const outbox = {
      claim: jest.fn().mockResolvedValue({
        claimToken: 'x'.repeat(64),
        claimed: 1,
        deliveries: [{
          id: 'outbox-1',
          feedbackRequestId: 'feedback-1',
          customerId: 'customer-1',
          branchId: 'branch-1',
        }],
      }),
      markSent: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      markFailed: jest.fn(),
      markPermanentFailure: jest.fn(),
    } as any;
    const provider = {
      key: 'SIGNED_WEBHOOK',
      supports: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ providerMessageId: 'provider-1' }),
    } as any;

    const service = new QualityNotificationDispatcherService(
      prisma,
      tenantContext,
      outbox,
      provider,
    );

    const result = await service.dispatchFeedbackBatch('actor-1', 5);

    expect(result).toEqual({ claimed: 1, sent: 1, retry: 0, dead: 0 });
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'EMAIL',
        recipient: 'person@example.com',
      }),
    );
    const sentArgs = outbox.markSent.mock.calls[0];
    expect(sentArgs).not.toContain('person@example.com');
    expect(sentArgs[6]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('marks missing email as permanent without retrying', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ email: null }]),
    } as any;
    const outbox = {
      claim: jest.fn().mockResolvedValue({
        claimToken: 'y'.repeat(64),
        claimed: 1,
        deliveries: [{
          id: 'outbox-2',
          feedbackRequestId: 'feedback-2',
          customerId: 'customer-2',
          branchId: 'branch-1',
        }],
      }),
      markSent: jest.fn(),
      markFailed: jest.fn(),
      markPermanentFailure: jest.fn().mockResolvedValue({ status: 'DEAD' }),
    } as any;
    const provider = { key: 'SIGNED_WEBHOOK', supports: jest.fn(), send: jest.fn() } as any;

    const service = new QualityNotificationDispatcherService(
      prisma,
      tenantContext,
      outbox,
      provider,
    );

    const result = await service.dispatchFeedbackBatch('actor-1', 5);

    expect(result.dead).toBe(1);
    expect(outbox.markPermanentFailure).toHaveBeenCalledWith(
      'outbox-2',
      'y'.repeat(64),
      'actor-1',
      'RECIPIENT_EMAIL_MISSING',
      'EMAIL',
      'SIGNED_WEBHOOK',
      null,
    );
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('uses retry only for retryable provider failures', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ email: 'a@example.com' }]),
    } as any;
    const outbox = {
      claim: jest.fn().mockResolvedValue({
        claimToken: 'z'.repeat(64),
        claimed: 1,
        deliveries: [{ id: 'outbox-3', feedbackRequestId: 'feedback-3', customerId: 'customer-3', branchId: 'branch-1' }],
      }),
      markSent: jest.fn(),
      markFailed: jest.fn().mockResolvedValue({ status: 'RETRY' }),
      markPermanentFailure: jest.fn(),
    } as any;
    const provider = {
      key: 'SIGNED_WEBHOOK',
      supports: jest.fn().mockReturnValue(true),
      send: jest.fn().mockRejectedValue(new QualityNotificationProviderError('PROVIDER_HTTP_503', true)),
    } as any;

    const service = new QualityNotificationDispatcherService(prisma, tenantContext, outbox, provider);
    const result = await service.dispatchFeedbackBatch('actor-1', 5);

    expect(result.retry).toBe(1);
    expect(outbox.markFailed).toHaveBeenCalled();
    expect(outbox.markPermanentFailure).not.toHaveBeenCalled();
  });
});
