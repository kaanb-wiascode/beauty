import { CrmConversationService } from './crm-conversation.service';

describe('CrmConversationService', () => {
  const context = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

  it('lists threads with tenant company branch and user read scope', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmConversationService(
      { $queryRawUnsafe: query } as never,
      { getContext: jest.fn().mockReturnValue(context) } as never,
    );

    await service.list('user-1', 50);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, tenantId, companyId, branchId, userId, limit] = query.mock.calls[0];
    expect(sql).toContain('m.tenant_id=$1::text');
    expect(sql).toContain('m.company_id=$2::text');
    expect(sql).toContain('m.branch_id=$3::text');
    expect(sql).toContain('r.user_id=$4::text');
    expect([tenantId, companyId, branchId, userId, limit]).toEqual(['tenant-1','company-1','branch-1','user-1',50]);
  });

  it('marks a customer thread read only after asserting branch scope', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'customer-1' }]);
    const execute = jest.fn().mockResolvedValue(1);
    const service = new CrmConversationService(
      { $queryRawUnsafe: query, $executeRawUnsafe: execute } as never,
      { getContext: jest.fn().mockReturnValue(context) } as never,
    );

    await service.markRead('CUSTOMER', 'customer-1', 'user-1');
    expect(query.mock.calls[0][0]).toContain('"tenantId"=$1::text');
    expect(query.mock.calls[0][0]).toContain('"branchId"=$3::text');
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('crm_conversation_reads'),
      'tenant-1','company-1','branch-1','user-1','customer-1',
    );
  });
});
