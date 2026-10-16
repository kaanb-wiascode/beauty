import { ConflictException } from '@nestjs/common';

import { OperationsCustomerEngagementService } from './operations-customer-engagement.service';

describe('OperationsCustomerEngagementService', () => {
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();
  const membershipFindFirst = jest.fn();
  const createDraft = jest.fn();
  const send = jest.fn();
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
    $executeRawUnsafe: executeRawUnsafe,
    membership: { findFirst: membershipFindFirst },
  } as never;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
    getMembershipId: () => 'membership-1',
  } as never;
  const crmMessages = { createDraft, send } as never;

  beforeEach(() => {
    queryRawUnsafe.mockReset();
    executeRawUnsafe.mockReset();
    membershipFindFirst.mockReset();
    createDraft.mockReset();
    send.mockReset();
  });

  it('uses a stable CRM idempotency key for an appointment reminder', async () => {
    const startAt = new Date('2026-09-20T10:00:00.000Z');
    queryRawUnsafe.mockResolvedValueOnce([{
      id: 'appointment-1',
      customerId: 'customer-1',
      status: 'SCHEDULED',
      startAt,
      customerName: 'Ayşe Test',
      serviceName: 'Cilt Bakımı',
      staffName: 'Elif Uzman',
    }]);
    membershipFindFirst.mockResolvedValueOnce({ userId: 'user-1' });
    createDraft.mockResolvedValueOnce({ id: 'message-1', status: 'DRAFT', version: 1 });
    send.mockResolvedValueOnce({ id: 'message-1', status: 'SENT', version: 2 });
    executeRawUnsafe.mockResolvedValueOnce(1);

    const service = new OperationsCustomerEngagementService(prisma, tenantContext, crmMessages);
    const result = await service.sendAppointmentReminder('appointment-1', { channel: 'SMS' });

    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'customer-1',
        channel: 'SMS',
        idempotencyKey: `OPS_APPOINTMENT_REMINDER:appointment-1:${startAt.toISOString()}:SMS`,
      }),
      'user-1',
    );
    expect(send).toHaveBeenCalledWith('message-1', 1);
    expect(result.messageStatus).toBe('SENT');
  });

  it('rejects a stale confirmation version', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{
        id: 'appointment-1',
        customerId: 'customer-1',
        status: 'SCHEDULED',
        startAt: new Date('2026-09-20T10:00:00.000Z'),
        customerName: 'Ayşe Test',
        serviceName: 'Cilt Bakımı',
        staffName: 'Elif Uzman',
      }])
      .mockResolvedValueOnce([]);

    const service = new OperationsCustomerEngagementService(prisma, tenantContext, crmMessages);
    await expect(
      service.updateConfirmation('appointment-1', {
        status: 'CONFIRMED',
        expectedVersion: 3,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
