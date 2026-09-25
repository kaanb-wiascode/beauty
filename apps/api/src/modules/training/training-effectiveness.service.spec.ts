import { TrainingEffectivenessService } from './training-effectiveness.service';

describe('TrainingEffectivenessService', () => {
  it('snapshots pre/post quality finding counts and classifies improvement', async () => {
    const execute = jest.fn<Promise<number>, any[]>(async () => 1);
    const query = jest.fn<Promise<any[]>, any[]>(async (sql: string) => {
      if (sql.includes('FROM training_assignments a') && sql.includes("source_type='QUALITY_RULE'")) return [{ id:'a1',branchId:'b1',staffId:'s1',sourceRuleId:'r1',assignedAt:new Date('2026-07-01T00:00:00Z'),completedAt:new Date('2026-08-01T00:00:00Z'),findingCategory:'HYGIENE',targetScope:'STAFF',ruleName:'Hygiene retraining',ruleVersion:1 }];
      if (sql.includes('WITH scoped AS')) return [{ preCount:4,postCount:1 }];
      if (sql.includes('INSERT INTO training_effectiveness_runs')) return [{ id:'er1',outcome:'IMPROVED',improvementPct:75 }];
      return [];
    });
    const tx = { $executeRawUnsafe: execute, $queryRawUnsafe: query };
    const prisma = { $transaction: jest.fn(async (fn:any) => fn(tx)) };
    const tenant = { getTenantId:()=> 't1', getCompanyId:()=> 'co1', getBranchId:()=> 'b1' };
    const service = new TrainingEffectivenessService(prisma as any,tenant as any);

    const result = await service.process('u1',{preWindowDays:30,postWindowDays:30,limit:10});

    expect(result.created).toBe(1);
    expect(result.improved).toBe(1);
    expect(query.mock.calls.some(call => String(call[0]).includes('quality_findings'))).toBe(true);
    expect(query.mock.calls.some(call => String(call[0]).includes('training_effectiveness_runs'))).toBe(true);
    expect(execute.mock.calls.some(call => String(call[0]).includes('pg_advisory_xact_lock'))).toBe(true);
  });
});
