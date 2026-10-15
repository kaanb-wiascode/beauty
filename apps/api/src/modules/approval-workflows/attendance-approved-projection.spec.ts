import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { ApprovalRuntimeService } from './approval-runtime.service';

describe('Approved attendance event projection', () => {
  const service = new ApprovalRuntimeService(
    {} as PrismaService, {} as TenantContext, {} as PlatformAuditService,
  );
  const query = jest.fn();
  const execute = jest.fn();
  const tx = { $queryRaw: query, $executeRaw: execute };
  beforeEach(() => { query.mockReset(); execute.mockReset(); execute.mockResolvedValue(1); });

  it('rejects unknown attendance source records before writing payroll attendance', async () => {
    query.mockResolvedValueOnce([]);
    await expect((service as any).applyApprovedAttendanceEvent('event-1', 'tenant-1', 'company-1', tx))
      .rejects.toThrow(NotFoundException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not project a day without an approved check-in', async () => {
    query.mockResolvedValueOnce([{ staffId: 'staff-1', branchId: 'branch-1', workDate: '2026-10-15', shiftStart: new Date('2026-10-15T07:00:00Z') }])
      .mockResolvedValueOnce([{ eventType: 'BREAK_START', occurredAt: new Date('2026-10-15T08:00:00Z') }]);
    await (service as any).applyApprovedAttendanceEvent('event-1', 'tenant-1', 'company-1', tx);
    expect(execute).not.toHaveBeenCalled();
  });

  it('projects only approved events and preserves corrected attendance rows', async () => {
    query.mockResolvedValueOnce([{ staffId: 'staff-1', branchId: 'branch-1', workDate: '2026-10-15', shiftStart: new Date('2026-10-15T07:00:00Z') }])
      .mockResolvedValueOnce([
        { eventType: 'DAY_START', occurredAt: new Date('2026-10-15T07:00:00Z') },
        { eventType: 'BREAK_START', occurredAt: new Date('2026-10-15T09:00:00Z') },
        { eventType: 'BREAK_END', occurredAt: new Date('2026-10-15T09:30:00Z') },
        { eventType: 'DAY_END', occurredAt: new Date('2026-10-15T15:00:00Z') },
      ]);
    await (service as any).applyApprovedAttendanceEvent('event-1', 'tenant-1', 'company-1', tx);
    expect(execute).toHaveBeenCalledTimes(1);
    const statement = execute.mock.calls[0][0] as readonly string[];
    const sql = statement.join(' ');
    const sourceQuery = (query.mock.calls[1][0] as readonly string[]).join(' ');
    expect(sourceQuery).toContain("r.status='APPROVED'");
    expect(sourceQuery).toContain('e.branch_id=');
    const sourceDateQuery = (query.mock.calls[0][0] as readonly string[]).join(' ');
    expect(sourceDateQuery).toContain("AT TIME ZONE 'Europe/Istanbul'");
    expect(sourceQuery).toContain("e.occurred_at>=");
    expect(sourceDateQuery).toContain("started.event_type='DAY_START'");
    expect(sourceDateQuery).toContain('started.branch_id=e.branch_id');
    expect(sourceDateQuery).not.toContain("AT TIME ZONE 'UTC'");
    expect(sourceQuery).not.toContain("AT TIME ZONE 'UTC'");
    expect(sql).toContain("exception_status,'')<>'CORRECTED'");
    expect(execute.mock.calls[0].slice(1)).toContain(30);
    expect(execute.mock.calls[0].slice(1)).toContain(450);
  });
  it('ignores an unmatched break end and never subtracts a negative break duration', async () => {
    query.mockResolvedValueOnce([{ staffId: 'staff-1', branchId: 'branch-1', workDate: '2026-10-15', shiftStart: new Date('2026-10-15T07:00:00Z') }])
      .mockResolvedValueOnce([
        { eventType: 'DAY_START', occurredAt: new Date('2026-10-15T07:00:00Z') },
        { eventType: 'BREAK_END', occurredAt: new Date('2026-10-15T08:00:00Z') },
        { eventType: 'BREAK_START', occurredAt: new Date('2026-10-15T09:30:00Z') },
        { eventType: 'BREAK_END', occurredAt: new Date('2026-10-15T09:00:00Z') },
        { eventType: 'DAY_END', occurredAt: new Date('2026-10-15T15:00:00Z') },
      ]);
    await (service as any).applyApprovedAttendanceEvent('event-1', 'tenant-1', 'company-1', tx);
    const statement = execute.mock.calls[0][0] as { values: unknown[] };
    expect(execute.mock.calls[0].slice(1)).toContain(0);
    expect(execute.mock.calls[0].slice(1)).toContain(480);
  });

  it('queries across local midnight using approved shift start rather than the event calendar day', async () => {
    query.mockResolvedValueOnce([{ staffId: 'staff-1', branchId: 'branch-1', workDate: '2026-10-15', shiftStart: new Date('2026-10-15T19:00:00Z') }])
      .mockResolvedValueOnce([
        { eventType: 'DAY_START', occurredAt: new Date('2026-10-15T19:00:00Z') },
        { eventType: 'DAY_END', occurredAt: new Date('2026-10-16T03:00:00Z') },
      ]);
    await (service as any).applyApprovedAttendanceEvent('event-overnight', 'tenant-1', 'company-1', tx);
    const sql = (query.mock.calls[1][0] as readonly string[]).join(' ');
    expect(sql).toContain("e.occurred_at>=");
    expect(sql).toContain("INTERVAL '24 hours'");
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain("later_start.event_type='DAY_START'");
    expect(sql).toContain("later_approval.status='APPROVED'");
    expect(sql).toContain('later_start.occurred_at<=');
    expect(execute.mock.calls[0].slice(1)).toContain(480);
  });

});
