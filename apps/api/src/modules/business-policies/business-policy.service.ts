import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';

import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type PolicyRow={id:string;tenantId:string;companyId:string;policyKey:string;domain:string;action:string;name:string;description:string|null;version:number;status:'DRAFT'|'PUBLISHED'|'ARCHIVED';rules:unknown;createdByUserId:string;publishedAt:Date|null;createdAt:Date;updatedAt:Date};

@Injectable()
export class BusinessPolicyService {
  constructor(private readonly prisma:PrismaService,private readonly tenantContext:TenantContext,private readonly audit:PlatformAuditService){}

  async list(domain?:string){const c=this.tenantContext.getContext();return this.prisma.$queryRaw<PolicyRow[]>`
    SELECT * FROM business_policy_definitions
    WHERE "tenantId"=${c.tenantId} AND "companyId"=${c.companyId}
      AND (${domain??null}::text IS NULL OR domain=${domain??null})
    ORDER BY "policyKey",version DESC LIMIT 500`;}

  async create(input:{policyKey:string;domain:string;action:string;name:string;description?:string;rules:Record<string,unknown>}){
    const c=this.tenantContext.getContext(),actor=await this.actor();const policyKey=this.key(input.policyKey),domain=this.key(input.domain),action=this.key(input.action);if(!policyKey||!domain||!action) throw new BadRequestException('Policy key, domain and action are required');
    return this.prisma.$transaction(async tx=>{const versions=await tx.$queryRaw<Array<{version:number}>>`SELECT version FROM business_policy_definitions WHERE "tenantId"=${c.tenantId} AND "companyId"=${c.companyId} AND "policyKey"=${policyKey} ORDER BY version DESC LIMIT 1 FOR UPDATE`;const version=(versions[0]?.version??0)+1;const id=randomUUID();const rows=await tx.$queryRaw<PolicyRow[]>`INSERT INTO business_policy_definitions(id,"tenantId","companyId","policyKey",domain,action,name,description,version,status,rules,"createdByUserId","createdAt","updatedAt") VALUES(${id},${c.tenantId},${c.companyId},${policyKey},${domain},${action},${input.name.trim()},${input.description?.trim()||null},${version},'DRAFT',${JSON.stringify(input.rules)}::jsonb,${actor},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`;const created=rows[0];await this.audit.record({actorUserId:actor,resource:'business_policies',action:'create',targetTenantId:c.tenantId,targetEntityType:'business_policy_definition',targetEntityId:id,beforeState:null,afterState:{policyKey,domain,action,version,rules:created.rules},metadata:{companyId:c.companyId}},tx);return created;},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async publish(id:string){const c=this.tenantContext.getContext(),actor=await this.actor();return this.prisma.$transaction(async tx=>{const rows=await tx.$queryRaw<PolicyRow[]>`SELECT * FROM business_policy_definitions WHERE id=${id} AND "tenantId"=${c.tenantId} AND "companyId"=${c.companyId} FOR UPDATE`;const current=rows[0];if(!current)throw new NotFoundException('Business policy not found');if(current.status!=='DRAFT')throw new BadRequestException('Only draft policies can be published');await tx.$executeRaw`UPDATE business_policy_definitions SET status='ARCHIVED',"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=${c.tenantId} AND "companyId"=${c.companyId} AND "policyKey"=${current.policyKey} AND status='PUBLISHED'`;const published=await tx.$queryRaw<PolicyRow[]>`UPDATE business_policy_definitions SET status='PUBLISHED',"publishedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${current.id} RETURNING *`;await this.audit.record({actorUserId:actor,resource:'business_policies',action:'publish',targetTenantId:c.tenantId,targetEntityType:'business_policy_definition',targetEntityId:id,beforeState:{status:current.status},afterState:{status:'PUBLISHED',version:current.version},metadata:{companyId:c.companyId,policyKey:current.policyKey}},tx);return published[0];},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}

  async evaluate(input:{policyKey:string;facts:Record<string,unknown>}){const c=this.tenantContext.getContext();const rows=await this.prisma.$queryRaw<PolicyRow[]>`SELECT * FROM business_policy_definitions WHERE "tenantId"=${c.tenantId} AND "companyId"=${c.companyId} AND "policyKey"=${this.key(input.policyKey)} AND status='PUBLISHED' ORDER BY version DESC LIMIT 1`;const policy=rows[0];if(!policy)return{matched:false,allowed:true,reason:'NO_POLICY'};const rules=(policy.rules&&typeof policy.rules==='object'?policy.rules:{}) as Record<string,unknown>;const maxAmount=typeof rules.maxAmount==='number'?rules.maxAmount:null;const amount=typeof input.facts.amount==='number'?input.facts.amount:null;if(maxAmount!==null&&amount!==null&&amount>maxAmount)return{matched:true,allowed:false,reason:'MAX_AMOUNT_EXCEEDED',policyId:policy.id,version:policy.version};const allowedValues=Array.isArray(rules.allowedValues)?rules.allowedValues.filter((v):v is string=>typeof v==='string'):null;const value=typeof input.facts.value==='string'?input.facts.value:null;if(allowedValues&&value&&!allowedValues.includes(value))return{matched:true,allowed:false,reason:'VALUE_NOT_ALLOWED',policyId:policy.id,version:policy.version};return{matched:true,allowed:true,reason:'POLICY_PASSED',policyId:policy.id,version:policy.version};}

  private async actor(){const c=this.tenantContext.getContext();const m=await this.prisma.membership.findFirst({where:{id:c.membershipId,tenantId:c.tenantId,companyId:c.companyId,status:'ACTIVE'},select:{userId:true}});if(!m)throw new BadRequestException('Active membership is required');return m.userId;}
  private key(v:string){return v.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');}
}
