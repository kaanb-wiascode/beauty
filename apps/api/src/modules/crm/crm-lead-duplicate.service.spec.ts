import { CrmLeadDuplicateService } from './crm-lead-duplicate.service';

describe('CrmLeadDuplicateService provider namespaces', () => {
  const context = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };
  const tenantContext = { getContext: jest.fn(() => context) };

  it('scores the same namespaced provider contact as an exact duplicate signal', async () => {
    const query = jest.fn().mockResolvedValue([{ id:'lead-2',firstName:'Ada',lastName:'Test',status:'NEW',branchId:'branch-2',confidence:100,matchedSignals:['PROVIDER_CONTACT_ID'],updatedAt:new Date() }]);
    const service = new CrmLeadDuplicateService({ $queryRawUnsafe: query } as never,tenantContext as never);
    const result=await service.findCandidates({providerKey:' META-WHATSAPP ',providerContactId:' contact-1 '},'lead-1');
    expect(result[0].confidence).toBe(100);
    expect(result[0].matchedSignals).toContain('PROVIDER_CONTACT_ID');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('l.provider_contact_provider_key=$5::text'),'tenant-1','company-1',null,null,'meta-whatsapp','contact-1',null,null,'lead-1');
  });

  it('passes provider namespace and id as a pair so equal ids from other providers cannot match', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmLeadDuplicateService({ $queryRawUnsafe: query } as never,tenantContext as never);
    await service.findCandidates({providerKey:'provider-b',providerContactId:'shared-id'});
    const sql=query.mock.calls[0][0] as string;
    expect(sql).toContain('l.provider_contact_provider_key=$5::text AND l.provider_contact_id=$6::text');
    expect(query.mock.calls[0].slice(5,7)).toEqual(['provider-b','shared-id']);
  });

  it('ignores a provider contact id when no provider namespace is supplied', async () => {
    const query = jest.fn();
    const service = new CrmLeadDuplicateService({ $queryRawUnsafe: query } as never,tenantContext as never);
    await expect(service.findCandidates({providerContactId:'contact-1'})).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
