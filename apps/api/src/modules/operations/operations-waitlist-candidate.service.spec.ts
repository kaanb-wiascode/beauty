import { Test } from '@nestjs/testing';

import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { OperationsBranchWorkingHoursService } from './operations-branch-working-hours.service';
import { OperationsStaffEligibilityService } from './operations-staff-eligibility.service';
import { OperationsWaitlistCandidateService } from './operations-waitlist-candidate.service';

describe('OperationsWaitlistCandidateService', () => {
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();
  const prisma = { $queryRawUnsafe: queryRawUnsafe, $executeRawUnsafe: executeRawUnsafe };
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
    getMembershipId: () => 'membership-1',
  };
  const eligibility = { check: jest.fn() };
  const workingHours = { check: jest.fn() };
  let service: OperationsWaitlistCandidateService;

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

  beforeEach(async () => {
    queryRawUnsafe.mockReset();
    executeRawUnsafe.mockReset();
    eligibility.check.mockReset();
    workingHours.check.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OperationsWaitlistCandidateService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: tenantContext },
        { provide: OperationsStaffEligibilityService, useValue: eligibility },
        { provide: OperationsBranchWorkingHoursService, useValue: workingHours },
      ],
    }).compile();

    service = moduleRef.get(OperationsWaitlistCandidateService);
  });

  it('filters a candidate outside configured branch hours before MATCH_FOUND transition', async () => {
    queryRawUnsafe.mockResolvedValueOnce([target]).mockResolvedValueOnce([candidate]);
    workingHours.check.mockResolvedValue({ configured: true, allowed: false, reason: 'OUTSIDE_BRANCH_HOURS' });
    const result = await service.findMatches('wait-1', { limit: 5 });
    expect(result.matches).toEqual([]);
    expect(eligibility.check).not.toHaveBeenCalled();
    expect(queryRawUnsafe).toHaveBeenCalledTimes(2);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('filters BLOCK-mode HR ineligible staff before exposing the candidate', async () => {
    queryRawUnsafe.mockResolvedValueOnce([target]).mockResolvedValueOnce([candidate]);
    workingHours.check.mockResolvedValue({ configured: true, allowed: true, reason: 'WITHIN_BRANCH_HOURS' });
    eligibility.check.mockResolvedValue({
      allowed: false, mode: 'BLOCK', blockers: [{ code: 'STAFF_CERTIFICATION_MISSING' }], warnings: [],
    });
    const result = await service.findMatches('wait-1', { limit: 5 });
    expect(result.matches).toEqual([]);
    expect(queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('keeps WARN-mode staff visible with eligibility evidence and transitions to MATCH_FOUND', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([target])
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([{ version: 3 }]);
    workingHours.check.mockResolvedValue({ configured: true, allowed: true, reason: 'WITHIN_BRANCH_HOURS' });
    eligibility.check.mockResolvedValue({
      allowed: true, mode: 'WARN', blockers: [], warnings: [{ code: 'STAFF_COMPETENCY_GAP' }],
    });
    const result = await service.findMatches('wait-1', { limit: 5 });
    expect(result.entryVersion).toBe(3);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].eligibility.mode).toBe('WARN');
    expect(result.matches[0].eligibility.warnings).toEqual([{ code: 'STAFF_COMPETENCY_GAP' }]);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
