import { CrmMessageWebhookHistoryService } from './crm-message-webhook-history.service';

describe('CrmMessageWebhookHistoryService', () => {
  it('scopes webhook history to tenant company and active branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmMessageWebhookHistoryService(
      { $queryRawUnsafe: query } as never,
      {
        getContext: () => ({
          tenantId: 'tenant-1',
          companyId: 'company-1',
          branchId: 'branch-1',
          roleScope: 'BRANCH',
        }),
      } as never,
    );

    await service.list(25);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('e.tenant_id=$1::text AND e.company_id=$2::text AND e.branch_id=$3::text'),
      'tenant-1',
      'company-1',
      'branch-1',
      25,
    );
  });
});
