import { BadRequestException } from '@nestjs/common';
import { TrainingService } from './training.service';

describe('TrainingService assignment lifecycle', () => {
  const tenant = {
    getTenantId: () => 't1',
    getCompanyId: () => 'c1',
    getBranchId: () => 'b1',
  };

  it('starts an assigned training and writes an audit event', async () => {
    const query = jest.fn<Promise<any[]>, any[]>(async (sql: string) => {
      if (sql.includes('SELECT id,status,branch_id')) return [{ id: 'a1', status: 'ASSIGNED', branchId: 'b1' }];
      if (sql.includes('UPDATE training_assignments')) return [{ id: 'a1', status: 'IN_PROGRESS', startedAt: new Date() }];
      return [];
    });
    const execute = jest.fn<Promise<number>, any[]>(async () => 1);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const service = new TrainingService(prisma as any, tenant as any);

    const result = await service.startAssignment('a1','u1','Started by manager');

    expect(result.status).toBe('IN_PROGRESS');
    const auditCall = execute.mock.calls.find((call) => String(call[0]).includes('training_assignment_events'));
    expect(auditCall).toBeDefined();
    expect(auditCall?.[5]).toBe('STARTED');
    expect(auditCall?.[6]).toBe('ASSIGNED');
    expect(auditCall?.[7]).toBe('IN_PROGRESS');
  });

  it('rejects an invalid completed-to-start transition', async () => {
    const query = jest.fn<Promise<any[]>, any[]>(async () => [{ id: 'a1', status: 'COMPLETED', branchId: 'b1' }]);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: jest.fn() };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const service = new TrainingService(prisma as any, tenant as any);

    await expect(service.startAssignment('a1','u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('claims overdue assignments with skip locked before expiring them', async () => {
    const query = jest.fn<Promise<any[]>, any[]>(async (sql: string) => {
      if (sql.includes('FOR UPDATE SKIP LOCKED')) return [{ id: 'a1', status: 'ASSIGNED', branchId: 'b1' }];
      return [];
    });
    const execute = jest.fn<Promise<number>, any[]>(async () => 1);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const service = new TrainingService(prisma as any, tenant as any);

    const result = await service.processExpired('u1',25);

    expect(result).toEqual({ processed: 1 });
    expect(String(query.mock.calls[0]?.[0])).toContain('FOR UPDATE SKIP LOCKED');
    expect(execute.mock.calls.some((call) => String(call[0]).includes("status='EXPIRED'"))).toBe(true);
    expect(execute.mock.calls.some((call) => String(call[0]).includes("'EXPIRED'"))).toBe(true);
  });
});
