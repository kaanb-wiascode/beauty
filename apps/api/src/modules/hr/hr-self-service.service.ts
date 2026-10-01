import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { Employee360Service } from './employee-360.service';
import { LeavePolicyService } from './leave-policy.service';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';

@Injectable()
export class HrSelfServiceService {
 constructor(private readonly prisma:PrismaService,private readonly ctx:TenantContext,private readonly employee360:Employee360Service,private readonly leave:LeavePolicyService,private readonly approvals:ApprovalWorkflowService,private readonly approvalRuntime:ApprovalRuntimeService){}
 private scope(){const tenantId=this.ctx.getTenantId(),companyId=this.ctx.getCompanyId();if(!tenantId||!companyId)throw new BadRequestException('Tenant and company context are required.');return{tenantId,companyId};}
 private istanbulWorkDate(date:Date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const year=parts.find(part=>part.type==='year')?.value,month=parts.find(part=>part.type==='month')?.value,day=parts.find(part=>part.type==='day')?.value;if(!year||!month||!day)throw new BadRequestException('Puantaj iş günü hesaplanamadı.');return `${year}-${month}-${day}`;}
 private async employee(userId:string){const{tenantId,companyId}=this.scope();const rows=await this.prisma.$queryRawUnsafe<any[]>(`SELECT s.id,s."branchId" AS "branchId",s."firstName" AS "firstName",s."lastName" AS "lastName",s.email,s.status FROM hr_employee_user_links l JOIN staff s ON s.id=l.staff_id JOIN branches b ON b.id=s."branchId" WHERE l.tenant_id=$1 AND l.company_id=$2 AND l.user_id=$3 AND l.active=TRUE AND s."tenantId"=$1 AND b."companyId"=$2 LIMIT 1`,tenantId,companyId,userId);if(!rows.length)throw new NotFoundException('Employee identity is not linked to this user.');return rows[0];}
 async link(staffId:string,userId:string,actorId:string){const{tenantId,companyId}=this.scope();const staff=await this.prisma.staff.findFirst({where:{id:staffId,tenantId,branch:{companyId}},select:{id:true}});const user=await this.prisma.user.findFirst({where:{id:userId,memberships:{some:{tenantId,companyId,status:'ACTIVE'}}},select:{id:true}});if(!staff||!user)throw new NotFoundException('Staff or user not found in organization scope.');await this.prisma.$executeRawUnsafe(`INSERT INTO hr_employee_user_links(tenant_id,company_id,staff_id,user_id,linked_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,staff_id) DO UPDATE SET user_id=EXCLUDED.user_id,company_id=EXCLUDED.company_id,active=TRUE,linked_at=CURRENT_TIMESTAMP,linked_by=EXCLUDED.linked_by`,tenantId,companyId,staffId,userId,actorId);return{staffId,userId,active:true};}
 async employeeHome(userId:string){
  const employee=await this.employee(userId),year=new Date().getFullYear(),types=await this.leave.leaveTypes(),leaveBalances:any[]=[];
  for(const type of types.filter((x:any)=>x.active)){try{leaveBalances.push({...await this.leave.balance(employee.id,type.id,year),code:type.code,name:type.name});}catch{}}
  const{tenantId,companyId}=this.scope();
  const shifts=await this.prisma.$queryRawUnsafe<any[]>(
   `SELECT sh.id,sh.start_at AS "startAt",sh.end_at AS "endAt",sh.status
    FROM hr_shift_assignments a
    JOIN hr_scheduled_shifts sh ON sh.id=a.scheduled_shift_id
    WHERE a.tenant_id=$1 AND a.staff_id=$2 AND sh.start_at>=CURRENT_TIMESTAMP
    ORDER BY sh.start_at LIMIT 20`,
   tenantId,employee.id,
  );
  const attendanceToday=await this.prisma.$queryRawUnsafe<any[]>(
   `SELECT
      e.id,
      e.event_type AS "eventType",
      e.occurred_at AS "occurredAt",
      e.source,
      r.id AS "approvalRequestId",
      r.status AS "approvalStatus",
      s."stepName" AS "currentStepName",
      s."slaMinutes" AS "slaMinutes",
      CASE
        WHEN s."slaMinutes" IS NULL OR s."startedAt" IS NULL THEN NULL
        ELSE s."startedAt"+(s."slaMinutes"*INTERVAL '1 minute')
      END AS "dueAt"
    FROM hr_attendance_events e
    LEFT JOIN approval_requests r
      ON r."tenantId"=e.tenant_id
     AND r."companyId"=e.company_id
     AND r."entityType"='hr_attendance_event'
     AND r."entityId"=e.id
    LEFT JOIN approval_request_steps s
      ON s."requestId"=r.id
     AND s."stepOrder"=r."currentStepOrder"
    WHERE e.tenant_id=$1
      AND e.company_id=$2
      AND e.staff_id=$3
      AND ((e.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date
    ORDER BY e.occurred_at DESC,e.id DESC`,
   tenantId,companyId,employee.id,
  );
  return{
   employee,
   profile:await this.employee360.get(employee.id),
   leaveBalances,
   leaveRequests:await this.leave.requests(employee.id),
   upcomingShifts:shifts,
   attendanceToday,
  };
 }
 async payrollStatus(userId:string){
  const employee=await this.employee(userId),{tenantId,companyId}=this.scope();
  const rows=await this.prisma.$queryRawUnsafe<any[]>(
   `SELECT pp.id AS "periodId",pp.year,pp.month,pp.status AS "periodStatus",
           pi.net_amount AS "netAmount",q.amount_due AS "amountDue",
           q.amount_paid AS "amountPaid",q.remaining_amount AS "remainingAmount",
           q.status AS "paymentStatus",q.paid_at AS "paidAt"
    FROM payroll_items pi
    JOIN payroll_periods pp ON pp.id=pi.period_id
    LEFT JOIN hr_payroll_payment_queue q
      ON q.period_id=pi.period_id AND q.staff_id=pi.staff_id
    WHERE pi.tenant_id=$1::text AND pi.company_id=$2::text AND pi.staff_id=$3::text
    ORDER BY pp.year DESC,pp.month DESC
    LIMIT 12`,
   tenantId,companyId,employee.id,
  );
  return rows;
 }
 async notifications(userId:string){
  const employee=await this.employee(userId),{tenantId,companyId}=this.scope();
  return this.prisma.$queryRawUnsafe<any[]>(
   `SELECT id,type,title,message,reference_type AS "referenceType",reference_id AS "referenceId",
           read_at AS "readAt",created_at AS "createdAt"
    FROM hr_employee_notifications
    WHERE tenant_id=$1::text AND company_id=$2::text AND staff_id=$3::text
    ORDER BY created_at DESC
    LIMIT 50`,
   tenantId,companyId,employee.id,
  );
 }
 async markNotificationRead(userId:string,notificationId:string){
  const employee=await this.employee(userId),{tenantId,companyId}=this.scope();
  const updated=await this.prisma.$executeRawUnsafe(
   `UPDATE hr_employee_notifications
    SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP)
    WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND staff_id=$4::text`,
   notificationId,tenantId,companyId,employee.id,
  );
  if(updated!==1)throw new NotFoundException('Bildirim bulunamadı.');
  return{id:notificationId,read:true};
 }
 async markAllNotificationsRead(userId:string){
  const employee=await this.employee(userId),{tenantId,companyId}=this.scope();
  const updated=await this.prisma.$executeRawUnsafe(
   `UPDATE hr_employee_notifications
    SET read_at=CURRENT_TIMESTAMP
    WHERE tenant_id=$1::text AND company_id=$2::text AND staff_id=$3::text AND read_at IS NULL`,
   tenantId,companyId,employee.id,
  );
  return{updated:Number(updated)};
 }
 async requestLeave(userId:string,body:any){const employee=await this.employee(userId),request=await this.leave.request(employee.id,body);try{await this.approvals.submit({entityType:'LEAVE',entityId:request.id,branchId:employee.branchId,requesterId:userId});}catch(error){if(!(error instanceof NotFoundException))throw error;}return request;}
 private async ensureAttendanceApprovalWorkflow(
  tx:Prisma.TransactionClient,
  userId:string,
  workflowKey:'hr.attendance-clock'|'hr.attendance-break',
 ){
  const{tenantId,companyId}=this.scope();
  const slaMinutes=workflowKey==='hr.attendance-clock'?15:2;
  const name=workflowKey==='hr.attendance-clock'?'Puantaj Giriş/Çıkış Onayı':'Puantaj Mola Onayı';
  const description=workflowKey==='hr.attendance-clock'
   ?'Güne başlama ve günü bitirme hareketleri için varsayılan yönetici onayı.'
   :'Mola başlangıç ve bitiş hareketleri için varsayılan yönetici onayı.';
  const lockKey=`${tenantId}:${companyId}:${workflowKey}:default-workflow`;
  await tx.$queryRaw`WITH lock_guard AS (SELECT pg_advisory_xact_lock(hashtext(${lockKey}))) SELECT 1 AS locked FROM lock_guard`;

  const published=await tx.$queryRaw<Array<{id:string}>>`
   SELECT id
   FROM approval_workflow_definitions
   WHERE "tenantId"=${tenantId}
     AND "companyId"=${companyId}
     AND "workflowKey"=${workflowKey}
     AND status='PUBLISHED'
   LIMIT 1
  `;
  if(published.length)return;

  const versions=await tx.$queryRaw<Array<{version:number}>>`
   SELECT COALESCE(MAX(version),0)::int AS version
   FROM approval_workflow_definitions
   WHERE "tenantId"=${tenantId}
     AND "companyId"=${companyId}
     AND "workflowKey"=${workflowKey}
  `;
  const version=Number(versions[0]?.version??0)+1;
  const steps=[{
   key:'manager-approval',
   name:'Yönetici Onayı',
   approverType:'DIRECT_MANAGER',
   approverValue:null,
   slaMinutes,
   timeoutAction:'ESCALATE',
   escalationApproverType:'BRANCH_MANAGER',
   escalationApproverValue:null,
  }];

  await tx.$executeRaw`
   INSERT INTO approval_workflow_definitions(
    id,"tenantId","companyId","workflowKey",name,domain,description,
    version,status,conditions,steps,"createdByUserId","publishedAt","createdAt","updatedAt"
   ) VALUES(
    gen_random_uuid()::text,${tenantId},${companyId},${workflowKey},${name},'hr',${description},
    ${version},'PUBLISHED','{}'::jsonb,${JSON.stringify(steps)}::jsonb,${userId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
   )
  `;
 }
 async recordAttendanceEvent(userId:string,eventType:'CLOCK_IN'|'BREAK_START'|'BREAK_END'|'CLOCK_OUT',deviceContext?:Record<string,unknown>){
  const employee=await this.employee(userId),{tenantId,companyId}=this.scope();
  const storedType=eventType==='CLOCK_IN'?'DAY_START':eventType==='CLOCK_OUT'?'DAY_END':eventType;
  return this.prisma.$transaction(async(tx)=>{
   await tx.$queryRawUnsafe(`WITH lock_guard AS (SELECT pg_advisory_xact_lock(hashtext($1))) SELECT 1 AS locked FROM lock_guard`,`${tenantId}:${employee.id}:attendance`);

   const today=await tx.$queryRawUnsafe<Array<{eventType:string;occurredAt:Date}>>(
    `SELECT e.event_type AS "eventType",e.occurred_at AS "occurredAt"
     FROM hr_attendance_events e
     JOIN approval_requests r
       ON r."tenantId"=e.tenant_id
      AND r."companyId"=e.company_id
      AND r."entityType"='hr_attendance_event'
      AND r."entityId"=e.id
      AND r.status IN ('PENDING','APPROVED')
     WHERE e.tenant_id=$1
       AND e.company_id=$2
       AND e.staff_id=$3
       AND ((e.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date
     ORDER BY e.occurred_at,e.id`,
    tenantId,
    companyId,
    employee.id,
   );

   const last=today.at(-1)?.eventType??null;
   if(today.some((event)=>event.eventType==='DAY_END')){
    throw new BadRequestException('Bugünkü çalışma günü zaten tamamlanmış.');
   }

   if(storedType==='DAY_START'&&today.length>0){
    throw new BadRequestException('Bugünkü çalışma günü zaten başlatılmış.');
   }
   if(storedType==='BREAK_START'&&!['DAY_START','BREAK_END'].includes(String(last))){
    throw new BadRequestException(last==='BREAK_START'?'Zaten moladasınız.':'Molaya çıkmadan önce güne başlamalısınız.');
   }
   if(storedType==='BREAK_END'&&last!=='BREAK_START'){
    throw new BadRequestException('Moladan dönmek için önce aktif bir mola başlatmalısınız.');
   }
   if(storedType==='DAY_END'&&!['DAY_START','BREAK_END'].includes(String(last))){
    throw new BadRequestException(last==='BREAK_START'?'Günü bitirmeden önce moladan dönmelisiniz.':'Günü bitirmeden önce güne başlamalısınız.');
   }

   const rows=await tx.$queryRawUnsafe<any[]>(
    `INSERT INTO hr_attendance_events(
       tenant_id,company_id,branch_id,staff_id,actor_user_id,event_type,source,device_context
     ) VALUES($1,$2,$3,$4,$5,$6,'SELF_SERVICE',$7::jsonb)
     RETURNING id,event_type AS "eventType",occurred_at AS "occurredAt",source`,
    tenantId,
    companyId,
    employee.branchId,
    employee.id,
    userId,
    storedType,
    JSON.stringify(deviceContext??{}),
   );

   const event=rows[0];
   const workflowKey:'hr.attendance-clock'|'hr.attendance-break'=['DAY_START','DAY_END'].includes(storedType)?'hr.attendance-clock':'hr.attendance-break';
   await this.ensureAttendanceApprovalWorkflow(tx,userId,workflowKey);
   const approval=await this.approvalRuntime.createWithinTransaction({
    workflowKey,
    entityType:'hr_attendance_event',
    entityId:event.id,
    branchId:employee.branchId,
    reason:eventType==='CLOCK_IN'
     ?'Güne başlama kaydı'
     :eventType==='CLOCK_OUT'
      ?'Günü bitirme kaydı'
      :eventType==='BREAK_START'
       ?'Mola başlangıç kaydı'
       :'Mola bitiş kaydı',
    payload:{
     eventType,
     storedType,
     occurredAt:event.occurredAt,
     staffId:employee.id,
     branchId:employee.branchId,
    },
   },tx);

   const dayEvents=await tx.$queryRawUnsafe<Array<{eventType:string;occurredAt:Date}>>(
    `SELECT e.event_type AS "eventType",e.occurred_at AS "occurredAt"
     FROM hr_attendance_events e
     JOIN approval_requests r
       ON r."tenantId"=e.tenant_id
      AND r."companyId"=e.company_id
      AND r."entityType"='hr_attendance_event'
      AND r."entityId"=e.id
      AND r.status IN ('PENDING','APPROVED')
     WHERE e.tenant_id=$1
       AND e.company_id=$2
       AND e.staff_id=$3
       AND ((e.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date
     ORDER BY e.occurred_at,e.id`,
    tenantId,
    companyId,
    employee.id,
   );

   const checkIn=dayEvents.find((item)=>item.eventType==='DAY_START')?.occurredAt??null;
   const checkOut=[...dayEvents].reverse().find((item)=>item.eventType==='DAY_END')?.occurredAt??null;
   let breakStartedAt:Date|null=null;
   let breakMinutes=0;
   for(const item of dayEvents){
    if(item.eventType==='BREAK_START'){
     breakStartedAt=item.occurredAt;
    }else if(item.eventType==='BREAK_END'&&breakStartedAt){
     breakMinutes+=Math.max(0,Math.floor((item.occurredAt.getTime()-breakStartedAt.getTime())/60000));
     breakStartedAt=null;
    }
   }

   const projectionEnd=checkOut??dayEvents.at(-1)?.occurredAt??checkIn;
   const workedMinutes=checkIn&&projectionEnd
    ?Math.max(0,Math.floor((projectionEnd.getTime()-checkIn.getTime())/60000)-breakMinutes)
    :0;



   return{
    id:event.id,
    type:eventType,
    occurredAt:event.occurredAt,
    source:event.source,
    staffId:employee.id,
    branchId:employee.branchId,
    approvalRequestId:approval.id,
    approvalStatus:'PENDING',
    effective:false,
    attendance:{
     workDate:this.istanbulWorkDate(new Date(event.occurredAt)),
     checkIn,
     checkOut,
     breakMinutes,
     workedMinutes,
    },
   };
  });
 }
 async managerHome(userId:string){const manager=await this.employee(userId),{tenantId,companyId}=this.scope();const team=await this.prisma.$queryRawUnsafe<any[]>(`SELECT s.id,s."firstName" AS "firstName",s."lastName" AS "lastName",s.email,s.status,a.position_id AS "positionId",a.department_id AS "departmentId",a.team_id AS "teamId" FROM hr_employee_assignments a JOIN staff s ON s.id=a.staff_id JOIN branches b ON b.id=s."branchId" WHERE a.tenant_id=$1 AND a.company_id=$2 AND a.manager_staff_id=$3 AND b."companyId"=$2 AND a.effective_from<=CURRENT_DATE AND(a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE) ORDER BY s."firstName",s."lastName"`,tenantId,companyId,manager.id);const ids=team.map((x:any)=>x.id);const pendingLeaves=ids.length?await this.prisma.$queryRawUnsafe<any[]>(`SELECT r.id,r.staff_id AS "staffId",r.start_date::text AS "startDate",r.end_date::text AS "endDate",r.days::text,r.status,t.name AS "leaveType" FROM leave_requests r LEFT JOIN hr_leave_types t ON t.id=r.leave_type_id WHERE r.tenant_id=$1 AND r.staff_id=ANY($2::text[]) AND r.status='PENDING' ORDER BY r.created_at`,tenantId,ids):[];const leaveIds=new Set(pendingLeaves.map((x:any)=>x.id));const approvalQueue=(await this.approvals.queue('PENDING')).filter((x:any)=>x.entityType==='LEAVE'&&leaveIds.has(x.entityId));return{manager,team,pendingLeaves,approvalQueue};}
}
