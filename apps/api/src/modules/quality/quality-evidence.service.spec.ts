import { BadRequestException } from '@nestjs/common';
import { QualityEvidenceService } from './quality-evidence.service';

describe('QualityEvidenceService', () => {
  const tenant = {
    getContext: () => ({ tenantId: 't1', companyId: 'c1', branchId: 'b1' }),
  };

  const storage = {
    maxBytes: jest.fn(() => 25_000_000),
    presignPut: jest.fn(async () => ({
      url: 'https://storage.test/upload',
      expiresAt: new Date('2026-09-12T04:00:00.000Z'),
      requiredHeaders: { 'content-type': 'image/jpeg' },
    })),
    presignGet: jest.fn(async () => ({
      url: 'https://storage.test/download',
      expiresAt: new Date('2026-09-12T04:00:00.000Z'),
    })),
    head: jest.fn(async () => ({
      byteSize: 128,
      mimeType: 'image/jpeg',
      etag: 'etag',
      lastModified: new Date(),
    })),
    remove: jest.fn(async () => undefined),
  };

  beforeEach(() => jest.clearAllMocks());

  it('registers scoped evidence with an opaque storage key', async () => {
    let call = 0;
    const prisma = {
      $queryRawUnsafe: jest.fn(async () =>
        call++ === 0
          ? [{ id: 'inspection-1', branchId: 'b1' }]
          : [
              {
                id: 'evidence-1',
                kind: 'PHOTO',
                objectKey: 'quality/t1/b1/photo-1.jpg',
              },
            ],
      ),
    };
    const service = new QualityEvidenceService(
      prisma as any,
      tenant as any,
      storage as any,
    );

    await expect(
      service.add(
        {
          subjectType: 'INSPECTION',
          subjectId: 'inspection-1',
          kind: 'PHOTO',
          objectKey: 'quality/t1/b1/photo-1.jpg',
          sha256: 'a'.repeat(64),
        },
        'user-1',
      ),
    ).resolves.toMatchObject({ id: 'evidence-1', duplicate: false });

    expect(prisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO quality_evidence'),
      't1',
      'c1',
      'b1',
      'inspection-1',
      null,
      null,
      null,
      null,
      'PHOTO',
      'quality/t1/b1/photo-1.jpg',
      null,
      null,
      null,
      'a'.repeat(64),
      null,
      null,
      'user-1',
    );
  });

  it('rejects public URLs as object keys', async () => {
    const prisma = { $queryRawUnsafe: jest.fn() };
    const service = new QualityEvidenceService(
      prisma as any,
      tenant as any,
      storage as any,
    );

    await expect(
      service.add(
        {
          subjectType: 'FINDING',
          subjectId: 'finding-1',
          kind: 'DOCUMENT',
          objectKey: 'https://example.com/private.pdf',
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prepares a private upload key inside the evidence subject scope', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(async () => [
        { id: 'finding-1', branchId: 'b1' },
      ]),
    };
    const service = new QualityEvidenceService(
      prisma as any,
      tenant as any,
      storage as any,
    );

    const result = await service.prepareUpload({
      subjectType: 'FINDING',
      subjectId: 'finding-1',
      kind: 'PHOTO',
      originalFilename: 'proof.jpg',
      mimeType: 'image/jpeg',
      byteSize: 128,
    });

    expect(result.objectKey).toMatch(
      /^private\/quality-evidence\/t1\/c1\/b1\/FINDING\/finding-1\//,
    );
    expect(result.uploadUrl).toBe('https://storage.test/upload');
    expect(storage.presignPut).toHaveBeenCalledWith(
      result.objectKey,
      'image/jpeg',
    );
  });

  it('refuses finalize when object key is outside the scoped subject prefix', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(async () => [
        { id: 'finding-1', branchId: 'b1' },
      ]),
    };
    const service = new QualityEvidenceService(
      prisma as any,
      tenant as any,
      storage as any,
    );

    await expect(
      service.finalizeUpload(
        {
          subjectType: 'FINDING',
          subjectId: 'finding-1',
          kind: 'PHOTO',
          objectKey:
            'private/quality-evidence/t1/c1/b1/CAPA/capa-1/foreign-object',
        },
        'user-1',
      ),
    ).rejects.toThrow('objectKey is outside the managed evidence scope.');
    expect(storage.head).not.toHaveBeenCalled();
  });

  it('uses verified storage metadata when finalizing a managed upload', async () => {
    let call = 0;
    const prisma = {
      $queryRawUnsafe: jest.fn(async () => {
        call += 1;
        if (call === 1 || call === 2) {
          return [{ id: 'finding-1', branchId: 'b1' }];
        }
        return [
          {
            id: 'evidence-1',
            kind: 'PHOTO',
            objectKey:
              'private/quality-evidence/t1/c1/b1/FINDING/finding-1/object-1',
            byteSize: 128,
            mimeType: 'image/jpeg',
          },
        ];
      }),
    };
    const service = new QualityEvidenceService(
      prisma as any,
      tenant as any,
      storage as any,
    );

    await expect(
      service.finalizeUpload(
        {
          subjectType: 'FINDING',
          subjectId: 'finding-1',
          kind: 'PHOTO',
          objectKey:
            'private/quality-evidence/t1/c1/b1/FINDING/finding-1/object-1',
          originalFilename: 'proof.jpg',
        },
        'user-1',
      ),
    ).resolves.toMatchObject({ id: 'evidence-1', duplicate: false });

    expect(storage.head).toHaveBeenCalledWith(
      'private/quality-evidence/t1/c1/b1/FINDING/finding-1/object-1',
    );
    expect(prisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO quality_evidence'),
      't1',
      'c1',
      'b1',
      null,
      null,
      'finding-1',
      null,
      null,
      'PHOTO',
      'private/quality-evidence/t1/c1/b1/FINDING/finding-1/object-1',
      'proof.jpg',
      'image/jpeg',
      128,
      null,
      null,
      null,
      'user-1',
    );
  });

  it('creates a short-lived download URL only for scoped evidence', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(async () => [
        {
          id: 'evidence-1',
          objectKey:
            'private/quality-evidence/t1/c1/b1/FINDING/finding-1/object-1',
          originalFilename: 'proof.jpg',
          mimeType: 'image/jpeg',
        },
      ]),
    };
    const service = new QualityEvidenceService(
      prisma as any,
      tenant as any,
      storage as any,
    );

    await expect(service.download('evidence-1')).resolves.toMatchObject({
      evidenceId: 'evidence-1',
      downloadUrl: 'https://storage.test/download',
      originalFilename: 'proof.jpg',
    });
    expect(storage.presignGet).toHaveBeenCalledWith(
      'private/quality-evidence/t1/c1/b1/FINDING/finding-1/object-1',
      'proof.jpg',
    );
  });
});
