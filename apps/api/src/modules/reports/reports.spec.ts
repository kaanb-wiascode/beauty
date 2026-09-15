import { REQUIRED_PERMISSION_KEY } from '../../common/auth/permissions.decorator';
import { reportDefinitions, reportKeys } from './report-definition';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('reporting foundation', () => {
  it('keeps report definitions server-owned and stable', () => {
    const service = new ReportsService();
    const catalog = service.getCatalog();

    expect(catalog).toBe(reportDefinitions);
    expect(catalog.map((report) => report.key)).toEqual([
      reportKeys.staffPerformance,
      reportKeys.servicePerformance,
      reportKeys.paymentSummary,
    ]);
  });

  it('requires reports.read for the catalog endpoint', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        ReportsController.prototype.getCatalog,
      ),
    ).toEqual({ resource: 'reports', action: 'read' });
  });
});
