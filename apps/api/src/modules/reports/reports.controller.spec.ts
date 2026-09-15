import { REQUIRED_PERMISSION_KEY } from '../../common/auth/permissions.decorator';
import { ReportsController } from './reports.controller';

describe('ReportsController authorization metadata', () => {
  it('requires reports.read for export artifact downloads', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        ReportsController.prototype.downloadExport,
      ),
    ).toEqual({ resource: 'reports', action: 'read' });
  });
});
