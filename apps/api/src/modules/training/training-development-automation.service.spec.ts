import { TrainingDevelopmentAutomationService } from './training-development-automation.service';

describe('TrainingDevelopmentAutomationService', () => {
  const tenant = { getTenantId: () => 't1', getCompanyId: () => 'c1', getBranchId: () => 'b1' };

  it('pins a development-plan course assignment to the published course version', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM staff_development_plan_items i')) return [{ id:'i1', itemType:'COURSE', courseId:'c-course', dueDate:null, trainingAssignmentId:null, programAssignmentId:null, staffId:'s1', branchId:'b1' }];
      if (sql.includes('SELECT training_assignment_id')) return [{ trainingAssignmentId:null }];
      if (sql.includes('FROM training_course_versions')) return [{ id:'v-published' }];
      if (sql.includes('INSERT INTO training_assignments')) {
        expect(sql).toContain('course_version_id');
        return [{ id:'a1', status:'ASSIGNED' }];
      }
      return [];
    });
    const execute = jest.fn(async (..._args: unknown[]) => 1);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const prisma = { $queryRawUnsafe: query, $executeRawUnsafe: execute, $transaction: (fn: any) => fn(tx) };
    const service = new TrainingDevelopmentAutomationService(prisma as any, tenant as any, {} as any);
    const result = await service.materialize('p1','i1','u1');
    expect(result.trainingAssignmentId).toBe('a1');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('ORDER BY version DESC LIMIT 1'))).toBe(true);
  });

  it('delegates learning-path materialization to the existing program assignment engine', async () => {
    const query = jest.fn(async () => [{ id:'i2', itemType:'PROGRAM', programId:'prog1', trainingAssignmentId:null, programAssignmentId:null, staffId:'s1', branchId:'b1' }]);
    const execute = jest.fn(async (..._args: unknown[]) => 1);
    const programs = { assign: jest.fn(async () => ({ programAssignmentId:'pa1', status:'ASSIGNED' })) };
    const prisma = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const service = new TrainingDevelopmentAutomationService(prisma as any, tenant as any, programs as any);
    const result = await service.materialize('p1','i2','u1');
    expect(programs.assign).toHaveBeenCalledWith('prog1',{ branchId:'b1', staffId:'s1', idempotencyKey:'development-plan:i2' },'u1');
    expect(result.programAssignmentId).toBe('pa1');
  });

  it('closes linked IDP items when their training assignment is completed', async () => {
    const query = jest.fn(async () => [{ id:'i1', planId:'p1', status:'IN_PROGRESS', trainingAssignmentId:'a1', programAssignmentId:null, branchId:'b1', trainingStatus:'COMPLETED', programComplete:null }]);
    const execute = jest.fn(async (..._args: unknown[]) => 1);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const prisma = { $transaction: (fn: any) => fn(tx) };
    const service = new TrainingDevelopmentAutomationService(prisma as any, tenant as any, {} as any);
    const result = await service.synchronize('u1');
    expect(result.completed).toBe(1);
    expect(execute.mock.calls.some(([sql]) => String(sql).includes("status='COMPLETED'"))).toBe(true);
  });
});
