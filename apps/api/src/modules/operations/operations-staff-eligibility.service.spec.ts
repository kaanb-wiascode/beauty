import { ConflictException } from '@nestjs/common';

import { OperationsStaffEligibilityService } from './operations-staff-eligibility.service';

describe('OperationsStaffEligibilityService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
    appointment: { findFirst: jest.fn() },
  } as never;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
  } as never;
  const hrScheduling = { eligibility: jest.fn() } as never;

  beforeEach(() => {
    queryRawUnsafe.mockReset();
    (hrScheduling.eligibility as jest.Mock).mockReset();
    (prisma as any).appointment.findFirst.mockReset();
  });

  it('defaults to WARN and surfaces HR blockers without blocking the action', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);
    (hrScheduling.eligibility as jest.Mock).mockResolvedValue({
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

    const service = new OperationsStaffEligibilityService(prisma, tenantContext, hrScheduling);
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
    (hrScheduling.eligibility as jest.Mock).mockResolvedValue({
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

    const service = new OperationsStaffEligibilityService(prisma, tenantContext, hrScheduling);
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
    (prisma as any).appointment.findFirst.mockResolvedValue({
      id: 'appointment-1',
      staffId: '11111111-1111-4111-8111-111111111111',
      serviceId: '22222222-2222-4222-8222-222222222222',
      startAt: new Date('2026-09-16T09:00:00Z'),
      endAt: new Date('2026-09-16T10:00:00Z'),
    });
    (hrScheduling.eligibility as jest.Mock).mockResolvedValue({
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

    const service = new OperationsStaffEligibilityService(prisma, tenantContext, hrScheduling);
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
    (hrScheduling.eligibility as jest.Mock).mockResolvedValue({
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

    const service = new OperationsStaffEligibilityService(prisma, tenantContext, hrScheduling);
    await expect(
      service.assertWaitlistEntryEligible('entry-1', {
        staffId: '11111111-1111-4111-8111-111111111111',
        startAt: new Date('2026-09-16T09:00:00Z'),
        endAt: new Date('2026-09-16T10:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
