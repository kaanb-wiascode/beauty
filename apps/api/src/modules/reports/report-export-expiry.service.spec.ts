import { ReportExportExpiryService } from './report-export-expiry.service';

describe('ReportExportExpiryService', () => {
  function createService() {
    const expiry = {
      expireDue: jest.fn().mockResolvedValue([
        { id: 'export-1', storageKey: 'tenants/t/report-exports/1/a.csv' },
        { id: 'export-2', storageKey: null },
      ]),
    } as any;
    const storage = {
      delete: jest.fn().mockResolvedValue(undefined),
    } as any;

    return {
      expiry,
      storage,
      service: new ReportExportExpiryService(expiry, storage),
    };
  }

  it('expires due jobs and deletes only stored artifacts', async () => {
    const { service, expiry, storage } = createService();

    await expect(service.cleanup(25)).resolves.toEqual({
      expired: 2,
      deleted: 1,
    });
    expect(expiry.expireDue).toHaveBeenCalledWith(25);
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith(
      'tenants/t/report-exports/1/a.csv',
    );
  });

  it('bounds the cleanup batch to protect worker iterations', async () => {
    const { service, expiry } = createService();

    await service.cleanup(10_000);
    expect(expiry.expireDue).toHaveBeenCalledWith(500);

    await service.cleanup(0);
    expect(expiry.expireDue).toHaveBeenLastCalledWith(1);
  });

  it('continues cleanup when deleting one expired artifact fails', async () => {
    const { service, expiry, storage } = createService();
    expiry.expireDue.mockResolvedValueOnce([
      { id: 'export-1', storageKey: 'tenants/t/report-exports/1/a.csv' },
      { id: 'export-2', storageKey: 'tenants/t/report-exports/2/b.csv' },
    ]);
    storage.delete
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(service.cleanup()).resolves.toEqual({
      expired: 2,
      deleted: 1,
    });
    expect(storage.delete).toHaveBeenCalledTimes(2);
  });
});
