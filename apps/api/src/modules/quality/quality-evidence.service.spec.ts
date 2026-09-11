import { BadRequestException } from '@nestjs/common';
import { QualityEvidenceService } from './quality-evidence.service';

describe('QualityEvidenceService', () => {
  const tenant = {
    getContext: () => ({ tenantId: 't1', companyId: 'c1', branchId: 'b1' }),
  };

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
    const service = new QualityEvidenceService(prisma as any, tenant as any);

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
    const service = new QualityEvidenceService(prisma as any, tenant as any);

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
});
