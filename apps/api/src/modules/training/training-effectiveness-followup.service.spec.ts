import { BadRequestException } from '@nestjs/common';
import { TrainingEffectivenessFollowupService } from './training-effectiveness-followup.service';

describe('TrainingEffectivenessFollowupService', () => {
  const tenant = {
    getTenantId: () => 't1',
    getCompanyId: () => 'c1',
    getBranchId: () => 'b1',
  };

  it('claims non-improving effectiveness runs and opens explainable manager follow-ups', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'er-1',
            branchId: 'b1',
            assignmentId: 'a1',
            staffId: 's1',
            findingCategory: 'HYGIENE',
            preFindingCount: 1,
            postFindingCount: 3,
            improvementPct: -200,
            outcome: 'WORSE',
          },
        ])
        .mockResolvedValueOnce([{ id: 'followup-1' }]),
      $executeRawUnsafe: jest.fn(async () => 1),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new TrainingEffectivenessFollowupService(
      prisma as any,
      tenant as any,
    );

    await expect(service.process('user-1')).resolves.toMatchObject({
      claimed: 1,
      created: 1,
      investigateRootCause: 1,
    });
    expect(tx.$queryRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FOR UPDATE OF er SKIP LOCKED'),
      't1',
      'c1',
      'b1',
      50,
    );
    expect(tx.$queryRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO training_effectiveness_followups'),
      't1',
      'c1',
      'b1',
      'er-1',
      'a1',
      's1',
      'INVESTIGATE_ROOT_CAUSE',
      'HIGH',
      expect.stringContaining('"automaticDecision":false'),
      14,
      'user-1',
    );
  });

  it('rejects explicit branch filters outside the active branch scope', async () => {
    const prisma = { $queryRawUnsafe: jest.fn() };
    const service = new TrainingEffectivenessFollowupService(
      prisma as any,
      tenant as any,
    );

    await expect(service.list({ branchId: 'b2' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('does not allow an open follow-up to bypass acknowledgement', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn(async () => [
        { id: 'followup-1', branchId: 'b1', status: 'OPEN' },
      ]),
      $executeRawUnsafe: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new TrainingEffectivenessFollowupService(
      prisma as any,
      tenant as any,
    );

    await expect(
      service.transition(
        'followup-1',
        'RESOLVED',
        { note: 'Reviewed.' },
        'user-1',
      ),
    ).rejects.toThrow(
      'Invalid effectiveness follow-up transition: OPEN -> RESOLVED.',
    );
  });

  it('requires a resolution note and resolves an acknowledged follow-up audibly', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'followup-1', branchId: 'b1', status: 'ACKNOWLEDGED' },
        ])
        .mockResolvedValueOnce([
          {
            id: 'followup-1',
            status: 'RESOLVED',
            actionType: 'REASSESS_COMPETENCY',
          },
        ]),
      $executeRawUnsafe: jest.fn(async () => 1),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new TrainingEffectivenessFollowupService(
      prisma as any,
      tenant as any,
    );

    await expect(
      service.transition('followup-1', 'RESOLVED', {}, 'user-1'),
    ).rejects.toThrow('Resolution note is required.');

    await expect(
      service.transition(
        'followup-1',
        'RESOLVED',
        { note: 'Manager reviewed root cause and reassessment.' },
        'user-1',
      ),
    ).resolves.toMatchObject({ id: 'followup-1', status: 'RESOLVED' });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('training_effectiveness_followup_events'),
      't1',
      'c1',
      'b1',
      'followup-1',
      'RESOLVED',
      'ACKNOWLEDGED',
      'RESOLVED',
      'user-1',
      JSON.stringify({
        note: 'Manager reviewed root cause and reassessment.',
      }),
    );
  });
});
