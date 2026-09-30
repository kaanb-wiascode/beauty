import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type WorkflowRow={id:string;workflowKey:string;version:number;domain:string;steps:unknown};
type RequestRow={id:string;tenantId:string;companyId:string;branchId:string|null;workflowKey:string;workflowVersion:number;domain:string;entityType:string;entityId:string;requestedByUserId:string;status:string;currentStepOrder:number;stepStartedAt?:Date};
type StepDef={key:string;name:string;approverType?:string;approverValue?:string|null;approverPermission?:string;approverRoleSlug?:string;slaMinutes?:number|null;escalationApproverType?:string|null;escalationApproverValue?:string|null;timeoutAction?:string};
type SodPolicyRow={requesterCannotApprove:boolean;requireDistinctApprovers:boolean;enabled:boolean};

@Injectable()
export class ApprovalRuntimeService {
  constructor(private readonly prisma:PrismaService,private readonly tenantContext:TenantContext,private readonly audit:PlatformAuditService){}

  list(status?:string){const c=this.tenantContext.getContext();return this.prisma.$queryRaw`
    SELECT r.*,s."stepName" AS "currentStepName",s."approverPermission",s."approverRoleSlug",s."approverType",s."approverValue",s."slaMinutes",s."escalationApproverType",s."escalationApproverValue",s."timeoutAction",s."startedAt" AS "currentStepStartedAt",CASE WHEN s."slaMinutes" IS NULL OR s."startedAt" IS NULL THEN NULL ELSE s."startedAt"+(s."slaMinutes"*INTERVAL '1 minute') END AS "dueAt",CASE WHEN s."slaMinutes" IS NULL OR s."startedAt" IS NULL THEN FALSE ELSE CURRENT_TIMESTAMP>=s."startedAt"+(s."slaMinutes"*INTERVAL '1 minute') END AS overdue
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
      const req=await tx.$queryRaw<RequestRow[]>`INSERT INTO approval_requests(id,"tenantId","companyId","branchId","workflowDefinitionId","workflowKey","workflowVersion",domain,"entityType","entityId","requestedByUserId",status,"currentStepOrder",payload,reason,"stepStartedAt","createdAt","updatedAt") VALUES(${id},${c.tenantId},${c.companyId},${branchId},${wf.id},${wf.workflowKey},${wf.version},${wf.domain},${input.entityType.trim()},${input.entityId.trim()},${actor},'PENDING',1,${JSON.stringify(input.payload??{})}::jsonb,${input.reason?.trim()||null},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`;
      for(let i=0;i<steps.length;i++){const s=this.normalizeStep(steps[i]);await tx.$executeRaw`INSERT INTO approval_request_steps(id,"requestId","stepOrder","stepKey","stepName","approverPermission","approverRoleSlug","approverType","approverValue","slaMinutes","escalationApproverType","escalationApproverValue","timeoutAction",status,"startedAt","createdAt","updatedAt") VALUES(${randomUUID()},${id},${i+1},${s.key},${s.name},${s.approverPermission??null},${s.approverRoleSlug??null},${s.approverType??null},${s.approverValue??null},${s.slaMinutes??null},${s.escalationApproverType??null},${s.escalationApproverValue??null},${s.timeoutAction??'ESCALATE'},${i===0?'PENDING':'WAITING'},${i===0?new Date():null},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;}
      await this.audit.record({actorUserId:actor,resource:'approval_requests',action:'create',targetTenantId:c.tenantId,targetEntityType:input.entityType.trim(),targetEntityId:input.entityId.trim(),beforeState:null,afterState:{requestId:id,workflowKey:wf.workflowKey,workflowVersion:wf.version,branchId},metadata:{companyId:c.companyId,branchId}},tx);
      return req[0];},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async inbox(status='PENDING'){
    const context=this.tenantContext.getContext(),actor=await this.actor();
    if(status!=='PENDING'){
      return this.prisma.$queryRaw<any[]>`SELECT DISTINCT r.*,s."stepName" AS "currentStepName",s."approverPermission",s."approverRoleSlug",s."approverType",s."approverValue",s."slaMinutes",s."startedAt" AS "currentStepStartedAt",CASE WHEN s."slaMinutes" IS NULL OR s."startedAt" IS NULL THEN NULL ELSE s."startedAt"+(s."slaMinutes"*INTERVAL '1 minute') END AS "dueAt",FALSE AS overdue FROM approval_requests r LEFT JOIN approval_request_steps s ON s."requestId"=r.id AND s."stepOrder"=r."currentStepOrder" JOIN approval_request_actions a ON a."requestId"=r.id WHERE r."tenantId"=${context.tenantId} AND r."companyId"=${context.companyId} AND (${status||null}::text IS NULL OR r.status=${status||null}) AND a."actorUserId"=${actor} ORDER BY r."createdAt" DESC LIMIT 500`;
    }
    const candidates=await this.prisma.$queryRaw<any[]>`SELECT r.*,s.id AS "currentStepId",s."stepName" AS "currentStepName",s."approverPermission",s."approverRoleSlug",s."approverType",s."approverValue",s."slaMinutes",s."escalationApproverType",s."escalationApproverValue",s."timeoutAction",s."startedAt" AS "currentStepStartedAt",CASE WHEN s."slaMinutes" IS NULL OR s."startedAt" IS NULL THEN NULL ELSE s."startedAt"+(s."slaMinutes"*INTERVAL '1 minute') END AS "dueAt",CASE WHEN s."slaMinutes" IS NULL OR s."startedAt" IS NULL THEN FALSE ELSE CURRENT_TIMESTAMP>=s."startedAt"+(s."slaMinutes"*INTERVAL '1 minute') END AS overdue FROM approval_requests r JOIN approval_request_steps s ON s."requestId"=r.id AND s."stepOrder"=r."currentStepOrder" WHERE r."tenantId"=${context.tenantId} AND r."companyId"=${context.companyId} AND r.status='PENDING' ORDER BY overdue DESC,r."createdAt" DESC LIMIT 300`;
    return this.prisma.$transaction(async tx=>{const visible:any[]=[];for(const row of candidates){try{await this.assertSeparationOfDuties(actor,row as RequestRow,tx);await this.assertApprover(actor,row as RequestRow,{approverPermission:row.approverPermission??null,approverRoleSlug:row.approverRoleSlug??null,approverType:row.approverType??null,approverValue:row.approverValue??null,slaMinutes:row.slaMinutes??null,escalationApproverType:row.escalationApproverType??null,escalationApproverValue:row.escalationApproverValue??null,timeoutAction:row.timeoutAction??'ESCALATE',startedAt:row.currentStepStartedAt?new Date(row.currentStepStartedAt):null,stepOrder:Number(row.currentStepOrder)},tx);visible.push(row)}catch{}}return visible;});
  }
  async myRequests(status='RETURNED'){
    const context=this.tenantContext.getContext(),actor=await this.actor();
    const allowed=new Set(['PENDING','APPROVED','REJECTED','RETURNED','CANCELLED']);
    const normalized=String(status??'RETURNED').trim().toUpperCase();
    if(!allowed.has(normalized))throw new BadRequestException('Geçersiz onay talebi durumu.');

    return this.prisma.$queryRaw<any[]>`
      SELECT
        r.id,
        r."workflowKey",
        r."workflowVersion",
        r.domain,
        r."entityType",
        r."entityId",
        r.status,
        r."currentStepOrder",
        r.reason,
        r.payload,
        r."createdAt",
        r."updatedAt",
        s."stepName" AS "currentStepName",
        s.status AS "currentStepStatus",
        latest_return.comment AS "correctionReason",
        latest_return."createdAt" AS "correctionRequestedAt"
      FROM approval_requests r
      LEFT JOIN approval_request_steps s
        ON s."requestId"=r.id
       AND s."stepOrder"=r."currentStepOrder"
      LEFT JOIN LATERAL (
        SELECT a.comment,a."createdAt"
        FROM approval_request_actions a
        WHERE a."requestId"=r.id
          AND a.action='RETURN'
        ORDER BY a."createdAt" DESC
        LIMIT 1
      ) latest_return ON TRUE
      WHERE r."tenantId"=${context.tenantId}
        AND r."companyId"=${context.companyId}
        AND r."requestedByUserId"=${actor}
        AND r.status=${normalized}
      ORDER BY r."updatedAt" DESC
      LIMIT 500
    `;
  }

  async act(id:string,decision:'APPROVE'|'REJECT'|'RETURN'|'DELEGATE'|'CANCEL',comment?:string,delegateToUserId?:string){
    const context=this.tenantContext.getContext(),actor=await this.actor(),note=String(comment??'').trim();
    if(['REJECT','RETURN'].includes(decision)&&!note)throw new BadRequestException(decision==='REJECT'?'Ret nedeni zorunludur.':'Düzeltmeye gönderme nedeni zorunludur.');
    if(decision==='DELEGATE'&&!delegateToUserId)throw new BadRequestException('Delegasyon yapılacak kullanıcı zorunludur.');
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<RequestRow[]>`SELECT * FROM approval_requests WHERE id=${id} AND "tenantId"=${context.tenantId} AND "companyId"=${context.companyId} FOR UPDATE`;
      const request=rows[0];if(!request)throw new NotFoundException('Onay talebi bulunamadı.');
      if(decision==='CANCEL'){if(!['PENDING','RETURNED'].includes(request.status))throw new BadRequestException('Tamamlanmış onay talebi iptal edilemez.');if(request.requestedByUserId!==actor)throw new BadRequestException('Talebi yalnız talep sahibi iptal edebilir.');await tx.$executeRaw`UPDATE approval_requests SET status='CANCELLED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${request.id}`;await this.recordAction(tx,context.tenantId,context.companyId,request.id,request.currentStepOrder,'CANCEL',actor,null,note||null);return{id:request.id,decision,success:true};}
      if(request.status!=='PENDING')throw new BadRequestException(request.status==='RETURNED'?'Bu kayıt düzeltme için talep sahibini bekliyor.':'Onay talebi daha önce tamamlanmış.');
      await this.assertSeparationOfDuties(actor,request,tx);
      const steps=await tx.$queryRaw<Array<{id:string;stepOrder:number;approverPermission:string|null;approverRoleSlug:string|null;approverType:string|null;approverValue:string|null;slaMinutes:number|null;escalationApproverType:string|null;escalationApproverValue:string|null;timeoutAction:string;startedAt:Date|null;status:string}>>`SELECT id,"stepOrder","approverPermission","approverRoleSlug","approverType","approverValue","slaMinutes","escalationApproverType","escalationApproverValue","timeoutAction","startedAt",status FROM approval_request_steps WHERE "requestId"=${request.id} AND "stepOrder"=${request.currentStepOrder} FOR UPDATE`;
      const step=steps[0];if(!step||step.status!=='PENDING')throw new BadRequestException('Mevcut onay adımı işleme uygun değil.');
      await this.assertApprover(actor,request,step,tx);
      if(decision==='DELEGATE'){const target=await tx.user.findUnique({where:{id:delegateToUserId!},select:{id:true}});if(!target)throw new BadRequestException('Delegasyon kullanıcısı bulunamadı.');await this.recordAction(tx,context.tenantId,context.companyId,request.id,step.stepOrder,'DELEGATE',actor,delegateToUserId!,note||null);return{id:request.id,decision,success:true};}
      if(decision==='REJECT'){
        await tx.$executeRaw`UPDATE approval_request_steps SET status='REJECTED',"actedByUserId"=${actor},"actedAt"=CURRENT_TIMESTAMP,comment=${note},"updatedAt"=CURRENT_TIMESTAMP WHERE id=${step.id}`;
        await tx.$executeRaw`UPDATE approval_requests SET status='REJECTED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${request.id}`;
        await this.recordAction(tx,context.tenantId,context.companyId,request.id,step.stepOrder,'REJECT',actor,null,note);
      }else if(decision==='RETURN'){
        await tx.$executeRaw`UPDATE approval_request_steps SET status='RETURNED',"actedByUserId"=${actor},"actedAt"=CURRENT_TIMESTAMP,comment=${note},"updatedAt"=CURRENT_TIMESTAMP WHERE id=${step.id}`;
        await tx.$executeRaw`UPDATE approval_requests SET status='RETURNED',"completedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${request.id}`;
        await this.recordAction(tx,context.tenantId,context.companyId,request.id,step.stepOrder,'RETURN',actor,null,note);
      }else{
        await tx.$executeRaw`UPDATE approval_request_steps SET status='APPROVED',"actedByUserId"=${actor},"actedAt"=CURRENT_TIMESTAMP,comment=${note||null},"updatedAt"=CURRENT_TIMESTAMP WHERE id=${step.id}`;
        const next=await tx.$queryRaw<Array<{id:string;stepOrder:number}>>`SELECT id,"stepOrder" FROM approval_request_steps WHERE "requestId"=${request.id} AND "stepOrder">${step.stepOrder} ORDER BY "stepOrder" LIMIT 1 FOR UPDATE`;
        if(next[0]){
          await tx.$executeRaw`UPDATE approval_request_steps SET status='PENDING',"startedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${next[0].id}`;
          await tx.$executeRaw`UPDATE approval_requests SET "currentStepOrder"=${next[0].stepOrder},"stepStartedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${request.id}`;
        }else{
          await tx.$executeRaw`UPDATE approval_requests SET status='APPROVED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${request.id}`;
          if(request.entityType==='hr_attendance_correction'){
            await this.applyApprovedAttendanceCorrection(request.entityId,request.tenantId,request.companyId,tx);
          }
        }
        await this.recordAction(tx,context.tenantId,context.companyId,request.id,step.stepOrder,'APPROVE',actor,null,note||null);
      }
      await this.audit.record({actorUserId:actor,resource:'approval_requests',action:decision.toLowerCase(),targetTenantId:context.tenantId,targetEntityType:request.entityType,targetEntityId:request.entityId,beforeState:{status:request.status,stepOrder:request.currentStepOrder},afterState:{decision,actedByUserId:actor,comment:note||null},metadata:{companyId:context.companyId,requestId:request.id,workflowKey:request.workflowKey}},tx);
      return{id:request.id,decision,success:true};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async resubmit(id:string,comment:string){
    const context=this.tenantContext.getContext(),actor=await this.actor(),note=String(comment??'').trim();
    if(!note)throw new BadRequestException('Düzeltme açıklaması zorunludur.');
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<RequestRow[]>`SELECT * FROM approval_requests WHERE id=${id} AND "tenantId"=${context.tenantId} AND "companyId"=${context.companyId} FOR UPDATE`;
      const request=rows[0];if(!request)throw new NotFoundException('Onay talebi bulunamadı.');
      if(request.requestedByUserId!==actor)throw new BadRequestException('Yalnız talep sahibi düzeltme sonrası yeniden gönderebilir.');
      if(request.status!=='RETURNED')throw new BadRequestException('Yalnız düzeltmeye gönderilmiş kayıt yeniden gönderilebilir.');
      await tx.$executeRaw`UPDATE approval_request_steps SET status='PENDING',"actedByUserId"=NULL,"actedAt"=NULL,comment=NULL,"startedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "requestId"=${request.id} AND "stepOrder"=${request.currentStepOrder}`;
      await tx.$executeRaw`UPDATE approval_requests SET status='PENDING',"stepStartedAt"=CURRENT_TIMESTAMP,"completedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE id=${request.id}`;
      await this.recordAction(tx,context.tenantId,context.companyId,request.id,request.currentStepOrder,'RESUBMIT',actor,null,note);
      await this.audit.record({actorUserId:actor,resource:'approval_requests',action:'resubmit',targetTenantId:context.tenantId,targetEntityType:request.entityType,targetEntityId:request.entityId,beforeState:{status:'RETURNED'},afterState:{status:'PENDING',comment:note},metadata:{companyId:context.companyId,requestId:request.id,workflowKey:request.workflowKey}},tx);
      return{id:request.id,status:'PENDING',currentStepOrder:request.currentStepOrder};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  private async applyApprovedAttendanceCorrection(correctionId:string,tenantId:string,companyId:string,tx:Prisma.TransactionClient){
    const rows=await tx.$queryRaw<Array<{attendanceRecordId:string;newValue:any}>>`
      SELECT attendance_record_id AS "attendanceRecordId",new_value AS "newValue"
      FROM hr_attendance_corrections
      WHERE id=${correctionId}
        AND tenant_id=${tenantId}
        AND company_id=${companyId}
      FOR UPDATE
    `;
    const correction=rows[0];
    if(!correction)throw new NotFoundException('Onaylanan puantaj düzeltme talebi bulunamadı.');

    const requested=correction.newValue??{};
    await tx.$executeRaw`
      UPDATE attendance_records
      SET check_in=${requested.checkIn??null},
          check_out=${requested.checkOut??null},
          status=${requested.status??'PRESENT'},
          note=${requested.note??null},
          late_minutes=${Number(requested.lateMinutes??0)},
          early_departure_minutes=${Number(requested.earlyDepartureMinutes??0)},
          missing_punch=${Boolean(requested.missingPunch)},
          absence=${Boolean(requested.absence)},
          exception_status='CORRECTED',
          updated_at=CURRENT_TIMESTAMP
      WHERE id=${correction.attendanceRecordId}
        AND tenant_id=${tenantId}
    `;
  }

  private async recordAction(tx:Prisma.TransactionClient,tenantId:string,companyId:string,requestId:string,stepOrder:number,action:string,actorUserId:string|null,delegateToUserId:string|null,comment:string|null){
    await tx.$executeRaw`INSERT INTO approval_request_actions(id,"tenantId","companyId","requestId","stepOrder",action,"actorUserId","delegateToUserId",comment,"createdAt") VALUES(${randomUUID()},${tenantId},${companyId},${requestId},${stepOrder},${action},${actorUserId},${delegateToUserId},${comment},CURRENT_TIMESTAMP)`;
  }
  private async assertSeparationOfDuties(actor:string,r:RequestRow,tx:Prisma.TransactionClient){
    const rows=await tx.$queryRaw<SodPolicyRow[]>`SELECT "requesterCannotApprove","requireDistinctApprovers",enabled FROM sod_policy_definitions WHERE "tenantId"=${r.tenantId} AND "companyId"=${r.companyId} AND domain=${r.domain} LIMIT 1`;
    const policy=rows[0];
    const requesterCannotApprove=policy?.enabled===false?false:(policy?.requesterCannotApprove??true);
    const requireDistinctApprovers=policy?.enabled===true&&(policy.requireDistinctApprovers??false);
    if(requesterCannotApprove&&r.requestedByUserId===actor) throw new ForbiddenException('Talep sahibi kendi talebini onaylayamaz.');
    if(requireDistinctApprovers){
      const prior=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM approval_request_steps WHERE "requestId"=${r.id} AND "stepOrder"<${r.currentStepOrder} AND "actedByUserId"=${actor} AND status='APPROVED' LIMIT 1`;
      if(prior.length) throw new ForbiddenException('Aynı kullanıcı birden fazla onay adımını onaylayamaz.');
    }
  }

  private async assertApprover(actor:string,r:RequestRow,s:{approverPermission:string|null;approverRoleSlug:string|null;approverType:string|null;approverValue:string|null;slaMinutes:number|null;escalationApproverType:string|null;escalationApproverValue:string|null;timeoutAction:string;startedAt:Date|null;stepOrder:number},tx:Prisma.TransactionClient){
    const requestDelegation=await tx.$queryRaw<Array<{delegateToUserId:string|null}>>`SELECT "delegateToUserId" FROM approval_request_actions WHERE "requestId"=${r.id} AND "stepOrder"=${s.stepOrder} AND action='DELEGATE' ORDER BY "createdAt" DESC LIMIT 1`;
    if(requestDelegation[0]?.delegateToUserId===actor)return;
    const type=s.approverType??(s.approverPermission?'PERMISSION':s.approverRoleSlug?'ROLE':null);
    const value=s.approverValue??s.approverPermission??s.approverRoleSlug??null;
    if(type&&await this.authorizedByType(actor,r,type,value,tx))return;
    const overdue=s.slaMinutes!=null&&s.startedAt!=null&&Date.now()>=s.startedAt.getTime()+s.slaMinutes*60_000;
    if(overdue&&s.timeoutAction==='ESCALATE'&&s.escalationApproverType&&await this.authorizedByType(actor,r,s.escalationApproverType,s.escalationApproverValue,tx))return;
    if(await this.authorizedByGlobalDelegation(actor,r,s,tx))return;
    throw new ForbiddenException('Bu onay adımı için yetkiniz bulunmuyor.');
  }

  private async authorizedByType(actor:string,r:RequestRow,type:string,value:string|null,tx:Prisma.TransactionClient){
    if(type==='USER')return value===actor;
    const membership=await tx.membership.findFirst({where:{userId:actor,tenantId:r.tenantId,companyId:r.companyId,status:'ACTIVE'},include:{role:true,branchAccesses:true}});
    if(!membership)return false;
    if(type==='ROLE')return membership.role.id===value||membership.role.slug===value;
    if(type==='PERMISSION'){const raw=String(value??'');const separator=raw.includes(':')?':':'.';const [resource,action]=raw.split(separator);if(!resource||!action)return false;return(await tx.rolePermission.count({where:{roleId:membership.roleId,permission:{resource,action}}}))>0;}
    if(type==='MANAGER'||type==='DIRECT_MANAGER')return this.directManagerAuthorized(actor,r,tx);
    if(type==='ORGANIZATION_MANAGER')return this.organizationManagerAuthorized(actor,r,value,tx);
    if(type==='BRANCH_MANAGER')return membership.role.slug==='branch-manager'&&this.membershipCoversBranch(membership,r.branchId);
    if(type==='REGIONAL_MANAGER')return membership.role.slug==='regional-manager'&&this.membershipCoversBranch(membership,r.branchId);
    if(type==='DEPARTMENT_MANAGER')return membership.role.slug==='department-manager'&&await this.sameDepartmentAsRequester(actor,r,tx);
    return false;
  }

  private membershipCoversBranch(m:{role:{scope:string};branchAccesses:Array<{branchId:string}>},branchId:string|null){if(!branchId)return m.role.scope!=='BRANCH';if(m.role.scope==='CENTRAL')return true;return m.branchAccesses.some(x=>x.branchId===branchId);}

  private async directManagerAuthorized(actor:string,r:RequestRow,tx:Prisma.TransactionClient){
    const rows=await tx.$queryRaw<Array<{ok:number}>>`SELECT 1 AS ok FROM hr_employee_user_links requester JOIN hr_employee_assignments a ON a.staff_id=requester.staff_id AND a.tenant_id=requester.tenant_id AND a.effective_from<=CURRENT_DATE AND(a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE) JOIN hr_employee_user_links manager ON manager.staff_id=a.manager_staff_id AND manager.tenant_id=a.tenant_id AND manager.active=TRUE WHERE requester.user_id=${r.requestedByUserId} AND requester.tenant_id=${r.tenantId} AND requester.active=TRUE AND manager.user_id=${actor} LIMIT 1`;
    return rows.length>0;
  }

  private async organizationManagerAuthorized(actor:string,r:RequestRow,value:string|null,tx:Prisma.TransactionClient){
    const level=Number(value);if(!Number.isInteger(level)||level<1||level>10)return false;
    const rows=await tx.$queryRaw<Array<{ok:number}>>`WITH RECURSIVE manager_chain AS (SELECT a.manager_staff_id AS staff_id,1 AS depth FROM hr_employee_user_links requester JOIN hr_employee_assignments a ON a.staff_id=requester.staff_id AND a.tenant_id=requester.tenant_id AND a.effective_from<=CURRENT_DATE AND(a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE) WHERE requester.user_id=${r.requestedByUserId} AND requester.tenant_id=${r.tenantId} AND requester.active=TRUE UNION ALL SELECT next_assignment.manager_staff_id,manager_chain.depth+1 FROM manager_chain JOIN hr_employee_assignments next_assignment ON next_assignment.staff_id=manager_chain.staff_id AND next_assignment.tenant_id=${r.tenantId} AND next_assignment.effective_from<=CURRENT_DATE AND(next_assignment.effective_to IS NULL OR next_assignment.effective_to>=CURRENT_DATE) WHERE manager_chain.staff_id IS NOT NULL AND manager_chain.depth<${level}) SELECT 1 AS ok FROM manager_chain JOIN hr_employee_user_links manager ON manager.staff_id=manager_chain.staff_id AND manager.tenant_id=${r.tenantId} AND manager.active=TRUE WHERE manager_chain.depth=${level} AND manager.user_id=${actor} LIMIT 1`;
    return rows.length>0;
  }

  private async sameDepartmentAsRequester(actor:string,r:RequestRow,tx:Prisma.TransactionClient){
    const rows=await tx.$queryRaw<Array<{ok:number}>>`SELECT 1 AS ok FROM hr_employee_user_links requester_link JOIN hr_employee_assignments requester_assignment ON requester_assignment.staff_id=requester_link.staff_id AND requester_assignment.tenant_id=requester_link.tenant_id AND requester_assignment.effective_from<=CURRENT_DATE AND(requester_assignment.effective_to IS NULL OR requester_assignment.effective_to>=CURRENT_DATE) JOIN hr_employee_user_links actor_link ON actor_link.user_id=${actor} AND actor_link.tenant_id=requester_link.tenant_id AND actor_link.active=TRUE JOIN hr_employee_assignments actor_assignment ON actor_assignment.staff_id=actor_link.staff_id AND actor_assignment.tenant_id=actor_link.tenant_id AND actor_assignment.effective_from<=CURRENT_DATE AND(actor_assignment.effective_to IS NULL OR actor_assignment.effective_to>=CURRENT_DATE) WHERE requester_link.user_id=${r.requestedByUserId} AND requester_link.tenant_id=${r.tenantId} AND requester_link.active=TRUE AND requester_assignment.department_id IS NOT NULL AND actor_assignment.department_id=requester_assignment.department_id LIMIT 1`;
    return rows.length>0;
  }

  private async authorizedByGlobalDelegation(actor:string,r:RequestRow,s:{approverPermission:string|null;approverRoleSlug:string|null;approverType:string|null;approverValue:string|null},tx:Prisma.TransactionClient){
    const roleValue=s.approverType==='ROLE'?s.approverValue:s.approverRoleSlug;
    const permissionValue=s.approverType==='PERMISSION'?s.approverValue:s.approverPermission;
    if(!roleValue&&!permissionValue)return false;
    const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT d.id FROM approval_delegations d JOIN memberships dm ON dm."userId"=d."delegatorUserId" JOIN roles dr ON dr.id=dm."roleId" WHERE d."tenantId"=${r.tenantId} AND d."companyId"=${r.companyId} AND d."delegateUserId"=${actor} AND d."revokedAt" IS NULL AND d."startsAt"<=CURRENT_TIMESTAMP AND d."endsAt">CURRENT_TIMESTAMP AND(d.domain IS NULL OR d.domain=${r.domain}) AND dm."tenantId"=d."tenantId" AND dm."companyId"=d."companyId" AND dm.status='ACTIVE' AND((${roleValue??null}::text IS NOT NULL AND(dr.slug=${roleValue??null} OR dr.id=${roleValue??null})) OR EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp."permissionId" WHERE rp."roleId"=dm."roleId" AND(${permissionValue??null}::text IS NOT NULL) AND(p.resource||'.'||p.action)=${permissionValue??null})) LIMIT 1`;
    return rows.length>0;
  }
  private normalizeStep(s:StepDef):StepDef{let type=String(s.approverType??'').toUpperCase()||undefined;let value=s.approverValue??null;if(!type&&s.approverPermission){type='PERMISSION';value=s.approverPermission}else if(!type&&s.approverRoleSlug){type='ROLE';value=s.approverRoleSlug}if(!type)throw new BadRequestException(`${s.name} adımında onaylayan tipi eksik.`);const noValue=['MANAGER','DIRECT_MANAGER','BRANCH_MANAGER','REGIONAL_MANAGER','DEPARTMENT_MANAGER'];if(!noValue.includes(type)&&!String(value??'').trim())throw new BadRequestException(`${s.name} adımında onaylayan değeri eksik.`);return{...s,approverType:type,approverValue:String(value??'').trim()||null,slaMinutes:s.slaMinutes==null?null:Math.max(1,Math.trunc(Number(s.slaMinutes))),escalationApproverType:s.escalationApproverType?String(s.escalationApproverType).toUpperCase():null,escalationApproverValue:String(s.escalationApproverValue??'').trim()||null,timeoutAction:String(s.timeoutAction??'ESCALATE').toUpperCase()}}
  private steps(v:unknown):StepDef[]{return Array.isArray(v)?v.filter((x):x is StepDef=>!!x&&typeof x==='object'&&typeof (x as StepDef).key==='string'&&typeof (x as StepDef).name==='string'):[]}
  private async actor(){const c=this.tenantContext.getContext();const m=await this.prisma.membership.findFirst({where:{id:c.membershipId,tenantId:c.tenantId,companyId:c.companyId,status:'ACTIVE'},select:{userId:true}});if(!m)throw new BadRequestException('Active membership is required');return m.userId;}
}
