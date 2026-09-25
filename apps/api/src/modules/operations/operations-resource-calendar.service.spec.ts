import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { OperationsResourceCalendarService } from './operations-resource-calendar.service';

describe('OperationsResourceCalendarService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaService;
  const tenantContext = {
    getTenantId: jest.fn().mockReturnValue('tenant-1'),
    getCompanyId: jest.fn().mockReturnValue('company-1'),
    getBranchId: jest.fn().mockReturnValue('branch-1'),
  } as unknown as TenantContext;
  const service = new OperationsResourceCalendarService(prisma, tenantContext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns branch-scoped allocation and block events for overlapping windows', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);
    const from = new Date('2026-09-15T07:00:00.000Z');
    const to = new Date('2026-09-16T07:00:00.000Z');

    await service.list({ from, to });

    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(
        'ra.tenant_id = $1 AND ra.company_id = $2 AND ra.branch_id = $3',
      ),
      'tenant-1',
      'company-1',
      'branch-1',
      from,
      to,
    );
    const sql = queryRawUnsafe.mock.calls[0]?.[0] as string;
    expect(sql).toContain(
      'rb.tenant_id = $1 AND rb.company_id = $2 AND rb.branch_id = $3',
    );
    expect(sql).toContain('ra.blocked_from < $5 AND ra.blocked_to > $4');
    expect(sql).toContain('rb.blocked_from < $5 AND rb.blocked_to > $4');
    expect(sql).toContain("'ALLOCATION'::text AS \"eventType\"");
    expect(sql).toContain("'BLOCK'::text AS \"eventType\"");
  });
});
