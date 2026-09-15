import { CrmLeadService } from './crm-lead.service';

describe('CrmLeadService nullable update semantics', () => {
  const context={tenantId:'tenant-1',companyId:'company-1',branchId:'branch-1'};
  const tenantContext={getContext:jest.fn(()=>context)};

  function serviceWithUpdateResult(){
    const query=jest.fn().mockResolvedValue([{id:'lead-1',version:2,status:'NEW'}]);
    const execute=jest.fn().mockResolvedValue(1);
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:execute};
    const prisma={$transaction:jest.fn(async(fn:(client:typeof tx)=>unknown)=>fn(tx))};
    return {service:new CrmLeadService(prisma as never,tenantContext as never),query};
  }

  it('distinguishes omitted nullable fields from explicit null clears',async()=>{
    const {service,query}=serviceWithUpdateResult();
    await service.update('lead-1',{version:1,phone:null,preferredContactChannel:null,language:null,timezone:null,preferredBranchId:null,estimatedBudget:null,purchaseUrgency:null,consultationNeed:null,customerIntent:null,team:null,firstContactedAt:null,firstResponseAt:null,interestNote:null,ownerUserId:null},'actor-1');
    const args=query.mock.calls[0];
    expect(args[7]).toBe(true); expect(args[8]).toBeNull();
    expect(args[13]).toBe(true); expect(args[14]).toBeNull();
    expect(args[15]).toBe(true); expect(args[16]).toBeNull();
    expect(args[17]).toBe(true); expect(args[18]).toBeNull();
    expect(args[54]).toBe(true); expect(args[55]).toBeNull();
    expect(args[56]).toBe(true); expect(args[57]).toBeNull();
    expect(args[59]).toBe(true); expect(args[60]).toBeNull();
    expect(args[61]).toBe(true); expect(args[62]).toBeNull();
    expect(args[63]).toBe(true); expect(args[64]).toBeNull();
    expect(args[65]).toBe(true); expect(args[66]).toBeNull();
    expect(args[69]).toBe(true); expect(args[70]).toBeNull();
    expect(args[71]).toBe(true); expect(args[72]).toBeNull();
    expect(args[73]).toBe(true); expect(args[74]).toBeNull();
    expect(args[75]).toBe(true); expect(args[76]).toBeNull();
  });

  it('leaves nullable fields unchanged when they are omitted',async()=>{
    const {service,query}=serviceWithUpdateResult();
    await service.update('lead-1',{version:1},'actor-1');
    const args=query.mock.calls[0];
    for(const flagIndex of [7,9,11,13,15,17,20,22,24,26,28,30,32,34,36,38,40,42,44,46,48,50,52,54,56,59,61,63,65,69,71,73,75]) expect(args[flagIndex]).toBe(false);
  });
});
