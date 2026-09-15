import { reportExportListSchema } from './report-export-list.dto';

describe('reportExportListSchema', () => {
  it('parses controlled history filters and pagination', () => {
    expect(
      reportExportListSchema.parse({
        status: 'READY',
        reportKey: 'staff.performance',
        format: 'CSV',
        mine: 'true',
        page: '2',
        limit: '10',
      }),
    ).toEqual({
      status: 'READY',
      reportKey: 'staff.performance',
      format: 'CSV',
      mine: true,
      page: 2,
      limit: 10,
    });
  });

  it('applies safe defaults', () => {
    expect(reportExportListSchema.parse({})).toEqual({
      mine: false,
      page: 1,
      limit: 25,
    });
  });

  it('rejects arbitrary requester and scope filters', () => {
    expect(() =>
      reportExportListSchema.parse({
        requestedBy: 'another-user',
        tenantId: 'another-tenant',
      }),
    ).toThrow();
  });

  it('rejects unsupported report, format and oversized pages', () => {
    expect(() =>
      reportExportListSchema.parse({ reportKey: 'arbitrary.report' }),
    ).toThrow();
    expect(() => reportExportListSchema.parse({ format: 'JSON' })).toThrow();
    expect(() => reportExportListSchema.parse({ limit: '101' })).toThrow();
  });
});
