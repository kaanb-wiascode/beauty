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
    const service = new TrainingContentStorageService(
      prisma as any,
      tenant as any,
      storage as any,
    );

    const result = await service.prepareDocumentUpload('v1', {
      filename: 'protocol.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
    });

    expect(result.objectKey).toMatch(
      /^private\/training-content\/t1\/c1\/course-1\/v3\//,
    );
    expect(storage.presignPut).toHaveBeenCalledWith(
      result.objectKey,
      'application/pdf',
    );
  });

  it('rejects document refs outside the course version prefix', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(async () => [
        { id: 'v1', courseId: 'course-1', version: 3 },
      ]),
    };
    const service = new TrainingContentStorageService(
      prisma as any,
      tenant as any,
      storage as any,
    );

    await expect(
      service.verifyDocument(
        'v1',
        'private/training-content/t1/c1/other-course/v1/document',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.head).not.toHaveBeenCalled();
  });

  it('verifies stored content before it is linked to a lesson', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(async () => [
        { id: 'v1', courseId: 'course-1', version: 3 },
      ]),
    };
    const service = new TrainingContentStorageService(
      prisma as any,
      tenant as any,
      storage as any,
    );

    await expect(
      service.verifyDocument(
        'v1',
        'private/training-content/t1/c1/course-1/v3/document-1',
      ),
    ).resolves.toMatchObject({
      verified: true,
      byteSize: 1024,
      mimeType: 'application/pdf',
    });
  });

  it('scopes lesson document downloads through the lesson record', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(async () => [
        {
          id: 'lesson-1',
          title: 'Sterilizasyon Protokolü',
          contentRef:
            'private/training-content/t1/c1/course-1/v3/document-1',
          courseId: 'course-1',
          version: 3,
        },
      ]),
    };
    const service = new TrainingContentStorageService(
      prisma as any,
      tenant as any,
      storage as any,
    );

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
