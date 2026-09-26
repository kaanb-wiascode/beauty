import { NotFoundException } from '@nestjs/common';
import { TrainingLearnerDevelopmentService } from './training-learner-development.service';

describe('TrainingLearnerDevelopmentService', () => {
  const tenant = { getTenantId: () => 't1', getCompanyId: () => 'c1', getBranchId: () => 'b1' };

  it('lists development plans only for the authenticated learner staff identity', async () => {
    const query = jest.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('FROM training_learner_identities')) {
        return [{ staffId: 's1', branchId: 'b1', firstName: 'Ada', lastName: 'Yılmaz' }];
      }
      if (sql.includes('FROM staff_development_plans p')) {
        expect(args[2]).toBe('s1');
        expect(args[3]).toBe('b1');
        return [{ id: 'p1', title: 'Uzmanlık Gelişimi', status: 'ACTIVE', itemCount: 2, completedItemCount: 1 }];
      }
      return [];
    });
    const service = new TrainingLearnerDevelopmentService({ $queryRawUnsafe: query } as any, tenant as any);
    await expect(service.list('u1')).resolves.toEqual([
      { id: 'p1', title: 'Uzmanlık Gelişimi', status: 'ACTIVE', itemCount: 2, completedItemCount: 1 },
    ]);
  });

  it('rejects a development plan that does not belong to the authenticated learner', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM training_learner_identities')) {
        return [{ staffId: 's1', branchId: 'b1', firstName: 'Ada', lastName: 'Yılmaz' }];
      }
      if (sql.includes('FROM staff_development_plans p')) return [];
      return [];
    });
    const service = new TrainingLearnerDevelopmentService({ $queryRawUnsafe: query } as any, tenant as any);
    await expect(service.detail('u1', 'p-other')).rejects.toBeInstanceOf(NotFoundException);
  });
});
