import { BadRequestException } from '@nestjs/common';
import { QualityPublicFeedbackService } from './quality-public-feedback.service';

describe('QualityPublicFeedbackService', () => {
  const secret = 's'.repeat(48);
  const config = { get: jest.fn((key: string) => key === 'QUALITY_FEEDBACK_PUBLIC_TOKEN_SECRET' ? secret : undefined) } as any;

  it('issues a signed token without persisting the raw token', async () => {
    const query = jest.fn().mockResolvedValue([{
      id: '11111111-1111-1111-1111-111111111111',
      publicTokenVersion: 1,
      expiresEpoch: '1790000000',
      expiresAt: new Date('2026-09-21T00:00:00.000Z'),
    }]);
    const service = new QualityPublicFeedbackService({ $queryRawUnsafe: query } as any, config);

    const result = await service.issueToken('11111111-1111-1111-1111-111111111111');

    expect(result.token).toMatch(/^v1\./);
    expect(query.mock.calls[0].slice(1)).toEqual(['11111111-1111-1111-1111-111111111111']);
    expect(query.mock.calls[0].slice(1)).not.toContain(result.token);
  });

  it('rejects malformed public tokens before database access', async () => {
    const query = jest.fn();
    const service = new QualityPublicFeedbackService({ $queryRawUnsafe: query } as any, config);

    await expect(service.open('not-a-valid-token')).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('submits feedback atomically and includes idempotent negative escalation', async () => {
    const issueQuery = jest.fn().mockResolvedValue([{
      id: '11111111-1111-1111-1111-111111111111',
      publicTokenVersion: 1,
      expiresEpoch: String(Math.floor(Date.now() / 1000) + 3600),
      expiresAt: new Date(Date.now() + 3600_000),
    }]);
    const service = new QualityPublicFeedbackService({ $queryRawUnsafe: issueQuery } as any, config);
    const issued = await service.issueToken('11111111-1111-1111-1111-111111111111');

    const submitQuery = jest.fn().mockResolvedValue([{
      feedbackId: 'feedback-1',
      classification: 'NEGATIVE',
      rating: 1,
      duplicate: false,
      escalated: true,
    }]);
    const submitService = new QualityPublicFeedbackService({ $queryRawUnsafe: submitQuery } as any, config);

    const result = await submitService.submit(issued.token, { rating: 1, comment: 'Memnun kalmadım.' });

    expect(result).toEqual({ submitted: true, classification: 'NEGATIVE', rating: 1, duplicate: false, escalated: true });
    const sql = String(submitQuery.mock.calls[0][0]);
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('token_consumed_at');
    expect(sql).toContain('customer_feedback');
    expect(sql).toContain("'CUSTOMER_PORTAL'");
    expect(sql).toContain('quality_cases');
    expect(sql).toContain('ON CONFLICT (feedback_id)');
    expect(sql).toContain('AUTO_ESCALATED_PUBLIC_FEEDBACK');
  });

  it('returns an existing submitted feedback as a duplicate rather than writing a second one', async () => {
    const issueQuery = jest.fn().mockResolvedValue([{
      id: '22222222-2222-2222-2222-222222222222',
      publicTokenVersion: 1,
      expiresEpoch: String(Math.floor(Date.now() / 1000) + 3600),
      expiresAt: new Date(Date.now() + 3600_000),
    }]);
    const issueService = new QualityPublicFeedbackService({ $queryRawUnsafe: issueQuery } as any, config);
    const issued = await issueService.issueToken('22222222-2222-2222-2222-222222222222');

    const query = jest.fn().mockResolvedValue([{
      feedbackId: 'feedback-existing',
      classification: 'POSITIVE',
      rating: 5,
      duplicate: true,
      escalated: false,
    }]);
    const service = new QualityPublicFeedbackService({ $queryRawUnsafe: query } as any, config);
    const result = await service.submit(issued.token, { rating: 5 });

    expect(result.duplicate).toBe(true);
    expect(String(query.mock.calls[0][0])).toContain('existing_feedback');
  });

  it('rejects invalid ratings before submission persistence', async () => {
    const issueQuery = jest.fn().mockResolvedValue([{
      id: '33333333-3333-3333-3333-333333333333',
      publicTokenVersion: 1,
      expiresEpoch: String(Math.floor(Date.now() / 1000) + 3600),
      expiresAt: new Date(Date.now() + 3600_000),
    }]);
    const issueService = new QualityPublicFeedbackService({ $queryRawUnsafe: issueQuery } as any, config);
    const issued = await issueService.issueToken('33333333-3333-3333-3333-333333333333');

    const query = jest.fn();
    const service = new QualityPublicFeedbackService({ $queryRawUnsafe: query } as any, config);
    await expect(service.submit(issued.token, { rating: 6 })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});
