import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type WorkflowRow={id:string;workflowKey:string;version:number;domain:string;steps:unknown};
type RequestRow={id:string;tenantId:string;companyId:string;branchId:string|null;workflowKey:string;workflowVersion:number;domain:string;entityType:string;entityId:string;requestedByUserId:string;status:string;currentStepOrder:number};
type StepDef={key:string;name:string;approverPermission?:string;approverRoleSlug?:string};
type SodPolicyRow={requesterCannotApprove:boolean;requireDistinctApprovers:boolean;enabled:boolean};

@Injectable()
export class ApprovalRuntimeService {
  constructor(private readonly prisma:PrismaService,private readonly tenantContext:TenantContext,private readonly audit:PlatformAuditService){}

  list(status?:string){const c=this.tenantContext.getContext();return this.prisma.$queryRaw`
    SELECT r.*,s."stepName" AS "currentStepName",s."approverPermission",s."approverRoleSlug"
    FROM approval_requests r LEFT JOIN approval_request_steps s ON s."requestId"=r.id AND s."stepOrder"=r."currentStepOrder"
    WHERE r."tenantId"=${c.tenantId} AND r."companyId"=${c.companyId} AND (${status??null}::text IS NULL OR r.status=${status??null})
    ORDER BY r."createdAt" DESC LIMIT 500`}

