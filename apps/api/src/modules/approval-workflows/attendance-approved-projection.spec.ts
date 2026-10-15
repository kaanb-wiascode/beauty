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
    query.mockResolvedValueOnce([{ staffId: 'staff-1', branchId: 'branch-1', workDate: '2026-10-15' }])
      .mockResolvedValueOnce([{ eventType: 'BREAK_START', occurredAt: new Date('2026-10-15T08:00:00Z') }]);
    await (service as any).applyApprovedAttendanceEvent('event-1', 'tenant-1', 'company-1', tx);
    expect(execute).not.toHaveBeenCalled();
  });

  it('projects only approved events and preserves corrected attendance rows', async () => {
    query.mockResolvedValueOnce([{ staffId: 'staff-1', branchId: 'branch-1', workDate: '2026-10-15' }])
      .mockResolvedValueOnce([
        { eventType: 'DAY_START', occurredAt: new Date('2026-10-15T07:00:00Z') },
        { eventType: 'BREAK_START', occurredAt: new Date('2026-10-15T09:00:00Z') },
        { eventType: 'BREAK_END', occurredAt: new Date('2026-10-15T09:30:00Z') },
        { eventType: 'DAY_END', occurredAt: new Date('2026-10-15T15:00:00Z') },
      ]);
    await (service as any).applyApprovedAttendanceEvent('event-1', 'tenant-1', 'company-1', tx);
    expect(execute).toHaveBeenCalledTimes(1);
    const statement = execute.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    const sql = statement.strings.join(' ');
    expect(sql).toContain("r.status='APPROVED'") ;
    expect(sql).toContain("exception_status,'')<>'CORRECTED'");
    expect(statement.values).toContain(30);
    expect(statement.values).toContain(450);
  });
});
