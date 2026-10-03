import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { SkillBasedSchedulingService } from '../hr/skill-based-scheduling.service';
import { OperationsStaffEligibilityService } from './operations-staff-eligibility.service';

describe('OperationsStaffEligibilityService', () => {
  const queryRawUnsafe = jest.fn();
  const appointmentFindFirst = jest.fn();
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
    appointment: { findFirst: appointmentFindFirst },
  };
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
  };
  const hrScheduling = { eligibility: jest.fn() };
  let service: OperationsStaffEligibilityService;

  beforeEach(async () => {
    queryRawUnsafe.mockReset();
    appointmentFindFirst.mockReset();
    hrScheduling.eligibility.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OperationsStaffEligibilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: tenantContext },
        { provide: SkillBasedSchedulingService, useValue: hrScheduling },
      ],
    }).compile();

    service = moduleRef.get(OperationsStaffEligibilityService);
  });

  it('defaults to WARN and surfaces HR blockers without blocking the action', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);
    hrScheduling.eligibility.mockResolvedValue({
      checks: {
        branch: true,
        scheduledShift: false,
        leaveClear: true,
        appointmentClear: true,
        certification: false,
        competency: false,
        position: true,
      },
      certification: { missing: [{ certificationTypeId: 'cert-1' }] },
      missingCompetencies: [{ competencyId: 'comp-1' }],
    });

    const result = await service.check({
      staffId: '11111111-1111-4111-8111-111111111111',
      serviceId: '22222222-2222-4222-8222-222222222222',
      startAt: new Date('2026-09-16T09:00:00Z'),
      endAt: new Date('2026-09-16T10:00:00Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.mode).toBe('WARN');
    expect(result.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'STAFF_OUTSIDE_PUBLISHED_SHIFT',
        'STAFF_CERTIFICATION_MISSING',
        'STAFF_COMPETENCY_GAP',
      ]),
    );
  });

  it('blocks when BLOCK mode is active and certification is missing', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'policy-1',
        mode: 'BLOCK',
        requirePublishedShift: true,
        requireServiceCertification: true,
        requireCompetency: true,
        version: 1,
      },
    ]);
    hrScheduling.eligibility.mockResolvedValue({
      checks: {
        branch: true,
        scheduledShift: true,
        leaveClear: true,
        appointmentClear: true,
        certification: false,
        competency: true,
        position: true,
      },
      certification: { missing: [{ certificationTypeId: 'cert-1' }] },
      missingCompetencies: [],
    });

    const result = await service.check({
      staffId: '11111111-1111-4111-8111-111111111111',
      serviceId: '22222222-2222-4222-8222-222222222222',
      startAt: new Date('2026-09-16T09:00:00Z'),
      endAt: new Date('2026-09-16T10:00:00Z'),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'STAFF_CERTIFICATION_MISSING' }),
    ]);
  });

  it('ignores the appointment itself while revalidating execution eligibility', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'policy-1',
        mode: 'BLOCK',
        requirePublishedShift: true,
        requireServiceCertification: true,
        requireCompetency: true,
        version: 1,
      },
    ]);
    appointmentFindFirst.mockResolvedValue({
      id: 'appointment-1',
      staffId: '11111111-1111-4111-8111-111111111111',
      serviceId: '22222222-2222-4222-8222-222222222222',
      startAt: new Date('2026-09-16T09:00:00Z'),
      endAt: new Date('2026-09-16T10:00:00Z'),
    });
    hrScheduling.eligibility.mockResolvedValue({
      checks: {
        branch: true,
        scheduledShift: true,
        leaveClear: true,
        appointmentClear: false,
        certification: true,
        competency: true,
        position: true,
      },
      certification: { missing: [] },
      missingCompetencies: [],
    });

    await expect(service.assertAppointmentExecutionEligible('appointment-1')).resolves.toEqual(
      expect.objectContaining({ allowed: true }),
    );
  });

  it('raises a conflict for a blocked waitlist acceptance', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ serviceId: '22222222-2222-4222-8222-222222222222' }])
      .mockResolvedValueOnce([
        {
          id: 'policy-1',
          mode: 'BLOCK',
          requirePublishedShift: true,
          requireServiceCertification: true,
          requireCompetency: true,
          version: 1,
        },
      ]);
    hrScheduling.eligibility.mockResolvedValue({
      checks: {
        branch: true,
        scheduledShift: false,
        leaveClear: true,
        appointmentClear: true,
        certification: true,
        competency: true,
        position: true,
      },
      certification: { missing: [] },
      missingCompetencies: [],
    });

    await expect(
      service.assertWaitlistEntryEligible('entry-1', {
        staffId: '11111111-1111-4111-8111-111111111111',
        startAt: new Date('2026-09-16T09:00:00Z'),
        endAt: new Date('2026-09-16T10:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
