import { CrmCommunicationComplianceService } from './crm-communication-compliance.service';

describe('CrmCommunicationComplianceService', () => {
  const context = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

  it('requires explicit OPTED_IN for automation messages', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ status: null }]).mockResolvedValueOnce([{ status: 'OPTED_IN' }]);
    const service = new CrmCommunicationComplianceService(
      { $queryRawUnsafe: query } as never,
      { getContext: jest.fn().mockReturnValue(context) } as never,
    );

    await expect(service.canSendAutomation(context, { leadId: 'lead-1', opportunityId: null }, 'WHATSAPP'))
      .resolves.toEqual({ allowed: false, status: 'UNKNOWN' });
    await expect(service.canSendAutomation(context, { leadId: 'lead-1', opportunityId: null }, 'WHATSAPP'))
      .resolves.toEqual({ allowed: true, status: 'OPTED_IN' });
  });

  it('persists current permission state and an immutable audit event', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'customer-1' }]);
    const txQuery = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'permission-1' }]);
    const txExecute = jest.fn().mockResolvedValue(1);
    const transaction = jest.fn().mockImplementation(async (work: (tx: unknown) => Promise<unknown>) =>
      work({ $queryRawUnsafe: txQuery, $executeRawUnsafe: txExecute }),
    );
    const service = new CrmCommunicationComplianceService(
      { $queryRawUnsafe: query, $transaction: transaction } as never,
      { getContext: jest.fn().mockReturnValue(context) } as never,
    );

    await expect(service.set(
      'CUSTOMER',
      'customer-1',
      'WHATSAPP',
      'OPTED_OUT',
      'MANUAL',
      'Müşteri talebi',
      'user-1',
    )).resolves.toMatchObject({ id: 'permission-1', status: 'OPTED_OUT', channel: 'WHATSAPP' });

    expect(txExecute).toHaveBeenCalledWith(
      expect.stringContaining('crm_contact_channel_permission_events'),
      'tenant-1',
      'company-1',
      'branch-1',
      'permission-1',
      'customer-1',
      null,
      'WHATSAPP',
      null,
      'OPTED_OUT',
      'MANUAL',
      'Müşteri talebi',
      'user-1',
    );
  });
});
