import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { ObjectStorageService } from '../../common/storage/object-storage.service';

const EXTENSIONS = ['csv', 'xlsx', 'pdf'] as const;
type ExportExtension = (typeof EXTENSIONS)[number];
type StorageDriver = 'filesystem' | 'object';

const CONTENT_TYPES: Record<ExportExtension, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

@Injectable()
export class ReportExportStorageService {
  private readonly root: string;

  constructor(
    private readonly config: ConfigService,
    private readonly objectStorage: ObjectStorageService,
  ) {
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

    if (this.driver() === 'object') {
      const signed = await this.objectStorage.presignPut(
        key,
        CONTENT_TYPES[input.extension],
      );
      const response = await fetch(signed.url, {
        method: 'PUT',
        headers: signed.requiredHeaders,
        body: input.content,
      });
      if (!response.ok) {
        throw new Error(`Report export object upload failed (${response.status})`);
      }
      return key;
    }

    const filePath = this.resolveKey(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.content);
    return key;
  }

  async read(key: string) {
    this.validateKey(key);

    if (this.driver() === 'object') {
      const signed = await this.objectStorage.presignGet(key);
      const response = await fetch(signed.url);
      if (!response.ok) {
        throw new Error(`Report export object download failed (${response.status})`);
      }
      return Buffer.from(await response.arrayBuffer());
    }

    return readFile(this.resolveKey(key));
  }

  async delete(key: string) {
    this.validateKey(key);

    if (this.driver() === 'object') {
      await this.objectStorage.remove(key);
      return;
    }

    await rm(this.resolveKey(key), { force: true });
  }

  private driver(): StorageDriver {
    return this.config.get<string>('REPORT_EXPORT_STORAGE_DRIVER') === 'object'
      ? 'object'
      : 'filesystem';
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

  private validateKey(key: string) {
    if (!key || key.includes('\\') || key.startsWith('/') || key.includes('..')) {
      throw new Error('Invalid export storage key');
    }
  }

  private resolveKey(key: string) {
    this.validateKey(key);
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
