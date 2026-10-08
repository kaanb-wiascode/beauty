import { PersonnelDocumentService } from './personnel-document.service';

describe('PersonnelDocumentService',()=>{
  const ctx={getTenantId:jest.fn(()=>'tenant-1'),getCompanyId:jest.fn(()=>'company-1')};
  const organizationScope={getBranchScopedWhere:jest.fn().mockResolvedValue({tenantId:'tenant-1',branchId:{in:['branch-1']}})};
  const staff={id:'staff-1',branchId:'branch-1',branch:{companyId:'company-1'}};
  function prisma(){const tx={$queryRawUnsafe:jest.fn()};return{staff:{findFirst:jest.fn().mockResolvedValue(staff)},$queryRawUnsafe:jest.fn(),$transaction:jest.fn(async(cb:(client:typeof tx)=>unknown)=>cb(tx)),tx}}
  beforeEach(()=>{jest.clearAllMocks();organizationScope.getBranchScopedWhere.mockResolvedValue({tenantId:'tenant-1',branchId:{in:['branch-1']}})});

  it('keeps staff lookup inside active branch scope',async()=>{const db=prisma();db.$queryRawUnsafe.mockResolvedValue([]);const service=new PersonnelDocumentService(db as never,ctx as never,organizationScope as never);await service.list('staff-1');expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'staff-1',tenantId:'tenant-1',branchId:{in:['branch-1']}})}))});

  it('keeps CENTRAL staff lookup company-wide',async()=>{organizationScope.getBranchScopedWhere.mockResolvedValue({tenantId:'tenant-1',branch:{companyId:'company-1'}});const db=prisma();db.$queryRawUnsafe.mockResolvedValue([]);const service=new PersonnelDocumentService(db as never,ctx as never,organizationScope as never);await service.list('staff-1');expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.not.objectContaining({branchId:expect.anything()})}))});

  it('rejects expiry before issue date',async()=>{const db=prisma();const service=new PersonnelDocumentService(db as never,ctx as never,organizationScope as never);await expect(service.create('staff-1',{documentType:'IDENTITY',title:'Kimlik',issuedAt:'2026-09-15',expiresAt:'2026-09-14'},'user-1')).rejects.toThrow('expiresAt cannot precede issuedAt.');expect(db.$transaction).not.toHaveBeenCalled()});

  it('rejects unsafe file sizes',async()=>{const db=prisma();const service=new PersonnelDocumentService(db as never,ctx as never,organizationScope as never);await expect(service.create('staff-1',{documentType:'IDENTITY',title:'Kimlik',fileSize:Number.MAX_SAFE_INTEGER+1},'user-1')).rejects.toThrow('fileSize must be a non-negative integer.');expect(db.$transaction).not.toHaveBeenCalled()});

  it('increments document version under staff lock',async()=>{const db=prisma();db.tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'staff-1',branch_id:'branch-1'}]).mockResolvedValueOnce([{version:2}]).mockResolvedValueOnce([{id:'doc-1',version:3}]);const service=new PersonnelDocumentService(db as never,ctx as never,organizationScope as never);const result=await service.create('staff-1',{documentType:'IDENTITY',documentNumber:'123',title:'Kimlik'},'user-1');expect(String(db.tx.$queryRawUnsafe.mock.calls[0][0])).toContain('FOR UPDATE');expect(db.tx.$queryRawUnsafe.mock.calls[1]).toEqual(expect.arrayContaining(['company-1','staff-1','IDENTITY','123']));expect(db.tx.$queryRawUnsafe.mock.calls[2]).toEqual(expect.arrayContaining([3]));expect(result).toEqual(expect.objectContaining({version:3}))});

  it('allows only pending documents to be verified',async()=>{const db=prisma();db.tx.$queryRawUnsafe.mockResolvedValueOnce([{id:'doc-1',status:'VERIFIED'}]);const service=new PersonnelDocumentService(db as never,ctx as never,organizationScope as never);await expect(service.verify('staff-1','doc-1',{status:'REJECTED',note:'wrong'},'user-1')).rejects.toThrow('Only pending personnel documents can be verified or rejected. Create a new version to replace a decided document.');expect(db.tx.$queryRawUnsafe).toHaveBeenCalledTimes(1)});

  it('requires a rejection note',async()=>{const db=prisma();const service=new PersonnelDocumentService(db as never,ctx as never,organizationScope as never);await expect(service.verify('staff-1','doc-1',{status:'REJECTED'},'user-1')).rejects.toThrow('A verification note is required when rejecting a document.');expect(db.$transaction).not.toHaveBeenCalled()});

  it('archives an already archived document idempotently',async()=>{const db=prisma();db.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'doc-1',status:'ARCHIVED'}]);const service=new PersonnelDocumentService(db as never,ctx as never,organizationScope as never);const result=await service.archive('staff-1','doc-1');expect(result).toEqual({id:'doc-1',status:'ARCHIVED'});expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(2);expect(String(db.$queryRawUnsafe.mock.calls[1][0])).toContain("status='ARCHIVED'")});

  it('casts bigint file size for JSON-safe list output',async()=>{const db=prisma();db.$queryRawUnsafe.mockResolvedValue([]);const service=new PersonnelDocumentService(db as never,ctx as never,organizationScope as never);await service.list('staff-1',true);expect(String(db.$queryRawUnsafe.mock.calls[0][0])).toContain('file_size::text AS "fileSize"')});
});
