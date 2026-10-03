import { TrainingCompetencyBridgeService } from './training-competency-bridge.service';

describe('TrainingCompetencyBridgeService', () => {
  it('creates an idempotent TRAINING competency assessment from a passing finalized result', async () => {
    const execute = jest.fn<Promise<number>, any[]>(async () => 1);
    const query = jest.fn<Promise<any[]>, any[]>(async (sql: string) => {
      if (sql.includes('FROM training_assignment_results r')) return [{ assignmentId:'a1',courseVersionId:'v1',theoryScore:80,practicalScore:90,finalPassed:true,finalizedAt:new Date('2026-09-12T00:00:00Z'),branchId:'b1',staffId:'s1' }];
      if (sql.includes('FROM training_competency_outcomes') && sql.includes('ORDER BY id')) return [{ id:'o1',competencyId:'c1',scoreSource:'AVERAGE',fixedScore:null }];
      if (sql.includes('INSERT INTO staff_competency_assessments')) return [{ id:'ca1' }];
      return [];
    });
    const tx = { $executeRawUnsafe: execute, $queryRawUnsafe: query };
    const prisma = { $transaction: jest.fn(async (fn:any) => fn(tx)) };
    const tenant = { getTenantId:()=> 't1', getCompanyId:()=> 'co1', getBranchId:()=> 'b1' };
    const service = new TrainingCompetencyBridgeService(prisma as any,tenant as any);

    const result = await service.processCompleted('u1',25);

    expect(result.assessmentsCreated).toBe(1);
    expect(query.mock.calls.some(call => String(call[0]).includes("source_type='TRAINING'"))).toBe(true);
    expect(query.mock.calls.some(call => String(call[0]).includes('ON CONFLICT(tenant_id,company_id,staff_id,competency_id,source_result_id)'))).toBe(true);
    expect(execute.mock.calls.some(call => String(call[0]).includes('pg_advisory_xact_lock'))).toBe(true);
    expect(execute.mock.calls.some(call => String(call[0]).includes("'ASSESSMENT_CREATED'"))).toBe(true);
  });

  it('does not permit outcome authoring against non-draft course versions', async () => {
    const tx = { $executeRawUnsafe: jest.fn(), $queryRawUnsafe: jest.fn(async () => []) };
    const prisma = { $transaction: jest.fn(async (fn:any) => fn(tx)) };
    const tenant = { getTenantId:()=> 't1', getCompanyId:()=> 'co1', getBranchId:()=> null };
    const service = new TrainingCompetencyBridgeService(prisma as any,tenant as any);

    await expect(service.addOutcome('v1',{competencyId:'c1',scoreSource:'THEORY'},'u1')).rejects.toThrow('Draft course version not found.');
  });
});
