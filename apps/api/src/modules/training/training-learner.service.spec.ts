import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TrainingLearnerService } from './training-learner.service';

describe('TrainingLearnerService', () => {
  const tenant = { getTenantId: () => 't1', getCompanyId: () => 'c1', getBranchId: () => 'b1' };

  it('lists assignments only for the authenticated learner staff identity', async () => {
    const query = jest.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('FROM training_learner_identities')) {
        return [{ userId: 'u1', staffId: 's1', branchId: 'b1', firstName: 'Ada', lastName: 'Yılmaz', status: 'ACTIVE' }];
      }
      if (sql.includes('FROM training_assignments a')) {
        expect(args[2]).toBe('s1');
        expect(args[3]).toBe('b1');
        return [{ id: 'a1', courseTitle: 'Hijyen', status: 'ASSIGNED' }];
      }
      return [];
    });
    const prisma = { $queryRawUnsafe: query };
    const service = new TrainingLearnerService(prisma as any, tenant as any, {} as any, {} as any);
    const result = await service.assignments('u1');
    expect(result).toEqual([{ id: 'a1', courseTitle: 'Hijyen', status: 'ASSIGNED' }]);
  });

  it('does not auto-link when more than one staff profile matches the user email', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM users WHERE')) return [{ id: 'u1', email: 'ada@example.com' }];
      if (sql.includes('FROM staff s JOIN branches')) return [{ id: 's1' }, { id: 's2' }];
      return [];
    });
    const prisma = { $queryRawUnsafe: query };
    const service = new TrainingLearnerService(prisma as any, tenant as any, {} as any, {} as any);
    await expect(service.linkSelfByEmail('u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never signs a document that is outside the learner assignment course version', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM training_learner_identities')) {
        return [{ userId: 'u1', staffId: 's1', branchId: 'b1', firstName: 'Ada', lastName: 'Yılmaz', status: 'ACTIVE' }];
      }
      if (sql.includes('FROM training_assignments')) return [{ id: 'a1', status: 'IN_PROGRESS', courseVersionId: 'v1' }];
      if (sql.includes('FROM training_lessons')) return [];
      return [];
    });
    const prisma = { $queryRawUnsafe: query };
    const content = { downloadLessonDocument: jest.fn() };
    const service = new TrainingLearnerService(prisma as any, tenant as any, {} as any, content as any);
    await expect(service.lessonDocument('u1', 'a1', 'l2')).rejects.toBeInstanceOf(NotFoundException);
    expect(content.downloadLessonDocument).not.toHaveBeenCalled();
  });
});
