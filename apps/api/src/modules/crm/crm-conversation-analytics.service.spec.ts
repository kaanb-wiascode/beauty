import { BadRequestException } from '@nestjs/common';
import { CrmConversationAnalyticsService } from './crm-conversation-analytics.service';

describe('CrmConversationAnalyticsService', () => {
  it('requires an active branch', async () => {
    const service = new CrmConversationAnalyticsService(
      { $queryRawUnsafe: jest.fn() } as never,
      { getContext: () => ({ tenantId: 'tenant-1', companyId: 'company-1', branchId: null }) } as never,
    );
    await expect(Promise.resolve().then(() => service.summary('user-1'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes the summary and uses branch SLA policy values', async () => {
    const query = jest.fn().mockResolvedValue([{
      totalThreads: 4,
      unreadThreads: 2,
      unreadMessages: 3,
      awaitingResponse: 2,
      breachedTarget: 1,
      criticalBreached: 0,
      whatsappAwaiting: 1,
      smsAwaiting: 0,
      emailAwaiting: 1,
      oldestAwaitingMinutes: 180,
      whatsappTargetMinutes: 60,
      smsTargetMinutes: 90,
      emailTargetMinutes: 240,
      criticalAfterMinutes: 720,
    }]);
    const service = new CrmConversationAnalyticsService(
      { $queryRawUnsafe: query } as never,
      { getContext: () => ({ tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' }) } as never,
    );

    await expect(service.summary('user-1')).resolves.toMatchObject({
      totalThreads: 4,
      breachedTarget: 1,
      whatsappTargetMinutes: 60,
      criticalAfterMinutes: 720,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('crm_conversation_sla_policies'),
      'tenant-1',
      'company-1',
      'branch-1',
      'user-1',
    );
  });
});
