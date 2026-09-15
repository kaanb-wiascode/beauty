import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ReportExportStorageService } from './report-export-storage.service';

describe('ReportExportStorageService', () => {
  let root: string;
  let storage: ReportExportStorageService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'beauty-report-export-'));
    storage = new ReportExportStorageService({
      get: jest.fn((key: string) =>
        key === 'REPORT_EXPORT_STORAGE_DIR' ? root : undefined,
      ),
    } as any);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes and reads content under a server-generated key', async () => {
    const key = await storage.write({
      tenantId: 'tenant-1',
      jobId: 'job-1',
      extension: 'csv',
      content: '\uFEFFname\r\nÇağla\r\n',
    });

    expect(key).toMatch(
      /^tenants\/tenant-1\/report-exports\/job-1\/[a-f0-9-]+\.csv$/,
    );
    await expect(storage.read(key)).resolves.toEqual(
      Buffer.from('\uFEFFname\r\nÇağla\r\n'),
    );
  });

  it('rejects path traversal keys on read and delete', async () => {
    await expect(storage.read('../outside.csv')).rejects.toThrow(
      'Invalid export storage key',
    );
    await expect(storage.delete('tenants/tenant-1/../../outside.csv')).rejects.toThrow(
      'Invalid export storage key',
    );
  });

  it('hashes unexpected identifiers instead of using them as path segments', async () => {
    const key = await storage.write({
      tenantId: '../tenant',
      jobId: 'job/unsafe',
      extension: 'csv',
      content: 'ok',
    });

    expect(key).not.toContain('../tenant');
    expect(key).not.toContain('job/unsafe');
    await expect(storage.read(key)).resolves.toEqual(Buffer.from('ok'));
  });
});