  async create(input:{workflowKey:string;entityType:string;entityId:string;branchId?:string|null;payload?:Record<string,unknown>;reason?:string}){
    const c=this.tenantContext.getContext(), actor=await this.actor();
    const rows=await this.prisma.$queryRaw<WorkflowRow[]>`
      SELECT id,"workflowKey",version,domain,steps FROM approval_workflow_definitions
      WHERE "tenantId"=${c.tenantId} AND "companyId"=${c.companyId} AND "workflowKey"=${input.workflowKey.trim().toLowerCase()} AND status='PUBLISHED'
      ORDER BY version DESC LIMIT 1`;
    const wf=rows[0]; if(!wf) throw new NotFoundException('Published approval workflow not found');
    const steps=this.steps(wf.steps); if(!steps.length) throw new BadRequestException('Published workflow has no executable steps');
    const branchId=input.branchId??c.branchId??null;
    if(branchId){const branch=await this.prisma.branch.findFirst({where:{id:branchId,companyId:c.companyId,status:'ACTIVE',company:{tenantId:c.tenantId}},select:{id:true}});if(!branch) throw new BadRequestException('Approval branch is invalid');}
    return this.prisma.$transaction(async tx=>{const id=randomUUID();
      const req=await tx.$queryRaw<RequestRow[]>`INSERT INTO approval_requests(id,"tenantId","companyId","branchId","workflowDefinitionId","workflowKey","workflowVersion",domain,"entityType","entityId","requestedByUserId",status,"currentStepOrder",payload,reason,"createdAt","updatedAt") VALUES(${id},${c.tenantId},${c.companyId},${branchId},${wf.id},${wf.workflowKey},${wf.version},${wf.domain},${input.entityType.trim()},${input.entityId.trim()},${actor},'PENDING',1,${JSON.stringify(input.payload??{})}::jsonb,${input.reason?.trim()||null},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`;
      for(let i=0;i<steps.length;i++){const s=steps[i];await tx.$executeRaw`INSERT INTO approval_request_steps(id,"requestId","stepOrder","stepKey","stepName","approverPermission","approverRoleSlug",status,"createdAt","updatedAt") VALUES(${randomUUID()},${id},${i+1},${s.key},${s.name},${s.approverPermission??null},${s.approverRoleSlug??null},${i===0?'PENDING':'WAITING'},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;}
      await this.audit.record({actorUserId:actor,resource:'approval_requests',action:'create',targetTenantId:c.tenantId,targetEntityType:input.entityType.trim(),targetEntityId:input.entityId.trim(),beforeState:null,afterState:{requestId:id,workflowKey:wf.workflowKey,workflowVersion:wf.version,branchId},metadata:{companyId:c.companyId,branchId}},tx);
      return req[0];},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async act(id:string,decision:'APPROVE'|'REJECT',comment?:string){const c=this.tenantContext.getContext(),actor=await this.actor();
    return this.prisma.$transaction(async tx=>{const rs=await tx.$queryRaw<RequestRow[]>`SELECT * FROM approval_requests WHERE id=${id} AND "tenantId"=${c.tenantId} AND "companyId"=${c.companyId} FOR UPDATE`;const r=rs[0];if(!r) throw new NotFoundException('Approval request not found');if(r.status!=='PENDING') throw new BadRequestException('Approval request is completed');
      await this.assertSeparationOfDuties(actor,r,tx);
      const ss=await tx.$queryRaw<Array<{id:string;stepOrder:number;approverPermission:string|null;approverRoleSlug:string|null;status:string}>>`SELECT id,"stepOrder","approverPermission","approverRoleSlug",status FROM approval_request_steps WHERE "requestId"=${r.id} AND "stepOrder"=${r.currentStepOrder} FOR UPDATE`;const s=ss[0];if(!s||s.status!=='PENDING') throw new BadRequestException('Current step is not actionable');await this.assertApprover(actor,r,s,tx);
      if(decision==='REJECT'){await tx.$executeRaw`UPDATE approval_request_steps SET status='REJECTED',"actedByUserId"=${actor},"actedAt"=CURRENT_TIMESTAMP,comment=${comment?.trim()||null},"updatedAt"=CURRENT_TIMESTAMP WHERE id=${s.id}`;await tx.$executeRaw`UPDATE approval_requests SET status='REJECTED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${r.id}`;}
      else {await tx.$executeRaw`UPDATE approval_request_steps SET status='APPROVED',"actedByUserId"=${actor},"actedAt"=CURRENT_TIMESTAMP,comment=${comment?.trim()||null},"updatedAt"=CURRENT_TIMESTAMP WHERE id=${s.id}`;const next=await tx.$queryRaw<Array<{id:string;stepOrder:number}>>`SELECT id,"stepOrder" FROM approval_request_steps WHERE "requestId"=${r.id} AND "stepOrder">${s.stepOrder} ORDER BY "stepOrder" LIMIT 1 FOR UPDATE`;if(next[0]){await tx.$executeRaw`UPDATE approval_request_steps SET status='PENDING',"updatedAt"=CURRENT_TIMESTAMP WHERE id=${next[0].id}`;await tx.$executeRaw`UPDATE approval_requests SET "currentStepOrder"=${next[0].stepOrder},"updatedAt"=CURRENT_TIMESTAMP WHERE id=${r.id}`;}else await tx.$executeRaw`UPDATE approval_requests SET status='APPROVED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${r.id}`;}
      await this.audit.record({actorUserId:actor,resource:'approval_requests',action:decision.toLowerCase(),targetTenantId:c.tenantId,targetEntityType:r.entityType,targetEntityId:r.entityId,beforeState:{status:r.status,stepOrder:r.currentStepOrder},afterState:{decision,actedByUserId:actor},metadata:{companyId:c.companyId,requestId:r.id,workflowKey:r.workflowKey}},tx);return{id:r.id,decision,success:true};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}

  private async assertSeparationOfDuties(actor:string,r:RequestRow,tx:Prisma.TransactionClient){
    const rows=await tx.$queryRaw<SodPolicyRow[]>`SELECT "requesterCannotApprove","requireDistinctApprovers",enabled FROM sod_policy_definitions WHERE "tenantId"=${r.tenantId} AND "companyId"=${r.companyId} AND domain=${r.domain} LIMIT 1`;
    const policy=rows[0];
    const requesterCannotApprove=policy?.enabled===false?false:(policy?.requesterCannotApprove??true);
    const requireDistinctApprovers=policy?.enabled===true&&(policy.requireDistinctApprovers??false);
    if(requesterCannotApprove&&r.requestedByUserId===actor) throw new BadRequestException('Separation of duties: requester cannot act on own request');
    if(requireDistinctApprovers){
      const prior=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM approval_request_steps WHERE "requestId"=${r.id} AND "stepOrder"<${r.currentStepOrder} AND "actedByUserId"=${actor} AND status='APPROVED' LIMIT 1`;
      if(prior.length) throw new BadRequestException('Separation of duties: the same approver cannot approve multiple steps');
    }
  }

  private async assertApprover(actor:string,r:RequestRow,s:{approverPermission:string|null;approverRoleSlug:string|null},tx:Prisma.TransactionClient){const m=await tx.membership.findFirst({where:{userId:actor,tenantId:r.tenantId,companyId:r.companyId,status:'ACTIVE'},include:{role:true}});if(!m) throw new BadRequestException('Approver is not active in request company');let ok=!!(s.approverRoleSlug&&m.role.slug===s.approverRoleSlug);if(s.approverPermission){const [resource,action]=s.approverPermission.split('.');if(resource&&action&&(await tx.rolePermission.count({where:{roleId:m.roleId,permission:{resource,action}}}))>0) ok=true;}if(ok)return;const d=await tx.$queryRaw<Array<{id:string}>>`SELECT d.id FROM approval_delegations d JOIN memberships dm ON dm."userId"=d."delegatorUserId" JOIN roles dr ON dr.id=dm."roleId" WHERE d."tenantId"=${r.tenantId} AND d."companyId"=${r.companyId} AND d."delegateUserId"=${actor} AND d."revokedAt" IS NULL AND d."startsAt"<=CURRENT_TIMESTAMP AND d."endsAt">CURRENT_TIMESTAMP AND (d.domain IS NULL OR d.domain=${r.domain}) AND dm."tenantId"=d."tenantId" AND dm."companyId"=d."companyId" AND dm.status='ACTIVE' AND ((${s.approverRoleSlug??null}::text IS NOT NULL AND dr.slug=${s.approverRoleSlug??null}) OR EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp."permissionId" WHERE rp."roleId"=dm."roleId" AND (${s.approverPermission??null}::text IS NOT NULL) AND (p.resource||'.'||p.action)=${s.approverPermission??null})) LIMIT 1`;if(!d.length) throw new BadRequestException('User is not authorized for current approval step');}
  private steps(v:unknown):StepDef[]{return Array.isArray(v)?v.filter((x):x is StepDef=>!!x&&typeof x==='object'&&typeof (x as StepDef).key==='string'&&typeof (x as StepDef).name==='string'):[]}
  private async actor(){const c=this.tenantContext.getContext();const m=await this.prisma.membership.findFirst({where:{id:c.membershipId,tenantId:c.tenantId,companyId:c.companyId,status:'ACTIVE'},select:{userId:true}});if(!m)throw new BadRequestException('Active membership is required');return m.userId;}
}
