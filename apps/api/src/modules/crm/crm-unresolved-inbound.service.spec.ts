import { ConflictException, NotFoundException } from '@nestjs/common';
import { CrmUnresolvedInboundService } from './crm-unresolved-inbound.service';

describe('CrmUnresolvedInboundService', () => {
  const context = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

  function makeService() {
    const query = jest.fn();
    const execute = jest.fn();
    const transaction = jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work({ $queryRawUnsafe: query, $executeRawUnsafe: execute }),
    );
    const service = new CrmUnresolvedInboundService(
      {
        $queryRawUnsafe: query,
        $executeRawUnsafe: execute,
        $transaction: transaction,
      } as never,
      { getContext: jest.fn().mockReturnValue(context) } as never,
    );
    return { service, query, execute, transaction };
  }

  it('lists unresolved messages only inside the active branch scope', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([]);

    await service.list('OPEN', 25);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('branch_id=$3::text'),
      'tenant-1',
      'company-1',
      'branch-1',
      'OPEN',
      25,
    );
  });

  it('resolves an open inbox item to an existing lead and materializes the inbound CRM message', async () => {
    const { service, query, execute } = makeService();
    query
      .mockResolvedValueOnce([{
        id: 'inbox-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: 'branch-1',
        providerKey: 'meta-whatsapp',
        externalEventId: 'event-1',
        externalMessageId: 'wamid.1',
        channel: 'WHATSAPP',
        sender: '905551112233',
        recipient: '905559998877',
        subject: null,
        body: 'Merhaba',
        status: 'OPEN',
      }])
      .mockResolvedValueOnce([{ id: 'lead-1' }])
      .mockResolvedValueOnce([{ id: 'message-1' }]);

    await expect(
      service.resolve('inbox-1', 'LEAD', 'lead-1', 'Doğru lead bulundu.', 'user-1'),
    ).resolves.toEqual({
      id: 'inbox-1',
      status: 'RESOLVED',
      messageId: 'message-1',
      customerId: null,
      leadId: 'lead-1',
    });

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM crm_leads'),
      'tenant-1',
      'company-1',
      'branch-1',
      'lead-1',
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO crm_messages'),
      'tenant-1',
      'company-1',
      'branch-1',
      null,
      'lead-1',
      'WHATSAPP',
      'meta-whatsapp',
      '905551112233',
      null,
      'Merhaba',
      'wamid.1',
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("SET status='RESOLVED'"),
      'inbox-1',
      null,
      'lead-1',
      'user-1',
      'Doğru lead bulundu.',
    );
  });

  it('refuses to resolve an inbox item that is already closed', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([{
      id: 'inbox-1',
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      providerKey: 'meta-whatsapp',
      externalEventId: 'event-1',
      externalMessageId: 'wamid.1',
      channel: 'WHATSAPP',
      sender: '905551112233',
      recipient: '905559998877',
      subject: null,
      body: 'Merhaba',
      status: 'RESOLVED',
    }]);

    await expect(
      service.resolve('inbox-1', 'LEAD', 'lead-1', null, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects a lead outside the active branch scope', async () => {
    const { service, query } = makeService();
    query
      .mockResolvedValueOnce([{
        id: 'inbox-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: 'branch-1',
        providerKey: 'meta-whatsapp',
        externalEventId: 'event-1',
        externalMessageId: 'wamid.1',
        channel: 'WHATSAPP',
        sender: '905551112233',
        recipient: '905559998877',
        subject: null,
        body: 'Merhaba',
        status: 'OPEN',
      }])
      .mockResolvedValueOnce([]);

    await expect(
      service.resolve('inbox-1', 'LEAD', 'lead-other-branch', null, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
