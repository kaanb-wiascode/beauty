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
});
