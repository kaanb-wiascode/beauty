import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type FeedbackInput = {
  branchId:string;
  customerId:string;
  appointmentId?:string|null;
  serviceId?:string|null;
  staffId?:string|null;
  careEventId?:string|null;
  source:'MANUAL'|'POST_SERVICE'|'COMPLAINT'|'CUSTOMER_PORTAL'|'IMPORT';
  classification:'UNCLASSIFIED'|'POSITIVE'|'NEUTRAL'|'NEGATIVE'|'CRITICAL';
  overallRating?:number|null;
  comment?:string|null;
};

export type QualityCaseInput = {
  branchId:string;
  feedbackId?:string|null;
  careEventId?:string|null;
  customerId?:string|null;
  appointmentId?:string|null;
  serviceId?:string|null;
  staffId?:string|null;
  sourceType:'FEEDBACK'|'CARE_EVENT'|'MANUAL'|'INCIDENT';
  category:string;
  severity:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
  title:string;
  description?:string|null;
  assignedUserId?:string|null;
  slaDueAt?:string|null;
};

@Injectable()
export class QualityService {
  constructor(private readonly prisma:PrismaService,private readonly tenant:TenantContext){}

  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}
  private branchScopeSql(alias:string,position:number){return `($${position}::text IS NULL OR ${alias}.branch_id=$${position}::text)`;}

  private async assertBranch(branchId:string){
    const {tenantId,companyId,branchId:activeBranchId}=this.context();
    if(activeBranchId&&activeBranchId!==branchId) throw new BadRequestException('Branch is outside active branch scope.');
    const rows=await this.prisma.$queryRawUnsafe<any[]>(`SELECT b.id FROM branches b JOIN companies c ON c.id=b."companyId" WHERE b.id=$1::text AND c.id=$2::text AND c."tenantId"=$3::text LIMIT 1`,branchId,companyId,tenantId);
    if(!rows.length) throw new BadRequestException('Branch is outside tenant/company scope.');
  }

  private async assertReferences(input:{branchId:string;customerId?:string|null;appointmentId?:string|null;serviceId?:string|null;staffId?:string|null;careEventId?:string|null}){
    const {tenantId}=this.context();
    await this.assertBranch(input.branchId);
    if(input.customerId){
      const rows=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM customers WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text LIMIT 1`,input.customerId,tenantId,input.branchId);
      if(!rows.length) throw new BadRequestException('Customer is outside feedback scope.');
    }
    if(input.appointmentId){
      const rows=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id,"customerId","serviceId","staffId" FROM appointments WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text LIMIT 1`,input.appointmentId,tenantId,input.branchId);
      if(!rows.length) throw new BadRequestException('Appointment is outside feedback scope.');
      const a=rows[0];
      if(input.customerId&&a.customerId!==input.customerId) throw new BadRequestException('Appointment customer does not match feedback customer.');
      if(input.serviceId&&a.serviceId!==input.serviceId) throw new BadRequestException('Appointment service does not match feedback service.');
      if(input.staffId&&a.staffId!==input.staffId) throw new BadRequestException('Appointment staff does not match feedback staff.');
    }
    if(input.serviceId){
      const rows=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM services WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text LIMIT 1`,input.serviceId,tenantId,input.branchId);
      if(!rows.length) throw new BadRequestException('Service is outside feedback scope.');
    }
    if(input.staffId){
      const rows=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM staff WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text LIMIT 1`,input.staffId,tenantId,input.branchId);
      if(!rows.length) throw new BadRequestException('Staff is outside feedback scope.');
    }
    if(input.careEventId){
      const rows=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id,"customerId" FROM customer_care_events WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text LIMIT 1`,input.careEventId,tenantId,input.branchId);
      if(!rows.length) throw new BadRequestException('Customer care event is outside feedback scope.');
      if(input.customerId&&rows[0].customerId!==input.customerId) throw new BadRequestException('Customer care event customer does not match.');
    }
  }

  async createFeedback(input:FeedbackInput,userId:string){
    if(input.overallRating!=null&&(!Number.isInteger(input.overallRating)||input.overallRating<1||input.overallRating>5)) throw new BadRequestException('overallRating must be an integer from 1 to 5.');
    await this.assertReferences(input);
    const {tenantId,companyId}=this.context();
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO customer_feedback(tenant_id,company_id,branch_id,customer_id,appointment_id,service_id,staff_id,care_event_id,source,classification,overall_rating,comment,created_by_user_id)
       VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9,$10,$11,$12,$13::text)
       RETURNING id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",customer_id AS "customerId",appointment_id AS "appointmentId",service_id AS "serviceId",staff_id AS "staffId",care_event_id AS "careEventId",source,classification,overall_rating AS "overallRating",comment,submitted_at AS "submittedAt"`,
      tenantId,companyId,input.branchId,input.customerId,input.appointmentId??null,input.serviceId??null,input.staffId??null,input.careEventId??null,input.source,input.classification,input.overallRating??null,input.comment?.trim()||null,userId);
    return rows[0];
  }

  async listFeedback(filters:{classification?:string;customerId?:string;limit?:number}){
    const {tenantId,companyId,branchId}=this.context(); const limit=Math.min(Math.max(filters.limit??50,1),200);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT f.id,f.branch_id AS "branchId",b.name AS "branchName",f.customer_id AS "customerId",c."firstName",c."lastName",f.appointment_id AS "appointmentId",f.service_id AS "serviceId",s.name AS "serviceName",f.staff_id AS "staffId",f.source,f.classification,f.overall_rating AS "overallRating",f.comment,f.submitted_at AS "submittedAt",
              qc.id AS "qualityCaseId",qc.status AS "qualityCaseStatus",qc.severity AS "qualityCaseSeverity"
       FROM customer_feedback f
       JOIN branches b ON b.id=f.branch_id JOIN customers c ON c.id=f.customer_id
       LEFT JOIN services s ON s.id=f.service_id LEFT JOIN quality_cases qc ON qc.feedback_id=f.id
       WHERE f.tenant_id=$1::text AND f.company_id=$2::text AND ${this.branchScopeSql('f',3)}
         AND ($4::text IS NULL OR f.classification=$4) AND ($5::text IS NULL OR f.customer_id=$5::text)
       ORDER BY f.submitted_at DESC LIMIT $6`,tenantId,companyId,branchId,filters.classification??null,filters.customerId??null,limit);
  }

  async createCase(input:QualityCaseInput,userId:string){
    const cleanCategory=input.category?.trim(); const cleanTitle=input.title?.trim();
    if(!cleanCategory) throw new BadRequestException('Quality case category is required.');
    if(!cleanTitle) throw new BadRequestException('Quality case title is required.');
    await this.assertReferences(input);
    const {tenantId,companyId}=this.context();
    if(input.feedbackId){
      const feedback=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id,branch_id AS "branchId",customer_id AS "customerId",appointment_id AS "appointmentId",service_id AS "serviceId",staff_id AS "staffId",care_event_id AS "careEventId" FROM customer_feedback WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text LIMIT 1`,input.feedbackId,tenantId,companyId,input.branchId);
      if(!feedback.length) throw new BadRequestException('Feedback is outside quality scope.');
      const existing=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id,status FROM quality_cases WHERE feedback_id=$1::text AND tenant_id=$2::text AND company_id=$3::text LIMIT 1`,input.feedbackId,tenantId,companyId);
      if(existing.length) return {...existing[0],duplicate:true};
      input={...input,customerId:input.customerId??feedback[0].customerId,appointmentId:input.appointmentId??feedback[0].appointmentId,serviceId:input.serviceId??feedback[0].serviceId,staffId:input.staffId??feedback[0].staffId,careEventId:input.careEventId??feedback[0].careEventId};
    }
    const due=input.slaDueAt?new Date(input.slaDueAt):null; if(due&&Number.isNaN(due.getTime())) throw new BadRequestException('slaDueAt is invalid.');
    return this.prisma.$transaction(async tx=>{
      if(input.feedbackId){
        const existing=await tx.$queryRawUnsafe<any[]>(`SELECT id,status FROM quality_cases WHERE feedback_id=$1::text AND tenant_id=$2::text AND company_id=$3::text FOR UPDATE`,input.feedbackId,tenantId,companyId);
        if(existing.length) return {...existing[0],duplicate:true};
      }
      const rows=await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO quality_cases(tenant_id,company_id,branch_id,feedback_id,care_event_id,customer_id,appointment_id,service_id,staff_id,source_type,category,severity,status,title,description,assigned_user_id,sla_due_at,created_by_user_id,updated_by_user_id)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10,$11,$12,'OPEN',$13,$14,$15::text,$16,$17::text,$17::text)
         RETURNING id,status,severity,branch_id AS "branchId",feedback_id AS "feedbackId",customer_id AS "customerId",assigned_user_id AS "assignedUserId",sla_due_at AS "slaDueAt",created_at AS "createdAt"`,
        tenantId,companyId,input.branchId,input.feedbackId??null,input.careEventId??null,input.customerId??null,input.appointmentId??null,input.serviceId??null,input.staffId??null,input.sourceType,cleanCategory,input.severity,cleanTitle,input.description?.trim()||null,input.assignedUserId??null,due,userId);
      const created=rows[0];
      await tx.$executeRawUnsafe(`INSERT INTO quality_case_events(case_id,tenant_id,company_id,branch_id,event_type,to_status,assigned_user_id,actor_user_id,note) VALUES($1::text,$2::text,$3::text,$4::text,'CREATED','OPEN',$5::text,$6::text,$7)`,created.id,tenantId,companyId,input.branchId,input.assignedUserId??null,userId,input.description?.trim()||null);
      return {...created,duplicate:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async escalateFeedback(feedbackId:string,userId:string,input:{category:string;severity:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';title?:string;assignedUserId?:string|null;slaDueAt?:string|null}){
    const {tenantId,companyId,branchId}=this.context();
    const rows=await this.prisma.$queryRawUnsafe<any[]>(`SELECT f.id,f.branch_id AS "branchId",f.customer_id AS "customerId",f.appointment_id AS "appointmentId",f.service_id AS "serviceId",f.staff_id AS "staffId",f.care_event_id AS "careEventId",f.comment FROM customer_feedback f WHERE f.id=$1::text AND f.tenant_id=$2::text AND f.company_id=$3::text AND ($4::text IS NULL OR f.branch_id=$4::text) LIMIT 1`,feedbackId,tenantId,companyId,branchId);
    if(!rows.length) throw new NotFoundException('Feedback not found.'); const f=rows[0];
    return this.createCase({branchId:f.branchId,feedbackId,careEventId:f.careEventId,customerId:f.customerId,appointmentId:f.appointmentId,serviceId:f.serviceId,staffId:f.staffId,sourceType:'FEEDBACK',category:input.category,severity:input.severity,title:input.title?.trim()||'Müşteri geri bildirimi kalite incelemesi',description:f.comment,assignedUserId:input.assignedUserId,slaDueAt:input.slaDueAt},userId);
  }

  async listCases(filters:{status?:string;severity?:string;assignedUserId?:string;limit?:number}){
    const {tenantId,companyId,branchId}=this.context(); const limit=Math.min(Math.max(filters.limit??50,1),200);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT q.id,q.branch_id AS "branchId",b.name AS "branchName",q.feedback_id AS "feedbackId",q.customer_id AS "customerId",c."firstName",c."lastName",q.category,q.severity,q.status,q.title,q.description,q.assigned_user_id AS "assignedUserId",q.sla_due_at AS "slaDueAt",q.root_cause AS "rootCause",q.corrective_action AS "correctiveAction",q.preventive_action AS "preventiveAction",q.resolution,q.customer_follow_up AS "customerFollowUp",q.opened_at AS "openedAt",q.resolved_at AS "resolvedAt",q.closed_at AS "closedAt",q.created_at AS "createdAt"
       FROM quality_cases q JOIN branches b ON b.id=q.branch_id LEFT JOIN customers c ON c.id=q.customer_id
       WHERE q.tenant_id=$1::text AND q.company_id=$2::text AND ${this.branchScopeSql('q',3)}
         AND ($4::text IS NULL OR q.status=$4) AND ($5::text IS NULL OR q.severity=$5) AND ($6::text IS NULL OR q.assigned_user_id=$6::text)
       ORDER BY CASE q.severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC,q.created_at DESC LIMIT $7`,tenantId,companyId,branchId,filters.status??null,filters.severity??null,filters.assignedUserId??null,limit);
  }

  async getCase(id:string){
    const {tenantId,companyId,branchId}=this.context();
    const rows=await this.prisma.$queryRawUnsafe<any[]>(`SELECT * FROM quality_cases q WHERE q.id=$1::text AND q.tenant_id=$2::text AND q.company_id=$3::text AND ${this.branchScopeSql('q',4)} LIMIT 1`,id,tenantId,companyId,branchId);
    if(!rows.length) throw new NotFoundException('Quality case not found.');
    const events=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id,event_type AS "eventType",from_status AS "fromStatus",to_status AS "toStatus",assigned_user_id AS "assignedUserId",note,actor_user_id AS "actorUserId",created_at AS "createdAt" FROM quality_case_events WHERE case_id=$1::text AND tenant_id=$2::text AND company_id=$3::text ORDER BY created_at ASC`,id,tenantId,companyId);
    return{...rows[0],events};
  }

  async assign(id:string,assignedUserId:string|null,userId:string,note?:string){
    return this.mutateCase(id,userId,async(tx,q,ctx)=>{
      await tx.$executeRawUnsafe(`UPDATE quality_cases SET assigned_user_id=$2::text,updated_by_user_id=$3::text,updated_at=NOW() WHERE id=$1::text`,id,assignedUserId,userId);
      await tx.$executeRawUnsafe(`INSERT INTO quality_case_events(case_id,tenant_id,company_id,branch_id,event_type,from_status,to_status,assigned_user_id,note,actor_user_id) VALUES($1::text,$2::text,$3::text,$4::text,'ASSIGNED',$5,$5,$6::text,$7,$8::text)`,id,ctx.tenantId,ctx.companyId,q.branchId,q.status,assignedUserId,note?.trim()||null,userId);
      return{id,status:q.status,assignedUserId};
    });
  }

  async transition(id:string,toStatus:'INVESTIGATING'|'ACTION_REQUIRED'|'RESOLVED'|'CLOSED',userId:string,input:{rootCause?:string;correctiveAction?:string;preventiveAction?:string;resolution?:string;customerFollowUp?:string;note?:string}){
    return this.mutateCase(id,userId,async(tx,q,ctx)=>{
      const allowed:Record<string,string[]>={OPEN:['INVESTIGATING'],INVESTIGATING:['ACTION_REQUIRED','RESOLVED'],ACTION_REQUIRED:['RESOLVED'],RESOLVED:['CLOSED'],CLOSED:[]};
      if(!allowed[q.status]?.includes(toStatus)) throw new BadRequestException(`Invalid quality transition ${q.status} -> ${toStatus}.`);
      if(toStatus==='RESOLVED'){
        if((input.rootCause??'').trim().length<3) throw new BadRequestException('Root cause is required to resolve a quality case.');
        if((input.correctiveAction??'').trim().length<3) throw new BadRequestException('Corrective action is required to resolve a quality case.');
        if((input.resolution??'').trim().length<3) throw new BadRequestException('Resolution is required to resolve a quality case.');
      }
      if(toStatus==='CLOSED'&&!q.resolution&&!input.resolution) throw new BadRequestException('Resolved quality case requires a resolution before close.');
      const timestampColumn=toStatus==='INVESTIGATING'?'investigating_at':toStatus==='ACTION_REQUIRED'?'action_required_at':toStatus==='RESOLVED'?'resolved_at':'closed_at';
      await tx.$executeRawUnsafe(`UPDATE quality_cases SET status=$2,root_cause=COALESCE($3,root_cause),corrective_action=COALESCE($4,corrective_action),preventive_action=COALESCE($5,preventive_action),resolution=COALESCE($6,resolution),customer_follow_up=COALESCE($7,customer_follow_up),${timestampColumn}=NOW(),updated_by_user_id=$8::text,updated_at=NOW() WHERE id=$1::text`,id,toStatus,input.rootCause?.trim()||null,input.correctiveAction?.trim()||null,input.preventiveAction?.trim()||null,input.resolution?.trim()||null,input.customerFollowUp?.trim()||null,userId);
      await tx.$executeRawUnsafe(`INSERT INTO quality_case_events(case_id,tenant_id,company_id,branch_id,event_type,from_status,to_status,assigned_user_id,note,actor_user_id) VALUES($1::text,$2::text,$3::text,$4::text,'STATUS_CHANGED',$5,$6,$7::text,$8,$9::text)`,id,ctx.tenantId,ctx.companyId,q.branchId,q.status,toStatus,q.assignedUserId,input.note?.trim()||null,userId);
      return{id,fromStatus:q.status,status:toStatus};
    });
  }

  private async mutateCase<T>(id:string,userId:string,fn:(tx:Prisma.TransactionClient,q:any,ctx:{tenantId:string;companyId:string})=>Promise<T>){
    const {tenantId,companyId,branchId}=this.context();
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRawUnsafe<any[]>(`SELECT id,status,branch_id AS "branchId",assigned_user_id AS "assignedUserId",resolution FROM quality_cases WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id=$4::text) FOR UPDATE`,id,tenantId,companyId,branchId);
      if(!rows.length) throw new NotFoundException('Quality case not found.');
      return fn(tx,rows[0],{tenantId,companyId});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
}
