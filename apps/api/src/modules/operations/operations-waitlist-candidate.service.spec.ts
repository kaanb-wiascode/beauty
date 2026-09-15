import { OperationsWaitlistCandidateService } from './operations-waitlist-candidate.service';

describe('OperationsWaitlistCandidateService', () => {
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();
  const prisma = { $queryRawUnsafe: queryRawUnsafe, $executeRawUnsafe: executeRawUnsafe } as never;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
    getMembershipId: () => 'membership-1',
  } as never;
  const eligibility = { check: jest.fn() } as never;
  const workingHours = { check: jest.fn() } as never;

  const target = {
    id: 'wait-1', serviceId: 'service-1', preferredStaffId: null,
    desiredFrom: new Date(Date.now() - 60_000), desiredTo: new Date(Date.now() + 86_400_000),
    preferredTimeStart: null, preferredTimeEnd: null, timeZone: 'Europe/Istanbul',
    status: 'WAITING', expiresAt: null, version: 2, durationMinutes: 60,
    roomType: null, requiredAssetType: null, requiredAssetId: null,
    prepDurationMinutes: 0, cleanupDurationMinutes: 0,
  };
  const candidate = {
    staffId: 'staff-1', staffName: 'Eligible Staff',
    startAt: new Date(Date.now() + 3_600_000), endAt: new Date(Date.now() + 7_200_000),
    blockedFrom: new Date(Date.now() + 3_600_000), blockedTo: new Date(Date.now() + 7_200_000),
    roomId: null, roomName: null, assetId: null, assetName: null,
  };

  beforeEach(() => {
    queryRawUnsafe.mockReset();
    executeRawUnsafe.mockReset();
    (eligibility.check as jest.Mock).mockReset();
    (workingHours.check as jest.Mock).mockReset();
  });

  it('filters a candidate outside configured branch hours before MATCH_FOUND transition', async () => {
    queryRawUnsafe.mockResolvedValueOnce([target]).mockResolvedValueOnce([candidate]);
    (workingHours.check as jest.Mock).mockResolvedValue({ configured: true, allowed: false, reason: 'OUTSIDE_BRANCH_HOURS' });
    const service = new OperationsWaitlistCandidateService(prisma, tenantContext, eligibility, workingHours);
    const result = await service.findMatches('wait-1', { limit: 5 } as never);
    expect(result.matches).toEqual([]);
    expect(eligibility.check).not.toHaveBeenCalled();
    expect(queryRawUnsafe).toHaveBeenCalledTimes(2);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('filters BLOCK-mode HR ineligible staff before exposing the candidate', async () => {
    queryRawUnsafe.mockResolvedValueOnce([target]).mockResolvedValueOnce([candidate]);
    (workingHours.check as jest.Mock).mockResolvedValue({ configured: true, allowed: true, reason: 'WITHIN_BRANCH_HOURS' });
    (eligibility.check as jest.Mock).mockResolvedValue({
      allowed: false, mode: 'BLOCK', blockers: [{ code: 'STAFF_CERTIFICATION_MISSING' }], warnings: [],
    });
    const service = new OperationsWaitlistCandidateService(prisma, tenantContext, eligibility, workingHours);
    const result = await service.findMatches('wait-1', { limit: 5 } as never);
    expect(result.matches).toEqual([]);
    expect(queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('keeps WARN-mode staff visible with eligibility evidence and transitions to MATCH_FOUND', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([target])
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([{ version: 3 }]);
    (workingHours.check as jest.Mock).mockResolvedValue({ configured: true, allowed: true, reason: 'WITHIN_BRANCH_HOURS' });
    (eligibility.check as jest.Mock).mockResolvedValue({
      allowed: true, mode: 'WARN', blockers: [], warnings: [{ code: 'STAFF_COMPETENCY_GAP' }],
    });
    const service = new OperationsWaitlistCandidateService(prisma, tenantContext, eligibility, workingHours);
    const result = await service.findMatches('wait-1', { limit: 5 } as never);
    expect(result.entryVersion).toBe(3);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].eligibility.mode).toBe('WARN');
    expect(result.matches[0].eligibility.warnings).toEqual([{ code: 'STAFF_COMPETENCY_GAP' }]);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
