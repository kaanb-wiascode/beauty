import { QualityInspectionSchedulerService } from './quality-inspection-scheduler.service';

describe('QualityInspectionSchedulerService', () => {
  it('uses row locking and deterministic idempotency for due schedules', async () => {
    const client = {
      $queryRawUnsafe: jest.fn<Promise<any[]>, any[]>(async () => [
        { scheduleId: 's1', inspectionId: 'i1' },
      ]),
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(client)) };
    const tenant = {
      getContext: () => ({ tenantId: 't1', companyId: 'c1', branchId: 'b1' }),
    };
    const service = new QualityInspectionSchedulerService(
      prisma as any,
      tenant as any,
    );

    await expect(
      service.processDue('u1', { limit: 10, workerId: 'worker-a' }),
    ).resolves.toMatchObject({ processed: 1 });

    const firstCall = client.$queryRawUnsafe.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    const sql = firstCall?.[0] as string;
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('inspection-schedule:');
    expect(sql).toContain(
      'ON CONFLICT (tenant_id,company_id,idempotency_key) DO NOTHING',
    );
  });
});
