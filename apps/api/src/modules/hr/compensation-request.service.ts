import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';

@Injectable()
export class CompensationRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
    private readonly approvalRuntime: ApprovalRuntimeService,
  ) {}

  private async context(){
    const tenantId=this.tenant.getTenantId(),companyId=this.tenant.getCompanyId();
    const scope=await this.organizationScope.getBranchScopedWhere();
    const branchIds='branchId' in scope?(typeof scope.branchId==='string'?[scope.branchId]:scope.branchId.in):null;
    return {tenantId,companyId,branchIds};
  }

  private async ensureWorkflow(tx:Prisma.TransactionClient,userId:string){
    const {tenantId,companyId}=await this.context();
    const workflowKey='hr.compensation-request-approval';
    const lockKey=`${tenantId}:${companyId}:${workflowKey}:default-workflow`;
    await tx.$queryRaw`WITH lock_guard AS (SELECT pg_advisory_xact_lock(hashtext(${lockKey}))) SELECT 1 AS locked FROM lock_guard`;
    const exists=await tx.$queryRaw<Array<{id:string}>>`
      SELECT id FROM approval_workflow_definitions
      WHERE "tenantId"=${tenantId} AND "companyId"=${companyId}
        AND "workflowKey"=${workflowKey} AND status='PUBLISHED'
      LIMIT 1`;
    if(exists.length)return;
    const versions=await tx.$queryRaw<Array<{version:number}>>`
      SELECT COALESCE(MAX(version),0)::int AS version
      FROM approval_workflow_definitions
      WHERE "tenantId"=${tenantId} AND "companyId"=${companyId} AND "workflowKey"=${workflowKey}`;
    const version=Number(versions[0]?.version??0)+1;
    const steps=[
      {key:'branch-manager',name:'Şube Müdürü Onayı',approverType:'BRANCH_MANAGER',slaMinutes:240,timeoutAction:'ESCALATE',escalationApproverType:'REGIONAL_MANAGER'},
      {key:'upper-manager',name:'Üst Yönetici Onayı',approverType:'REGIONAL_MANAGER',slaMinutes:240,timeoutAction:'ESCALATE',escalationApproverType:'ROLE',escalationApproverValue:'general-manager'},
      {key:'hr-control',name:'İK Kontrolü',approverType:'ROLE',approverValue:'hr-manager',slaMinutes:240,timeoutAction:'ESCALATE',escalationApproverType:'ROLE',escalationApproverValue:'general-manager'},
      {key:'accounting-control',name:'Muhasebe Kontrolü',approverType:'ROLE',approverValue:'accounting-manager',slaMinutes:240,timeoutAction:'ESCALATE',escalationApproverType:'ROLE',escalationApproverValue:'finance-manager'},
    ];
    await tx.$executeRaw`
      INSERT INTO approval_workflow_definitions(
        id,"tenantId","companyId","workflowKey",name,domain,description,
        version,status,conditions,steps,"createdByUserId","publishedAt","createdAt","updatedAt"
      ) VALUES(
        gen_random_uuid()::text,${tenantId},${companyId},${workflowKey},
        'Prim ve Komisyon Onay Akışı','hr',
        'Prim ve komisyon talepleri için şube yönetimi, üst yönetim, İK ve muhasebe onay zinciri.',
        ${version},'PUBLISHED','{}'::jsonb,${JSON.stringify(steps)}::jsonb,
        ${userId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      )`;
  }

  async list(year?:number,month?:number){
    const {tenantId,companyId,branchIds}=await this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.id,r.branch_id AS "branchId",b.name AS "branchName",r.staff_id AS "staffId",
              s."firstName",s."lastName",r.type,r.amount,r.currency,r.period_year AS "year",
              r.period_month AS "month",r.reason,r.status,r.approval_request_id AS "approvalRequestId",
              r.approved_at AS "approvedAt",r.applied_payroll_period_id AS "appliedPayrollPeriodId",
              r.created_at AS "createdAt"
       FROM hr_compensation_requests r
       JOIN staff s ON s.id=r.staff_id
       JOIN branches b ON b.id=r.branch_id
       WHERE r.tenant_id=$1::text AND r.company_id=$2::text
         AND ($3::text[] IS NULL OR r.branch_id=ANY($3::text[]))
         AND ($4::int IS NULL OR r.period_year=$4)
         AND ($5::int IS NULL OR r.period_month=$5)
       ORDER BY r.created_at DESC`,
      tenantId,companyId,branchIds,year??null,month??null,
    );
  }

  async create(input:any,userId:string){
    const {tenantId,companyId,branchIds}=await this.context();
    const type=String(input?.type??'').toUpperCase();
    if(!['BONUS','COMMISSION'].includes(type))throw new BadRequestException('Talep türü prim veya komisyon olmalıdır.');
    const amount=Math.round(Number(input?.amount)*100)/100;
    if(!Number.isFinite(amount)||amount<=0)throw new BadRequestException('Tutar sıfırdan büyük olmalıdır.');
    const year=Number(input?.year),month=Number(input?.month);
    if(!Number.isInteger(year)||year<2000||year>2200||!Number.isInteger(month)||month<1||month>12)throw new BadRequestException('Geçerli bordro yılı ve ayı gereklidir.');
    const reason=String(input?.reason??'').trim();
    if(reason.length<3)throw new BadRequestException('Talep açıklaması zorunludur.');

    return this.prisma.$transaction(async tx=>{
      const staff=await tx.$queryRawUnsafe<any[]>(
        `SELECT s.id,s."branchId" AS "branchId"
         FROM staff s JOIN branches b ON b.id=s."branchId"
         WHERE s.id=$1::text AND s."tenantId"=$2::text AND b."companyId"=$3::text
           AND s.status='ACTIVE' AND ($4::text[] IS NULL OR s."branchId"=ANY($4::text[]))
         LIMIT 1`,
        String(input?.staffId??''),tenantId,companyId,branchIds,
      );
      if(!staff.length)throw new NotFoundException('Aktif personel bulunamadı.');
      const branchId=staff[0].branchId;
      await this.ensureWorkflow(tx,userId);
      const rows=await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO hr_compensation_requests(
           tenant_id,company_id,branch_id,staff_id,type,amount,currency,
           period_year,period_month,reason,status,requested_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,'TRY',$7,$8,$9,'PENDING',$10::text)
         RETURNING id,branch_id AS "branchId",staff_id AS "staffId",type,amount,currency,
                   period_year AS "year",period_month AS "month",reason,status`,
        tenantId,companyId,branchId,staff[0].id,type,amount,year,month,reason,userId,
      );
      const row=rows[0];
      const approval=await this.approvalRuntime.createWithinTransaction({
        workflowKey:'hr.compensation-request-approval',
        entityType:'hr_compensation_request',
        entityId:row.id,
        branchId,
        payload:{staffId:row.staffId,type,amount,year,month},
        reason,
      },tx);
      await tx.$executeRawUnsafe(
        `UPDATE hr_compensation_requests SET approval_request_id=$2::text,updated_at=NOW()
         WHERE id=$1::text`,row.id,approval.id,
      );
      return {...row,approvalRequestId:approval.id};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
}
