import { BadRequestException } from '@nestjs/common';
import { TrainingContentStorageService } from './training-content-storage.service';

describe('TrainingContentStorageService', () => {
  const tenant = {
    getTenantId: () => 't1',
    getCompanyId: () => 'c1',
  };
  const storage = {
    maxBytes: jest.fn(() => 25_000_000),
    presignPut: jest.fn(async () => ({
      url: 'https://storage.test/upload',
      expiresAt: new Date('2026-09-12T04:00:00.000Z'),
      requiredHeaders: { 'content-type': 'application/pdf' },
    })),
    presignGet: jest.fn(async () => ({
      url: 'https://storage.test/download',
      expiresAt: new Date('2026-09-12T04:00:00.000Z'),
    })),
    head: jest.fn(async () => ({
      byteSize: 1024,
      mimeType: 'application/pdf',
      etag: 'etag',
      lastModified: new Date(),
    })),
    remove: jest.fn(async () => undefined),
  };

  beforeEach(() => jest.clearAllMocks());

  it('prepares document uploads only for draft course versions', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(async () => [
        { id: 'v1', courseId: 'course-1', version: 3 },
      ]),
    };
    const service = new TrainingContentStorageService(prisma as any, tenant as any, storage as any);

    const result = await service.prepareDocumentUpload('v1', {
      filename: 'protocol.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
    });

    expect(result.objectKey).toMatch(/^private\/training-content\/t1\/c1\/course-1\/v3\//);
    expect(storage.presignPut).toHaveBeenCalledWith(result.objectKey, 'application/pdf');
  });

  it('rejects document refs outside the course version prefix', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(async () => [{ id: 'v1', courseId: 'course-1', version: 3 }]),
    };
    const service = new TrainingContentStorageService(prisma as any, tenant as any, storage as any);

    await expect(
      service.verifyDocument('v1', 'private/training-content/t1/c1/other-course/v1/document'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.head).not.toHaveBeenCalled();
  });

  it('registers verified storage metadata for the exact course version', async () => {
    const prisma = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'v1', courseId: 'course-1', version: 3 }])
        .mockResolvedValueOnce([
          {
            id: 'doc-1',
            objectKey: 'private/training-content/t1/c1/course-1/v3/document-1',
            mimeType: 'application/pdf',
            byteSize: 1024,
            etag: 'etag',
            verifiedAt: new Date(),
            courseVersionId: 'v1',
          },
        ]),
    };
    const service = new TrainingContentStorageService(prisma as any, tenant as any, storage as any);

    await expect(
      service.verifyDocument('v1', 'private/training-content/t1/c1/course-1/v3/document-1'),
    ).resolves.toMatchObject({
      id: 'doc-1',
      verified: true,
      byteSize: 1024,
      mimeType: 'application/pdf',
      courseVersionId: 'v1',
    });

    expect(prisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO training_managed_documents'),
      't1',
      'c1',
      'v1',
      'private/training-content/t1/c1/course-1/v3/document-1',
      'application/pdf',
      1024,
      'etag',
    );
  });

  it('rejects an object key already registered to a different version', async () => {
    const prisma = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'v1', courseId: 'course-1', version: 3 }])
        .mockResolvedValueOnce([]),
    };
    const service = new TrainingContentStorageService(prisma as any, tenant as any, storage as any);

    await expect(
      service.verifyDocument('v1', 'private/training-content/t1/c1/course-1/v3/document-1'),
    ).rejects.toThrow('Managed document is already bound to a different course version.');
  });

  it('downloads only lessons backed by the verified managed-document registry', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(async (sql: string) => {
        expect(sql).toContain('JOIN training_managed_documents d');
        expect(sql).toContain('d.course_version_id=l.course_version_id');
        return [
          {
            id: 'lesson-1',
            title: 'Sterilizasyon Protokolü',
            contentRef: 'private/training-content/t1/c1/course-1/v3/document-1',
            courseId: 'course-1',
            version: 3,
          },
        ];
      }),
    };
    const service = new TrainingContentStorageService(prisma as any, tenant as any, storage as any);

    await expect(service.downloadLessonDocument('lesson-1')).resolves.toMatchObject({
      lessonId: 'lesson-1',
      downloadUrl: 'https://storage.test/download',
    });
    expect(storage.presignGet).toHaveBeenCalledWith(
      'private/training-content/t1/c1/course-1/v3/document-1',
      'Sterilizasyon Protokolü',
    );
  });
});
