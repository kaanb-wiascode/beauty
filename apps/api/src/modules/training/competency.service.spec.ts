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

describe('CompetencyService skill matrix', () => {
  it('exposes the default L0-L5 display scale while retaining numeric score ranges', () => {
    const service = new CompetencyService({} as any, { getTenantId: () => 't1', getCompanyId: () => 'c1', getBranchId: () => null } as any);
    expect(service.levelScale()).toEqual([
      { code: 'L0', label: 'Yetkin Değil', minScore: 0, maxScore: 19 },
      { code: 'L1', label: 'Başlangıç', minScore: 20, maxScore: 39 },
      { code: 'L2', label: 'Gözetim Altında', minScore: 40, maxScore: 59 },
      { code: 'L3', label: 'Bağımsız Uygulayabilir', minScore: 60, maxScore: 79 },
      { code: 'L4', label: 'İleri', minScore: 80, maxScore: 94 },
      { code: 'L5', label: 'Eğitmen', minScore: 95, maxScore: 100 },
    ]);
  });

  it('keeps unprofiled staff visible and maps current/required scores to competency bands', async () => {
    const query = jest.fn<Promise<any[]>, any[]>(async () => [
      {
        staffId: 's1', firstName: 'Ada', lastName: 'Yılmaz', branchId: 'b1', position: 'Estetisyen',
        profileId: 'p1', profileCode: 'EST', profileName: 'Estetisyen', profileVersion: 3,
        competencyId: 'comp1', competencyCode: 'HYGIENE', competencyName: 'Hijyen', requiredLevel: 90,
        weight: 1, currentLevel: 84, gap: 6, latestSource: 'PRACTICAL', lastAssessedAt: new Date('2026-09-15T10:00:00Z'),
      },
      {
        staffId: 's2', firstName: 'Ece', lastName: 'Kaya', branchId: 'b1', position: 'Danışman',
        profileId: null, profileCode: null, profileName: null, profileVersion: null,
        competencyId: null, competencyCode: null, competencyName: null, requiredLevel: null,
        weight: null, currentLevel: null, gap: 0, latestSource: null, lastAssessedAt: null,
      },
    ]);
    const prisma = { $queryRawUnsafe: query };
    const tenant = { getTenantId: () => 't1', getCompanyId: () => 'c1', getBranchId: () => 'b1' };
    const service = new CompetencyService(prisma as any, tenant as any);

    const result = await service.skillMatrix();

    expect(result).toHaveLength(2);
    expect(result[0].profile).toEqual({ id: 'p1', code: 'EST', name: 'Estetisyen', version: 3 });
    expect(result[0].requirements[0].currentBand.code).toBe('L4');
    expect(result[0].requirements[0].requiredBand.code).toBe('L4');
    expect(result[0].requirements[0].meetsRequirement).toBe(false);
    expect(result[1].profile).toBeNull();
    expect(result[1].requirements).toEqual([]);
    expect(String(query.mock.calls[0][0])).toContain("s.status='ACTIVE'");
    expect(query.mock.calls[0].slice(-3)).toEqual(['t1', 'c1', 'b1']);
  });
});
