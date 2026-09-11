import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { SupplierVerificationService } from './supplier-verification.service';

describe('SupplierVerificationService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaService;

  const service = new SupplierVerificationService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reuses an existing open verification case idempotently', async () => {
    const existing = {
      id: 'case-1',
      supplierOrganizationId: 'supplier-org-1',
      status: 'SUBMITTED',
    };

    queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'supplier-org-1' }])
      .mockResolvedValueOnce([existing]);

    await expect(
      service.openCase('supplier-org-1', 'platform-admin-1'),
    ).resolves.toEqual(existing);

    expect(queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('opens a case, marks supplier pending and appends audit atomically', async () => {
    const opened = {
      id: 'case-1',
      supplierOrganizationId: 'supplier-org-1',
      status: 'DRAFT',
    };

    queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'supplier-org-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([opened]);

    await expect(
      service.openCase('supplier-org-1', 'platform-admin-1'),
    ).resolves.toEqual(opened);

    const sql = String(queryRawUnsafe.mock.calls[2]?.[0] ?? '');
    expect(sql).toContain('INSERT INTO supplier_verification_cases');
    expect(sql).toContain("verification_status='PENDING'");
    expect(sql).toContain('INSERT INTO supplier_verification_audit_logs');
  });

  it('rejects document registration outside the requested organization scope', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(
      service.registerDocument(
        'supplier-org-1',
        'case-1',
        {
          documentType: 'CERTIFICATE',
          storageKey: 'supplier/case-1/cert.pdf',
          fileName: 'cert.pdf',
          mimeType: 'application/pdf',
        },
        'platform-admin-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id=$1 AND supplier_organization_id=$2'),
      'case-1',
      'supplier-org-1',
    );
  });

  it('rejects submitting a non-draft case', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(
      service.submitCase('supplier-org-1', 'case-1', 'platform-admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('decides a submitted case and updates organization verification atomically', async () => {
    const decided = {
      id: 'case-1',
      status: 'APPROVED',
      fromStatus: 'SUBMITTED',
    };

    queryRawUnsafe.mockResolvedValueOnce([decided]);

    await expect(
      service.decideCase(
        'supplier-org-1',
        'case-1',
        'APPROVED',
        undefined,
        'platform-admin-1',
      ),
    ).resolves.toEqual(decided);

    const sql = String(queryRawUnsafe.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('UPDATE supplier_verification_cases');
    expect(sql).toContain('UPDATE supplier_organizations');
    expect(sql).toContain('INSERT INTO supplier_verification_audit_logs');

    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.any(String),
      'case-1',
      'supplier-org-1',
      'APPROVED',
      'platform-admin-1',
      null,
      'VERIFIED',
      'CASE_APPROVED',
    );
  });
});
