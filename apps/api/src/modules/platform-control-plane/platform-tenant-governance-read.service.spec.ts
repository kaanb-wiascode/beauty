import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformTenantGovernanceReadService } from './platform-tenant-governance-read.service';

describe('PlatformTenantGovernanceReadService', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const service = new PlatformTenantGovernanceReadService(prisma);

  beforeEach(() => queryRaw.mockReset());

  it('returns lifecycle, privileged operations, and audit timeline for a tenant', async () => {
    const lifecycle = {
      tenantId: 'tenant-1', state: 'RESTRICTED', reason: 'Billing review', version: 4,
      updatedByUserId: 'owner-2', updatedByEmail: 'owner@example.com',
      createdAt: new Date('2026-09-01T10:00:00Z'), updatedAt: new Date('2026-09-15T10:00:00Z'),
    };
    const operation = {
      id: 'approval-1', requesterUserId: 'owner-1', requesterEmail: 'requester@example.com',
      approverUserId: 'owner-2', approverEmail: 'approver@example.com', resource: 'customers',
      action: 'lifecycle.restrict', riskLevel: 'HIGH', status: 'EXECUTED', reason: 'Billing review',
      decisionReason: 'Approved', requestId: 'req-1', createdAt: new Date(), decidedAt: new Date(),
      executedAt: new Date(), expiresAt: new Date(),
    };
    const audit = {
      id: 'audit-1', actorUserId: 'owner-2', actorEmail: 'approver@example.com', resource: 'customers',
      action: 'lifecycle.restrict', targetEntityType: 'tenant', targetEntityId: 'tenant-1',
      reason: 'Billing review', beforeState: { state: 'ACTIVE' }, afterState: { state: 'RESTRICTED' },
      metadata: {}, requestId: 'req-2', correlationId: null, riskLevel: 'HIGH',
      approvalRequestId: 'approval-1', createdAt: new Date(),
    };

    queryRaw
      .mockResolvedValueOnce([lifecycle])
      .mockResolvedValueOnce([operation])
      .mockResolvedValueOnce([audit]);

    await expect(service.getTenantGovernance('tenant-1')).resolves.toEqual({
      lifecycle,
      operations: [operation],
      auditTimeline: [audit],
    });
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });

  it('rejects an unknown tenant before reading governance history', async () => {
    queryRaw.mockResolvedValueOnce([]);

    await expect(service.getTenantGovernance('missing-tenant'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
