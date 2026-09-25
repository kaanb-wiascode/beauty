import { HrReportingService } from './hr-reporting.service';

describe('HrReportingService', () => {
  const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchIds: ['branch-1'] };

  function service(queryRaw: jest.Mock) {
    return new HrReportingService(
      { $queryRawUnsafe: queryRaw } as never,
      { getCompanyId: () => scope.companyId } as never,
      { getBranchScopedWhere: async () => ({ tenantId: scope.tenantId, branchId: { in: scope.branchIds } }) } as never,
    );
  }

  it('scopes workforce rows and normalizes absence metrics', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{
      date: new Date('2026-09-15T00:00:00.000Z'), attendanceRecords: 10, presentRecords: 9,
      absentRecords: 1, workedMinutes: 4320, overtimeMinutes: 120, leaveRequests: 2,
      approvedLeaveRequests: 1, approvedLeaveDays: '1.5',
    }]);
    const result = await service(queryRaw).workforce({ from: new Date('2026-09-15'), to: new Date('2026-09-15T23:59:59.999Z') });
    expect(queryRaw).toHaveBeenCalledWith(expect.any(String), 'tenant-1', 'company-1', ['branch-1'], expect.any(Date), expect.any(Date));
    expect(result[0]).toMatchObject({ absenceRate: 10, workedMinutes: 4320, approvedLeaveDays: 1.5 });
  });

  it('keeps payroll aggregate scoped and computes salary and liability settlement safely', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{
      periodDate: new Date('2026-09-01T00:00:00.000Z'), status: 'POSTED', employeeCount: 8,
      gross: '800000', net: '600000', employerCost: '980000', salaryPaid: '450000',
      taxLiability: '90000', taxPaid: '60000', socialLiability: '120000', socialPaid: '100000',
      otherLiability: '30000', otherPaid: '10000',
    }]);
    const result = await service(queryRaw).payroll({ from: new Date('2026-09-01'), to: new Date('2026-09-30') });
    const sql = queryRaw.mock.calls[0][0] as string;

    expect(sql).toContain('sp.tenant_id=$1::text');
    expect(sql).toContain('sp.company_id=$2::text');
    expect(sql).toContain('plp.tenant_id=$1::text');
    expect(sql).toContain('plp.company_id=$2::text');
    expect(sql).toContain("plp.type='OTHER'");
    expect(sql).toContain('SUM(pi.other_deductions)');
    expect(result[0]).toMatchObject({
      employeeCount: 8,
      net: 600000,
      salaryPaid: 450000,
      salaryRemaining: 150000,
      taxLiability: 90000,
      taxPaid: 60000,
      taxRemaining: 30000,
      socialLiability: 120000,
      socialPaid: 100000,
      socialRemaining: 20000,
      otherLiability: 30000,
      otherPaid: 10000,
      otherRemaining: 20000,
      payrollSettlementRate: 75,
    });
    expect(result[0]).not.toHaveProperty('staffId');
    expect(result[0]).not.toHaveProperty('employeeName');
  });
});
