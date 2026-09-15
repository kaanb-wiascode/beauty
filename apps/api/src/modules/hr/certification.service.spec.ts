import { CertificationService } from './certification.service';

describe('CertificationService',()=>{
 const ctx={getTenantId:jest.fn(()=>'tenant-1'),getCompanyId:jest.fn(()=>'company-1')};
 const organizationScope={getBranchScopedWhere:jest.fn().mockResolvedValue({tenantId:'tenant-1',branchId:{in:['branch-1']}})};
 const staff={id:'staff-1',branchId:'branch-1'};
 function prisma(){const tx={$queryRawUnsafe:jest.fn()};return{staff:{findFirst:jest.fn().mockResolvedValue(staff)},$queryRawUnsafe:jest.fn(),$transaction:jest.fn(async(cb:(client:typeof tx)=>unknown)=>cb(tx)),tx}}
 beforeEach(()=>{jest.clearAllMocks();organizationScope.getBranchScopedWhere.mockResolvedValue({tenantId:'tenant-1',branchId:{in:['branch-1']}})});

 it('keeps employee certification access inside active branch scope',async()=>{const db=prisma();db.$queryRawUnsafe.mockResolvedValue([]);const service=new CertificationService(db as never,ctx as never,organizationScope as never);await service.list('staff-1');expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'staff-1',tenantId:'tenant-1',branchId:{in:['branch-1']}})}))});

 it('allows CENTRAL scope to access company staff without a branch predicate',async()=>{organizationScope.getBranchScopedWhere.mockResolvedValue({tenantId:'tenant-1',branch:{companyId:'company-1'}});const db=prisma();db.$queryRawUnsafe.mockResolvedValue([]);const service=new CertificationService(db as never,ctx as never,organizationScope as never);await service.list('staff-1');expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.not.objectContaining({branchId:expect.anything()})}))});

 it('rejects invalid certification validity ranges before persistence',async()=>{const db=prisma();const service=new CertificationService(db as never,ctx as never,organizationScope as never);await expect(service.create('staff-1',{certificationTypeId:'type-1',issuedAt:'2026-09-15',expiresAt:'2026-09-14'},'user-1')).rejects.toThrow('expiresAt cannot precede issuedAt.');expect(db.$queryRawUnsafe).not.toHaveBeenCalled()});

 it('requires expiry for certification types configured with expiry',async()=>{const db=prisma();db.$queryRawUnsafe.mockResolvedValueOnce([{requiresExpiry:true}]);const service=new CertificationService(db as never,ctx as never,organizationScope as never);await expect(service.create('staff-1',{certificationTypeId:'type-1'},'user-1')).rejects.toThrow('expiresAt is required for this certification type.');expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1)});

 it('rejects duplicate credential numbers',async()=>{const db=prisma();db.$queryRawUnsafe.mockResolvedValueOnce([{requiresExpiry:false}]).mockRejectedValueOnce({code:'23505'});const service=new CertificationService(db as never,ctx as never,organizationScope as never);await expect(service.create('staff-1',{certificationTypeId:'type-1',credentialNumber:'ABC-1'},'user-1')).rejects.toThrow('Credential number already exists.')});

 it('requires a note when rejecting a certification',async()=>{const db=prisma();const service=new CertificationService(db as never,ctx as never,organizationScope as never);await expect(service.verify('staff-1','cert-1',{status:'REJECTED'},'user-1')).rejects.toThrow('A verification note is required when rejecting a certification.');expect(db.$transaction).not.toHaveBeenCalled()});

 it('allows verification only from pending state',async()=>{const db=prisma();db.tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'cert-1',status:'VERIFIED',expiresAt:null}]);const service=new CertificationService(db as never,ctx as never,organizationScope as never);await expect(service.verify('staff-1','cert-1',{status:'VERIFIED'},'user-1')).rejects.toThrow('Only pending certifications can be verified or rejected.');expect(db.tx.$queryRawUnsafe).toHaveBeenCalledTimes(1)});

 it('does not verify a certification that is already expired',async()=>{const db=prisma();db.tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'cert-1',status:'PENDING',expiresAt:'2020-01-01'}]);const service=new CertificationService(db as never,ctx as never,organizationScope as never);await expect(service.verify('staff-1','cert-1',{status:'VERIFIED'},'user-1')).rejects.toThrow('An expired certification cannot be verified.');expect(db.tx.$queryRawUnsafe).toHaveBeenCalledTimes(1)});

 it('revokes only verified certifications and requires a reason',async()=>{const db=prisma();const service=new CertificationService(db as never,ctx as never,organizationScope as never);await expect(service.revoke('staff-1','cert-1','', 'user-1')).rejects.toThrow('note is required.');db.$queryRawUnsafe.mockResolvedValue([]);await expect(service.revoke('staff-1','cert-1','Yetki geri alındı','user-1')).rejects.toThrow('Only verified certifications can be revoked.')});

 it('reports missing service credentials as ineligible',async()=>{const db=prisma();db.$queryRawUnsafe.mockResolvedValue([{certificationTypeId:'type-1',name:'Lazer Yetkinliği',certificationId:null,expiresAt:null},{certificationTypeId:'type-2',name:'Cilt Bakımı',certificationId:'cert-2',expiresAt:'2027-01-01'}]);const service=new CertificationService(db as never,ctx as never,organizationScope as never);const result=await service.serviceEligibility('staff-1','service-1');expect(result.eligible).toBe(false);expect(result.missing).toHaveLength(1);expect(result.missing[0]).toEqual(expect.objectContaining({certificationTypeId:'type-1'}))});
});
