import { CrmInboundContactResolverService } from './crm-inbound-contact-resolver.service';

describe('CrmInboundContactResolverService', () => {
  const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

  it('returns the only exact branch-scoped contact match', async () => {
    const query = jest.fn().mockResolvedValue([{ kind: 'CUSTOMER', id: 'customer-1' }]);
    const service = new CrmInboundContactResolverService({ $queryRawUnsafe: query } as never);

    await expect(service.resolvePhone(scope, '+90 555 111 22 33')).resolves.toEqual({
      matched: true,
      customerId: 'customer-1',
      leadId: null,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UNION ALL'),
      'tenant-1',
      'company-1',
      'branch-1',
      '905551112233',
    );
  });

  it('refuses ambiguous matches instead of guessing a CRM subject', async () => {
    const query = jest.fn().mockResolvedValue([
      { kind: 'CUSTOMER', id: 'customer-1' },
      { kind: 'LEAD', id: 'lead-1' },
    ]);
    const service = new CrmInboundContactResolverService({ $queryRawUnsafe: query } as never);

    await expect(service.resolvePhone(scope, '905551112233')).resolves.toEqual({
      matched: false,
      reason: 'AMBIGUOUS',
    });
  });
});
