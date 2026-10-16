import { ReportExportPolicyService, ReportExportRowLimitError } from './report-export-policy.service';
import { ReportExportProcessorService } from './report-export-processor.service';

const job = {
  id: 'export-oversized',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  roleScope: 'BRANCH',
  membershipId: 'membership-1',
  roleId: 'role-1',
  requestedBy: 'user-1',
  reportKey: 'staff.performance',
  format: 'CSV',
  status: 'PROCESSING',
  filters: {
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-30T23:59:59.999Z',
  },
  columns: ['name'],
  sort: null,
  includeSummary: true,
  includeCharts: false,
} as any;

describe('report export row-limit enforcement', () => {
  it('fails before generator or storage side effects when materialization is oversized', async () => {
    const jobs = {
      claimNextQueued: jest.fn().mockResolvedValue(job),
      markFailed: jest.fn().mockResolvedValue({ ...job, status: 'FAILED' }),
    } as any;
    const authorization = {
      validate: jest.fn().mockResolvedValue({
        sub: 'user-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: 'branch-1',
        membershipId: 'membership-1',
        roleId: 'role-1',
        roleScope: 'BRANCH',
      }),
    } as any;
    const workerContext = {
      materialize: jest.fn().mockResolvedValue({
        columns: ['name'],
        rows: Array.from({ length: 50_001 }, (_, index) => ({ name: `row-${index}` })),
        summary: null,
      }),
    } as any;
    const csv = { generate: jest.fn() } as any;
    const xlsx = { generate: jest.fn() } as any;
    const pdf = { generate: jest.fn() } as any;
    const storage = { write: jest.fn(), delete: jest.fn() } as any;
    const config = { get: jest.fn().mockReturnValue('7') } as any;
    const policy = {
      assertRowLimit: jest.fn((count: number) => {
        if (count > 50_000) throw new ReportExportRowLimitError(50_000, count);
      }),
    } as unknown as ReportExportPolicyService;

    const processor = new ReportExportProcessorService(
      jobs,
      authorization,
      workerContext,
      csv,
      xlsx,
      pdf,
      storage,
      config,
      policy,
    );

    await processor.processNext();

    expect(policy.assertRowLimit).toHaveBeenCalledWith(50_001);
    expect(csv.generate).not.toHaveBeenCalled();
    expect(xlsx.generate).not.toHaveBeenCalled();
    expect(pdf.generate).not.toHaveBeenCalled();
    expect(storage.write).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith('export-oversized', {
      errorCode: 'ROW_LIMIT_EXCEEDED',
      errorSummary: 'Export exceeds the configured row limit of 50000.',
    });
  });
});
