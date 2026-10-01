import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';
import { AttendanceHardeningService } from './attendance-hardening.service';

describe('AttendanceHardeningService', () => {
  const ctx = {
    getTenantId: jest.fn(() => 'tenant-1'),
    getCompanyId: jest.fn(() => 'company-1'),
  };
  const organizationScope = {
    getBranchScopedWhere: jest.fn(async () => ({ branchId: 'branch-1' })),
  };
  const queryRawUnsafe = jest.fn(
    async (..._args: unknown[]): Promise<unknown[]> => [],
  );
  const transaction = jest.fn(
    async (_callback: unknown): Promise<unknown> => undefined,
  );
  const prisma = { $queryRawUnsafe: queryRawUnsafe, $transaction: transaction };
  const approvalRuntime = {
    createWithinTransaction: jest.fn(async () => ({ id: 'approval-1' })),
  };
  let service: AttendanceHardeningService;

  const createTransactionDouble = () => ({
    $queryRawUnsafe: jest.fn(
      async (..._args: unknown[]): Promise<unknown[]> => [],
    ),
    $queryRaw: jest.fn(
      async (..._args: unknown[]): Promise<unknown[]> => [],
    ),
    $executeRawUnsafe: jest.fn(
      async (..._args: unknown[]): Promise<number> => 0,
    ),
  });

  const useTransaction = (tx: ReturnType<typeof createTransactionDouble>) => {
    transaction.mockImplementation(async (callback: unknown) => {
      if (typeof callback !== 'function') {
        throw new TypeError('Transaction callback is required.');
      }
      return callback(tx);
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      branchId: 'branch-1',
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceHardeningService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: ctx },
        { provide: OrganizationScopeService, useValue: organizationScope },
        { provide: ApprovalRuntimeService, useValue: approvalRuntime },
      ],
    }).compile();
    service = moduleRef.get(AttendanceHardeningService);
  });

  it('rejects invalid reconciliation ranges', async () => {
    await expect(
      service.reconcile('2026-09-20', '2026-09-10'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('opens an exception for a scheduled shift with a missing checkout', async () => {
    const tx = createTransactionDouble();
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          shiftId: 'shift-1',
          branchId: 'branch-1',
          workDate: '2026-09-15',
          staffId: 'staff-1',
          attendanceId: 'att-1',
          checkIn: '2026-09-15T09:15:00.000Z',
          checkOut: null,
          startsAt: '2026-09-15T09:00:00.000Z',
          endsAt: '2026-09-15T18:00:00.000Z',
          exceptionStatus: 'NONE',
        },
      ])
      .mockResolvedValueOnce([{ late: 15, early: 0 }]);
    tx.$executeRawUnsafe.mockResolvedValueOnce(1);
    useTransaction(tx);

    const result = await service.reconcile('2026-09-15', '2026-09-15');

    expect(result).toEqual({
      scheduledAssignments: 1,
      processedDays: 1,
      insertedAbsences: 0,
      updated: 1,
      ambiguousMultipleShiftDays: 0,
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('missing_punch=$4'),
      'shift-1',
      15,
      0,
      true,
      false,
      'OPEN',
      'att-1',
      'tenant-1',
    );
  });

  it('marks complete absence when a scheduled employee has no punches', async () => {
    const tx = createTransactionDouble();
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          shiftId: 'shift-2',
          branchId: 'branch-1',
          workDate: '2026-09-15',
          staffId: 'staff-2',
          attendanceId: 'att-2',
          checkIn: null,
          checkOut: null,
          startsAt: '2026-09-15T09:00:00.000Z',
          endsAt: '2026-09-15T18:00:00.000Z',
          exceptionStatus: 'NONE',
        },
      ])
      .mockResolvedValueOnce([{ late: 0, early: 0 }]);
    tx.$executeRawUnsafe.mockResolvedValueOnce(1);
    useTransaction(tx);

    await service.reconcile('2026-09-15', '2026-09-15');

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.any(String),
      'shift-2',
      0,
      0,
      true,
      true,
      'OPEN',
      'att-2',
      'tenant-1',
    );
  });

  it('requires a correction reason', async () => {
    await expect(
      service.correct('att-1', {}, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates the correction and approval in the same transaction', async () => {
    const tx = createTransactionDouble();
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'att-1',
          branch_id: 'branch-1',
          staff_id: 'staff-1',
          work_date: '2026-09-15',
          check_in: '09:00',
          check_out: null,
          status: 'PRESENT',
          note: null,
          scheduled_shift_id: null,
          late_minutes: 0,
          early_departure_minutes: 0,
          missing_punch: true,
          absence: false,
        },
      ])
      .mockResolvedValueOnce([]);
    tx.$queryRaw
      .mockResolvedValueOnce([{ locked: 1 }])
      .mockResolvedValueOnce([{ id: 'workflow-1' }]);
    tx.$executeRawUnsafe.mockResolvedValue(1);
    useTransaction(tx);

    const result = await service.correct(
      'att-1',
      { reason: 'Forgot checkout', checkOut: '18:00' },
      'user-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        attendanceRecordId: 'att-1',
        approvalRequestId: 'approval-1',
        approvalRequired: true,
      }),
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(String(tx.$executeRawUnsafe.mock.calls[0][0])).toContain(
      'hr_attendance_corrections',
    );
    expect(tx.$executeRawUnsafe.mock.calls[0][10]).toBe('user-1');
    expect(approvalRuntime.createWithinTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowKey: 'hr.attendance-correction',
        entityType: 'hr_attendance_correction',
      }),
      tx,
    );
  });

  it('does not correct attendance outside scope', async () => {
    const tx = createTransactionDouble();
    tx.$queryRawUnsafe.mockResolvedValue([]);
    useTransaction(tx);

    await expect(
      service.correct('missing', { reason: 'test' }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
