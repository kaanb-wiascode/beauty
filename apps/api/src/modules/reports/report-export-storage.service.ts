import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

const EXTENSIONS = ['csv', 'xlsx', 'pdf'] as const;
type ExportExtension = (typeof EXTENSIONS)[number];

@Injectable()
export class ReportExportStorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(
      config.get<string>('REPORT_EXPORT_STORAGE_DIR') ??
        resolve(process.cwd(), '.report-exports'),
    );
  }

  async write(input: {
    tenantId: string;
    jobId: string;
    extension: ExportExtension;
    content: string | Buffer;
  }) {
    const key = this.buildKey(input);
    const filePath = this.resolveKey(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.content);
    return key;
  }

  read(key: string) {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string) {
    await rm(this.resolveKey(key), { force: true });
  }

  private buildKey(input: {
    tenantId: string;
    jobId: string;
    extension: ExportExtension;
  }) {
    if (!EXTENSIONS.includes(input.extension)) {
      throw new Error('Unsupported export storage extension');
    }

    return [
      'tenants',
      this.safeSegment(input.tenantId),
      'report-exports',
      this.safeSegment(input.jobId),
      `${randomUUID()}.${input.extension}`,
    ].join('/');
  }

  private resolveKey(key: string) {
    if (!key || key.includes('\\') || key.startsWith('/') || key.includes('..')) {
      throw new Error('Invalid export storage key');
    }

    const filePath = resolve(this.root, key);
    const rootPrefix = `${this.root}${sep}`;
    if (filePath !== this.root && !filePath.startsWith(rootPrefix)) {
      throw new Error('Export storage key escapes storage root');
    }

    return filePath;
  }

  private safeSegment(value: string) {
    if (/^[a-zA-Z0-9_-]+$/.test(value)) return value;
    return createHash('sha256').update(value).digest('hex');
  }
}
