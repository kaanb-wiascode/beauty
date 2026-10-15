import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { OperationsBranchChecklistsService } from './operations-branch-checklists.service';
import { listBranchChecklistRunsSchema } from './dto/branch-checklist.dto';

describe('Branch checklist history pagination', () => {
  const query = jest.fn();
  const context = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
    getMembershipId: () => 'member-1',
  };
  const service = new OperationsBranchChecklistsService(
    { $queryRawUnsafe: query } as unknown as PrismaService,
    context as unknown as TenantContext,
  );

  beforeEach(() => query.mockReset());

  it('enforces branch and company scope with deterministic pagination', async () => {
    query.mockResolvedValueOnce(Array.from({ length: 26 }, (_, i) => ({ id: `run-${i}` })));
    const input = listBranchChecklistRunsSchema.parse({ page: '2', limit: '25', category: 'OPENING' });
    const result = await service.listRuns(input);
    expect(result).toEqual({
      data: Array.from({ length: 25 }, (_, i) => ({ id: `run-${i}` })),
      meta: { page: 2, limit: 25, hasMore: true },
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY business_date DESC, category ASC, id ASC'),
      'tenant-1', 'company-1', 'branch-1', 'OPENING', null, null, 26, 25,
    );
    expect(query.mock.calls[0][0]).toContain('LIMIT $7 OFFSET $8');
    expect(query.mock.calls[0][0]).toContain('tenant_id = $1 AND company_id = $2 AND branch_id = $3');
  });

  it('keeps legacy requests as an array response', async () => {
    query.mockResolvedValueOnce([{ id: 'run-1' }]);
    await expect(service.listRuns(listBranchChecklistRunsSchema.parse({}))).resolves.toEqual([{ id: 'run-1' }]);
    expect(query.mock.calls[0]).toHaveLength(7);
  });

  it('rejects unbounded pagination values', () => {
    expect(() => listBranchChecklistRunsSchema.parse({ page: '0' })).toThrow();
    expect(() => listBranchChecklistRunsSchema.parse({ page: '10001' })).toThrow();
    expect(() => listBranchChecklistRunsSchema.parse({ page: '1', limit: '101' })).toThrow();
  });
});
