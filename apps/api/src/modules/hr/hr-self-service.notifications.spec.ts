import { HrSelfServiceService } from './hr-self-service.service';

describe('HrSelfServiceService notifications', () => {
  const tenant = {
    getTenantId: () => 'tenant-a',
    getCompanyId: () => 'company-a',
  } as any;

  function createService(executeResult = 1) {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          id: 'staff-a',
          branchId: 'branch-a',
          firstName: 'Test',
          lastName: 'Çalışan',
          email: 'test@example.com',
          status: 'ACTIVE',
        },
      ]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(executeResult),
    } as any;
    const service = new HrSelfServiceService(
      prisma,
      tenant,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma };
  }

  it('marks only the authenticated employee notification as read', async () => {
    const { service, prisma } = createService(1);

    await expect(service.markNotificationRead('user-a', 'notification-a')).resolves.toEqual({
      id: 'notification-a',
      read: true,
    });

    const call = prisma.$executeRawUnsafe.mock.calls[0];
    expect(String(call[0])).toContain('staff_id=$4::text');
    expect(call.slice(1)).toEqual([
      'notification-a',
      'tenant-a',
      'company-a',
      'staff-a',
    ]);
  });

  it('marks only unread notifications of the authenticated employee as read', async () => {
    const { service, prisma } = createService(3);

    await expect(service.markAllNotificationsRead('user-a')).resolves.toEqual({ updated: 3 });

    const call = prisma.$executeRawUnsafe.mock.calls[0];
    expect(String(call[0])).toContain('staff_id=$3::text');
    expect(String(call[0])).toContain('read_at IS NULL');
    expect(call.slice(1)).toEqual(['tenant-a', 'company-a', 'staff-a']);
  });
});
