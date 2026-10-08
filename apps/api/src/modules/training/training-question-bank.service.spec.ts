import { BadRequestException } from '@nestjs/common';
import { TrainingQuestionBankService } from './training-question-bank.service';

describe('TrainingQuestionBankService', () => {
  const tenant = {
    getTenantId: jest.fn(() => 'tenant-1'),
    getCompanyId: jest.fn(() => 'company-1'),
  } as any;

  it('rejects invalid reusable question content before persistence', async () => {
    const prisma = {} as any;
    const service = new TrainingQuestionBankService(prisma, tenant);

    await expect(service.create({
      code: 'Q-1',
      questionType: 'SINGLE_CHOICE',
      prompt: '',
      correctAnswer: 'a',
    }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists only draft course-version exams in tenant/company scope', async () => {
    const query = jest.fn(async () => [{
      id: 'exam-1',
      title: 'Final Quiz',
      courseVersionId: 'v1',
      version: 2,
      courseId: 'course-1',
      courseCode: 'HYGIENE',
      courseTitle: 'Hijyen',
      questionCount: 4,
    }]);
    const service = new TrainingQuestionBankService({ $queryRawUnsafe: query } as any, tenant);

    const result = await service.listDraftExams();

    expect(result).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("v.status='DRAFT'"),
      'tenant-1',
      'company-1',
    );
  });

  it('copies a published bank question into a draft exam snapshot', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'exam-1' }])
        .mockResolvedValueOnce([{
          id: 'question-1',
          version: 3,
          questionType: 'TRUE_FALSE',
          prompt: 'Sterilizasyon zorunludur.',
          options: ['true', 'false'],
          correctAnswer: true,
          defaultPoints: 2,
        }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: 'exam-question-1',
          sequence: 1,
          questionType: 'TRUE_FALSE',
          prompt: 'Sterilizasyon zorunludur.',
          points: 2,
          questionBankId: 'question-1',
          questionBankVersion: 3,
        }]),
    } as any;
    const prisma = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    } as any;
    const service = new TrainingQuestionBankService(prisma, tenant);

    const result = await service.addToExam('exam-1', 'question-1', { sequence: 1 }, 'user-1');

    expect(result.questionBankVersion).toBe(3);
    expect(result.duplicate).toBe(false);
    expect(tx.$queryRawUnsafe).toHaveBeenLastCalledWith(
      expect.stringContaining('question_bank_version'),
      'tenant-1',
      'company-1',
      'exam-1',
      1,
      'TRUE_FALSE',
      'Sterilizasyon zorunludur.',
      JSON.stringify(['true', 'false']),
      JSON.stringify(true),
      2,
      'user-1',
      'question-1',
      3,
    );
  });

  it('does not duplicate the same published bank version in one exam', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'exam-1' }])
        .mockResolvedValueOnce([{ id: 'question-1', version: 3, questionType: 'TRUE_FALSE', prompt: 'Q', options: null, correctAnswer: true, defaultPoints: 1 }])
        .mockResolvedValueOnce([{ id: 'exam-question-existing' }]),
    } as any;
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)) } as any;
    const service = new TrainingQuestionBankService(prisma, tenant);

    const result = await service.addToExam('exam-1', 'question-1', { sequence: 5 }, 'user-1');

    expect(result).toEqual({ id: 'exam-question-existing', duplicate: true });
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(3);
  });
});
