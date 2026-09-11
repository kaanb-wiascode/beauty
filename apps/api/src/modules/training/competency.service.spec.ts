import { CompetencyService } from './competency.service';

describe('CompetencyService profile versioning', () => {
  it('creates a new immutable profile version without deleting prior requirements', async () => {
    const execute = jest.fn<Promise<number>, any[]>(async () => 1);
    const query = jest.fn<Promise<any[]>, any[]>(async (sql: string) => {
      if (sql.includes('FROM competency_definitions')) return [{ id: 'comp1' }];
      if (sql.includes('MAX(version)')) return [{ version: 2 }];
      if (sql.includes('INSERT INTO competency_profiles')) return [{ id: 'profile-v2', code: 'THERAPIST', name: 'Therapist', version: 2, isActive: true }];
      return [];
    });
    const tx = { $executeRawUnsafe: execute, $queryRawUnsafe: query };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const tenant = { getTenantId: () => 't1', getCompanyId: () => 'c1', getBranchId: () => null };
    const service = new CompetencyService(prisma as any, tenant as any);

    const result = await service.createProfile({
      code: 'therapist',
      name: 'Therapist',
      effectiveFrom: '2026-09-13',
      requirements: [{ competencyId: 'comp1', requiredLevel: 80, weight: 2 }],
    }, 'u1');

    expect(result.version).toBe(2);
    expect(execute.mock.calls.some((call) => String(call[0]).includes('pg_advisory_xact_lock'))).toBe(true);
    expect(execute.mock.calls.some((call) => String(call[0]).includes('UPDATE competency_profiles SET is_active=false'))).toBe(true);
    expect(execute.mock.calls.some((call) => String(call[0]).includes('DELETE FROM competency_profile_requirements'))).toBe(false);
    expect(execute.mock.calls.some((call) => String(call[0]).includes('INSERT INTO competency_profile_requirements'))).toBe(true);
  });
});
