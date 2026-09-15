import { CrmInboundContactResolverService } from './crm-inbound-contact-resolver.service';

describe('CrmInboundContactResolverService', () => {
  const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

  it('returns the only exact branch-scoped contact match', async () => {
    const query = jest.fn().mockResolvedValue([{ kind: 'CUSTOMER', id: 'customer-1' }]);
    const service = new CrmInboundContactResolverService({ $queryRawUnsafe: query } as never);
    await expect(service.resolvePhone(scope, '+90 555 111 22 33')).resolves.toEqual({ matched: true, customerId: 'customer-1', leadId: null });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UNION ALL'),'tenant-1','company-1','branch-1','905551112233');
  });

  it('refuses ambiguous matches instead of guessing a CRM subject', async () => {
    const query = jest.fn().mockResolvedValue([{ kind: 'CUSTOMER', id: 'customer-1' },{ kind: 'LEAD', id: 'lead-1' }]);
    const service = new CrmInboundContactResolverService({ $queryRawUnsafe: query } as never);
    await expect(service.resolvePhone(scope, '905551112233')).resolves.toEqual({ matched: false, reason: 'AMBIGUOUS' });
  });

  it('matches provider contacts only inside the supplied provider namespace', async () => {
    const query = jest.fn().mockResolvedValue([{ kind: 'LEAD', id: 'lead-1' }]);
    const service = new CrmInboundContactResolverService({ $queryRawUnsafe: query } as never);
    await expect(service.resolveIdentity(scope,{ providerKey:' META-WHATSAPP ',providerContactId:' contact-1 ' })).resolves.toEqual({ matched:true,customerId:null,leadId:'lead-1' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('provider_contact_provider_key=$4::text'),'tenant-1','company-1','branch-1','meta-whatsapp','contact-1',null);
  });

  it('does not use a provider contact id without its namespace as an exact identity', async () => {
    const query = jest.fn();
    const service = new CrmInboundContactResolverService({ $queryRawUnsafe: query } as never);
    await expect(service.resolveIdentity(scope,{ providerContactId:'contact-1' })).resolves.toEqual({ matched:false,reason:'NOT_FOUND' });
    expect(query).not.toHaveBeenCalled();
  });

  it('persists provider namespace, contact id and WhatsApp identity after an unambiguous phone-to-lead match', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ kind: 'LEAD', id: 'lead-1' }]);
    const execute = jest.fn().mockResolvedValue(1);
    const service = new CrmInboundContactResolverService({ $queryRawUnsafe: query,$executeRawUnsafe: execute } as never);
    await expect(service.resolveIdentity(scope,{ providerKey:'META-WHATSAPP',providerContactId:' provider-contact-1 ',whatsappIdentity:'+90 555 111 22 33',phone:'+90 555 111 22 33' })).resolves.toEqual({ matched:true,customerId:null,leadId:'lead-1' });
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('provider_contact_provider_key'),'tenant-1','company-1','branch-1','lead-1','meta-whatsapp','provider-contact-1','905551112233');
    expect(execute.mock.calls[0][0]).toContain('other.provider_contact_provider_key=$5::text');
    expect(execute.mock.calls[0][0]).toContain('l.merged_into_lead_id IS NULL');
  });

  it('does not learn inbound identities when the phone resolves to a customer', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ kind: 'CUSTOMER', id: 'customer-1' }]);
    const execute = jest.fn();
    const service = new CrmInboundContactResolverService({ $queryRawUnsafe: query,$executeRawUnsafe: execute } as never);
    await expect(service.resolveIdentity(scope,{ providerKey:'meta-whatsapp',providerContactId:'contact-1',whatsappIdentity:'905551112233',phone:'905551112233' })).resolves.toEqual({ matched:true,customerId:'customer-1',leadId:null });
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not learn identities after an ambiguous phone match', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ kind:'LEAD',id:'lead-1' },{ kind:'LEAD',id:'lead-2' }]);
    const execute = jest.fn();
    const service = new CrmInboundContactResolverService({ $queryRawUnsafe: query,$executeRawUnsafe: execute } as never);
    await expect(service.resolveIdentity(scope,{ providerKey:'meta-whatsapp',providerContactId:'provider-contact-1',phone:'905551112233' })).resolves.toEqual({ matched:false,reason:'AMBIGUOUS' });
    expect(execute).not.toHaveBeenCalled();
  });
});
