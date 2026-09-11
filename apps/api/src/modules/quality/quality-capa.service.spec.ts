import { BadRequestException } from '@nestjs/common';
import { QualityCapaService } from './quality-capa.service';

describe('QualityCapaService',()=>{
  const tenant={getTenantId:()=> 'tenant-1',getCompanyId:()=> 'company-1',getBranchId:()=> 'branch-1'};
  const tx=(queryResults:any[][])=>{let i=0;const client={$queryRawUnsafe:jest.fn(async()=>queryResults[i++]??[]),$executeRawUnsafe:jest.fn(async()=>1)};return{client,prisma:{...client,$transaction:jest.fn(async(fn:any)=>fn(client))}};};

  it('creates a CAPA once per quality case and writes an audit event',async()=>{
    const {client,prisma}=tx([[{id:'case-1',branchId:'branch-1'}],[],[],[{id:'capa-1',status:'OPEN',branchId:'branch-1',qualityCaseId:'case-1'}]]);
    const service=new QualityCapaService(prisma as any,tenant as any);
    await expect(service.createFromCase('case-1',{rootCause:'Process gap',correctiveAction:'Correct process'},'user-1')).resolves.toMatchObject({id:'capa-1',duplicate:false});
    expect(client.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('quality_capa_events'),'capa-1','tenant-1','company-1','branch-1','user-1','CAPA created from quality case');
  });

  it('requires verification result before effectiveness decision',async()=>{
    const {prisma}=tx([]);const service=new QualityCapaService(prisma as any,tenant as any);
    await expect(service.verify('capa-1',{effective:true,result:'   '},'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
