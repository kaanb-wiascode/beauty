import { NotFoundException } from '@nestjs/common';
import { CertificationService } from './certification.service';

describe('CertificationService organization scope', () => {
  const ctx = { getTenantId: () => 'tenant-a', getCompanyId: () => 'company-a' } as never;
  const organizationScope = { getBranchScopedWhere: jest.fn().mockResolvedValue({ tenantId: 'tenant-a', branchId: { in: ['branch-a'] } }) } as never;

  it('rejects evidence documents outside the employee branch and staff scope', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ requiresExpiry: false }])
      .mockResolvedValueOnce([]);
    const prisma: any = {
      staff: { findFirst: jest.fn().mockResolvedValue({ id: 'staff-a', branchId: 'branch-a' }) },
      $queryRawUnsafe: query,
    };
    const service = new CertificationService(prisma, ctx, organizationScope);

    await expect(service.create('staff-a', {
      certificationTypeId: 'type-a',
      evidenceDocumentId: 'doc-b',
      issuedAt: '2026-09-01',
    }, 'user-a')).rejects.toBeInstanceOf(NotFoundException);

    expect(String(query.mock.calls[1][0])).toContain('branch_id=$4');
    expect(String(query.mock.calls[1][0])).toContain('staff_id=$5');
    expect(query.mock.calls[1].slice(1)).toEqual(['doc-b', 'tenant-a', 'company-a', 'branch-a', 'staff-a']);
  });

  it('creates certification when evidence document belongs to the same scoped employee', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ requiresExpiry: false }])
      .mockResolvedValueOnce([{ id: 'doc-a' }])
      .mockResolvedValueOnce([{ id: 'cert-a', status: 'PENDING' }]);
    const prisma: any = {
      staff: { findFirst: jest.fn().mockResolvedValue({ id: 'staff-a', branchId: 'branch-a' }) },
      $queryRawUnsafe: query,
    };
    const service = new CertificationService(prisma, ctx, organizationScope);

    await expect(service.create('staff-a', {
      certificationTypeId: 'type-a',
      evidenceDocumentId: 'doc-a',
      issuedAt: '2026-09-01',
    }, 'user-a')).resolves.toEqual({ id: 'cert-a', status: 'PENDING' });

    const insert = query.mock.calls[2];
    expect(String(insert[0])).toContain('evidence_document_id');
    expect(insert).toContain('doc-a');
  });
});
