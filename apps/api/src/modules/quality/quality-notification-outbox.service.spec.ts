import { BadRequestException } from '@nestjs/common';
import { QualityNotificationOutboxService } from './quality-notification-outbox.service';

describe('QualityNotificationOutboxService', () => {
  const tenantContext = {
    getContext: () => ({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      roleScope: 'BRANCH',
    }),
  } as any;

  it('enqueues feedback requests idempotently with audit', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'outbox-1' }]);
    const service = new QualityNotificationOutboxService(
      { $queryRawUnsafe: query } as any,
      tenantContext,
    );

    const result = await service.enqueueFeedbackRequests('actor-1', 10);
    expect(result.enqueued).toBe(1);
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (feedback_request_id) DO NOTHING');
    expect(query.mock.calls[0][0]).toContain("'ENQUEUED'");
    expect(query.mock.calls[0].slice(1)).toEqual([
      'tenant-1',
      'company-1',
      'branch-1',
      'actor-1',
      10,
    ]);
  });

  it('never sends the raw claim token to the database on success', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'outbox-1' }]);
    const service = new QualityNotificationOutboxService(
      { $queryRawUnsafe: query } as any,
      tenantContext,
    );
    const rawToken = 'a'.repeat(64);

    await service.markSent('outbox-1', rawToken, 'actor-1', 'provider-123');

    const args = query.mock.calls[0].slice(1);
    expect(args).not.toContain(rawToken);
    expect(args[3]).toMatch(/^[a-f0-9]{64}$/);
    expect(query.mock.calls[0][0]).toContain("SET status='SENT'");
    expect(query.mock.calls[0][0]).toContain('quality_feedback_requests');
    expect(query.mock.calls[0][0]).toContain("'SENT'");
  });

  it('uses bounded retry states and sanitized error codes', async () => {
    const query = jest.fn().mockResolvedValue([
      { id: 'outbox-1', status: 'RETRY', attemptCount: 2 },
    ]);
    const service = new QualityNotificationOutboxService(
      { $queryRawUnsafe: query } as any,
      tenantContext,
    );

    const result = await service.markFailed(
      'outbox-1',
      'b'.repeat(64),
      'actor-1',
      'provider.timeout',
    );

    expect(result.status).toBe('RETRY');
    expect(query.mock.calls[0][0]).toContain("attempt_count >= 5 THEN 'DEAD'");
    expect(query.mock.calls[0][0]).toContain("INTERVAL '60 minutes'");
    expect(query.mock.calls[0].slice(1)).toContain('PROVIDER.TIMEOUT');
  });

  it('rejects raw provider error payloads as error codes', async () => {
    const service = new QualityNotificationOutboxService(
      { $queryRawUnsafe: jest.fn() } as any,
      tenantContext,
    );

    await expect(
      service.markFailed(
        'outbox-1',
        'c'.repeat(64),
        'actor-1',
        'timeout response body with spaces and customer data',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
