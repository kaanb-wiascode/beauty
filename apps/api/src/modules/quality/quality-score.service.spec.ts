import { BadRequestException } from '@nestjs/common';
import { QualityScoreService } from './quality-score.service';

describe('QualityScoreService', () => {
  const tenant = {
    getContext: () => ({ tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' }),
  };

  it('creates a versioned policy under a transaction lock', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(async () => 1),
      $queryRawUnsafe: jest.fn(async (sql: string) => {
        if (sql.includes('MAX(version)')) return [{ version: 2 }];
        if (sql.includes('INSERT INTO quality_score_policies')) {
          return [{ id: 'policy-1', name: 'Branch Standard', version: 2, missingDataStrategy: 'EXCLUDE_AND_REWEIGHT' }];
        }
        return [];
      }),
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const service = new QualityScoreService(prisma as any, tenant as any);

    await expect(
      service.createPolicy(
        {
          name: 'Branch Standard',
          effectiveFrom: '2026-09-01',
          dimensions: [
            { code: 'HYGIENE', name: 'Hygiene', sourceKind: 'INSPECTION_CATEGORY', sourceKey: 'HYGIENE', weight: 30 },
          ],
          penaltyRules: [{ severity: 'CRITICAL', penaltyPoints: 10 }],
        },
        'user-1',
      ),
    ).resolves.toMatchObject({ id: 'policy-1', version: 2 });

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      expect.stringContaining('quality-score-policy:'),
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('quality_score_policy_dimensions'),
      'policy-1',
      'tenant-1',
      'company-1',
      'HYGIENE',
      'Hygiene',
      'INSPECTION_CATEGORY',
      'HYGIENE',
      30,
      0,
    );
  });

  it('rejects duplicate dimension codes', async () => {
    const service = new QualityScoreService({} as any, tenant as any);
    await expect(
      service.createPolicy(
        {
          name: 'Invalid',
          effectiveFrom: '2026-09-01',
          dimensions: [
            { code: 'hygiene', name: 'Hygiene A', sourceKind: 'INSPECTION_CATEGORY', sourceKey: 'HYGIENE', weight: 20 },
            { code: 'HYGIENE', name: 'Hygiene B', sourceKind: 'INSPECTION_CATEGORY', sourceKey: 'HYGIENE', weight: 20 },
          ],
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an ordered score period', async () => {
    const service = new QualityScoreService({} as any, tenant as any);
    await expect(
      service.calculate({ periodStart: '2026-09-30', periodEnd: '2026-09-01' }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
