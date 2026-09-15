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

  it('persists provider and WhatsApp identities learned after an unambiguous phone-to-lead match', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ kind: 'LEAD', id: 'lead-1' }]);
    const execute = jest.fn().mockResolvedValue(1);
    const service = new CrmInboundContactResolverService({
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
    } as never);

    await expect(service.resolveIdentity(scope, {
      providerContactId: ' provider-contact-1 ',
      whatsappIdentity: '+90 555 111 22 33',
      phone: '+90 555 111 22 33',
    })).resolves.toEqual({ matched: true, customerId: null, leadId: 'lead-1' });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('NOT EXISTS'),
      'tenant-1',
      'company-1',
      'branch-1',
      'lead-1',
      'provider-contact-1',
      '905551112233',
    );
    expect(execute.mock.calls[0][0]).toContain('l.merged_into_lead_id IS NULL');
    expect(execute.mock.calls[0][0]).toContain('other.id<>l.id');
  });

  it('does not learn inbound identities when the phone resolves to a customer', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ kind: 'CUSTOMER', id: 'customer-1' }]);
    const execute = jest.fn();
    const service = new CrmInboundContactResolverService({
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
    } as never);

    await expect(service.resolveIdentity(scope, {
      whatsappIdentity: '905551112233',
      phone: '905551112233',
    })).resolves.toEqual({ matched: true, customerId: 'customer-1', leadId: null });
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not learn identities after an ambiguous phone match', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { kind: 'LEAD', id: 'lead-1' },
        { kind: 'LEAD', id: 'lead-2' },
      ]);
    const execute = jest.fn();
    const service = new CrmInboundContactResolverService({
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
    } as never);

    await expect(service.resolveIdentity(scope, {
      providerContactId: 'provider-contact-1',
      phone: '905551112233',
    })).resolves.toEqual({ matched: false, reason: 'AMBIGUOUS' });
    expect(execute).not.toHaveBeenCalled();
  });
});
