import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type PayrollItemInput = {
  staffId: string;
  branchId: string;
  costCenterId?: string;
  grossAmount: number;
  netAmount: number;
  incomeTax?: number;
  stampTax?: number;
  employeeSocialSecurity?: number;
  unemploymentEmployee?: number;
  employerSocialSecurity?: number;
  unemploymentEmployer?: number;
  otherDeductions?: number;
  employerCost: number;
  note?: string;
};

@Injectable()
export class PayrollAccountingService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context() {
    return { tenantId: this.tenant.getTenantId(), companyId: this.tenant.getCompanyId(), branchId: this.tenant.getBranchId() };
  }
  private round(v:number){ return Math.round((v+Number.EPSILON)*100)/100; }
  private journalNumber(d:Date){ return `JE-${d.toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`; }
  private role(v:string|null|undefined){ return (v??'').trim().toLowerCase().replace(/[\s_]+/g,'-').replace(/[^a-z0-9-]/g,''); }

  private async assertApprover(userId:string, targetBranchId:string|null) {
    const {tenantId,companyId,branchId}=this.context();
    if(branchId&&targetBranchId&&branchId!==targetBranchId) throw new ForbiddenException('Payroll period is outside active branch scope.');
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.slug AS "roleSlug",r.name AS "roleName",r.scope AS "roleScope",
              CASE WHEN $4::text IS NULL THEN true ELSE EXISTS(
                SELECT 1 FROM membership_branch_access mba WHERE mba."membershipId"=m.id AND mba."branchId"=$4::text
              ) END AS "hasBranchAccess"
       FROM memberships m JOIN roles r ON r.id=m."roleId"
       WHERE m."userId"=$1::text AND m."tenantId"=$2::text AND m.status='ACTIVE'
         AND (m."companyId" IS NULL OR m."companyId"=$3::text) LIMIT 1`, userId,tenantId,companyId,targetBranchId);
    const actor=rows[0]; if(!actor) throw new ForbiddenException('Approver has no active membership.');
    if(actor.roleScope==='BRANCH'&&targetBranchId&&!actor.hasBranchAccess&&branchId!==targetBranchId) throw new ForbiddenException('Approver has no payroll branch access.');
    const ids=new Set([this.role(actor.roleSlug),this.role(actor.roleName)]);
    const allowed=['hr-manager','human-resources-manager','finance','finance-manager','finance-director','cfo','company-manager','general-manager','director','owner','admin','super-admin'];
    if(!allowed.some(r=>ids.has(r))) throw new ForbiddenException('Payroll approval requires HR, finance or management authority.');
  }

  private validate(input:PayrollItemInput){
    const nums=['grossAmount','netAmount','incomeTax','stampTax','employeeSocialSecurity','unemploymentEmployee','employerSocialSecurity','unemploymentEmployer','otherDeductions','employerCost'] as const;
    for(const k of nums){ const v=Number(input[k]??0); if(!Number.isFinite(v)||v<0) throw new BadRequestException(`${k} cannot be negative.`); }
    const employeeDeductions=this.round(Number(input.incomeTax??0)+Number(input.stampTax??0)+Number(input.employeeSocialSecurity??0)+Number(input.unemploymentEmployee??0)+Number(input.otherDeductions??0));
    const expectedNet=this.round(Number(input.grossAmount)-employeeDeductions);
    if(Math.abs(expectedNet-this.round(Number(input.netAmount)))>0.01) throw new BadRequestException(`Net payroll does not reconcile. Expected ${expectedNet}.`);
    const expectedEmployerCost=this.round(Number(input.grossAmount)+Number(input.employerSocialSecurity??0)+Number(input.unemploymentEmployer??0));
    if(Math.abs(expectedEmployerCost-this.round(Number(input.employerCost)))>0.01) throw new BadRequestException(`Employer cost does not reconcile. Expected ${expectedEmployerCost}.`);
    return {employeeDeductions,expectedEmployerCost};
  }

  async upsertItem(periodId:string,input:PayrollItemInput){
    const {tenantId,companyId,branchId}=this.context(); const calc=this.validate(input);
    return this.prisma.$transaction(async tx=>{
      const periods=await tx.$queryRawUnsafe<any[]>(`SELECT id,status FROM payroll_periods WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT' FOR UPDATE`,periodId,tenantId,companyId);
      if(!periods.length) throw new BadRequestException('Only a draft payroll period can be edited.');
      if(branchId&&input.branchId!==branchId) throw new ForbiddenException('Payroll item is outside active branch scope.');
      const staff=await tx.staff.findFirst({where:{id:input.staffId,tenantId,branchId:input.branchId,status:'ACTIVE'},select:{id:true}});
      if(!staff) throw new NotFoundException('Active staff member not found.');
      if(input.costCenterId){
        const cc=await tx.$queryRawUnsafe<any[]>(`SELECT id FROM cost_centers WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND active=true LIMIT 1`,input.costCenterId,tenantId,companyId);
        if(!cc.length) throw new BadRequestException('Cost center is not available in company scope.');
      }
      const snapshot={grossAmount:this.round(input.grossAmount),netAmount:this.round(input.netAmount),incomeTax:this.round(input.incomeTax??0),stampTax:this.round(input.stampTax??0),employeeSocialSecurity:this.round(input.employeeSocialSecurity??0),unemploymentEmployee:this.round(input.unemploymentEmployee??0),employerSocialSecurity:this.round(input.employerSocialSecurity??0),unemploymentEmployer:this.round(input.unemploymentEmployer??0),otherDeductions:this.round(input.otherDeductions??0),employerCost:this.round(input.employerCost)};
      const rows=await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO payroll_items(tenant_id,company_id,branch_id,period_id,staff_id,cost_center_id,gross_amount,net_amount,deductions,employer_cost,income_tax,stamp_tax,employee_social_security,unemployment_employee,employer_social_security,unemployment_employer,other_deductions,calculation_snapshot,status,note)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,'DRAFT',$19)
         ON CONFLICT(period_id,staff_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,company_id=EXCLUDED.company_id,cost_center_id=EXCLUDED.cost_center_id,gross_amount=EXCLUDED.gross_amount,net_amount=EXCLUDED.net_amount,deductions=EXCLUDED.deductions,employer_cost=EXCLUDED.employer_cost,income_tax=EXCLUDED.income_tax,stamp_tax=EXCLUDED.stamp_tax,employee_social_security=EXCLUDED.employee_social_security,unemployment_employee=EXCLUDED.unemployment_employee,employer_social_security=EXCLUDED.employer_social_security,unemployment_employer=EXCLUDED.unemployment_employer,other_deductions=EXCLUDED.other_deductions,calculation_snapshot=EXCLUDED.calculation_snapshot,note=EXCLUDED.note,updated_at=NOW()
         RETURNING *`,tenantId,companyId,input.branchId,periodId,input.staffId,input.costCenterId??null,snapshot.grossAmount,snapshot.netAmount,calc.employeeDeductions,snapshot.employerCost,snapshot.incomeTax,snapshot.stampTax,snapshot.employeeSocialSecurity,snapshot.unemploymentEmployee,snapshot.employerSocialSecurity,snapshot.unemploymentEmployer,snapshot.otherDeductions,JSON.stringify(snapshot),input.note??null);
      await tx.$executeRawUnsafe(`UPDATE payroll_periods SET company_id=COALESCE(company_id,$2::text),branch_id=CASE WHEN branch_id IS NULL THEN $3::text WHEN branch_id=$3::text THEN branch_id ELSE NULL END,updated_at=NOW() WHERE id=$1::text`,periodId,companyId,input.branchId);
      return rows[0];
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async submit(periodId:string){
    const {tenantId,companyId}=this.context();
    const updated=await this.prisma.$executeRawUnsafe(`UPDATE payroll_periods pp SET status='SUBMITTED',updated_at=NOW() WHERE pp.id=$1::text AND pp.tenant_id=$2::text AND pp.company_id=$3::text AND pp.status='DRAFT' AND EXISTS(SELECT 1 FROM payroll_items pi WHERE pi.period_id=pp.id)`,periodId,tenantId,companyId);
    if(updated!==1) throw new BadRequestException('Draft payroll period with at least one item is required.');
    return {periodId,status:'SUBMITTED'};
  }

  async approve(periodId:string,userId:string){
    const {tenantId,companyId}=this.context(); const rows=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id,branch_id AS "branchId",status FROM payroll_periods WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text LIMIT 1`,periodId,tenantId,companyId);
    if(!rows.length) throw new NotFoundException('Payroll period not found.'); if(rows[0].status!=='SUBMITTED') throw new BadRequestException('Only submitted payroll can be approved.');
    await this.assertApprover(userId,rows[0].branchId??null);
    const updated=await this.prisma.$executeRawUnsafe(`UPDATE payroll_periods SET status='APPROVED',approved_by_user_id=$2::text,approved_at=NOW(),updated_at=NOW() WHERE id=$1::text AND tenant_id=$3::text AND company_id=$4::text AND status='SUBMITTED'`,periodId,userId,tenantId,companyId);
    if(updated!==1) throw new BadRequestException('Payroll period changed concurrently.'); return {periodId,status:'APPROVED'};
  }

  private async ensureAccount(tx:Prisma.TransactionClient,tenantId:string,companyId:string,code:string,name:string,type:'ASSET'|'LIABILITY'|'EQUITY'|'REVENUE'|'EXPENSE'){
    const x=await tx.chartOfAccount.findFirst({where:{tenantId,companyId,code},select:{id:true,active:true}}); if(x){if(!x.active)return tx.chartOfAccount.update({where:{id:x.id},data:{active:true},select:{id:true}});return x;} return tx.chartOfAccount.create({data:{tenantId,companyId,code,name,type,active:true},select:{id:true}});
  }

  async post(periodId:string){
    const {tenantId,companyId,branchId}=this.context();
    return this.prisma.$transaction(async tx=>{
      const periods=await tx.$queryRawUnsafe<any[]>(`SELECT id,year,month,status,branch_id AS "branchId",journal_entry_id AS "journalEntryId" FROM payroll_periods WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id=$4::text OR branch_id IS NULL) FOR UPDATE`,periodId,tenantId,companyId,branchId);
      if(!periods.length) throw new NotFoundException('Payroll period not found.'); const period=periods[0];
      if(period.status==='POSTED') return {periodId,status:'POSTED',journalEntryId:period.journalEntryId,duplicate:true};
      if(period.status!=='APPROVED') throw new BadRequestException('Only approved payroll can be posted.');
      const items=await tx.$queryRawUnsafe<any[]>(`SELECT * FROM payroll_items WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text ORDER BY id FOR UPDATE`,periodId,tenantId,companyId);
      if(!items.length) throw new BadRequestException('Payroll period has no items.');
      let expense=0,net=0,taxes=0,social=0,other=0; for(const i of items){expense=this.round(expense+Number(i.employer_cost));net=this.round(net+Number(i.net_amount));taxes=this.round(taxes+Number(i.income_tax)+Number(i.stamp_tax));social=this.round(social+Number(i.employee_social_security)+Number(i.unemployment_employee)+Number(i.employer_social_security)+Number(i.unemployment_employer));other=this.round(other+Number(i.other_deductions));}
      const credits=this.round(net+taxes+social+other); if(Math.abs(expense-credits)>0.01) throw new BadRequestException(`Payroll journal is not balanced. Expense ${expense}, liabilities ${credits}.`);
      const expenseAcc=await this.ensureAccount(tx,tenantId,companyId,'770','Genel Yönetim Giderleri - Personel','EXPENSE');
      const personnel=await this.ensureAccount(tx,tenantId,companyId,'335','Personele Borçlar','LIABILITY');
      const tax=await this.ensureAccount(tx,tenantId,companyId,'360','Ödenecek Vergi ve Fonlar','LIABILITY');
      const socialAcc=await this.ensureAccount(tx,tenantId,companyId,'361','Ödenecek Sosyal Güvenlik Kesintileri','LIABILITY');
      const otherAcc=other>0?await this.ensureAccount(tx,tenantId,companyId,'369','Ödenecek Diğer Yükümlülükler','LIABILITY'):null;
      const now=new Date(); const entry=await tx.journalEntry.create({data:{tenantId,companyId,branchId:period.branchId??null,number:this.journalNumber(now),status:'POSTED',entryDate:now,description:`Bordro ${period.year}/${String(period.month).padStart(2,'0')}`,referenceType:'PAYROLL_PERIOD',referenceId:periodId,postedAt:now,lines:{create:[{accountId:expenseAcc.id,debit:expense,credit:0,memo:'Brüt ücret ve işveren maliyetleri'},{accountId:personnel.id,debit:0,credit:net,memo:'Net ücret borcu'},...(taxes>0?[{accountId:tax.id,debit:0,credit:taxes,memo:'Vergi ve damga vergisi'}]:[]),...(social>0?[{accountId:socialAcc.id,debit:0,credit:social,memo:'SGK ve işsizlik yükümlülükleri'}]:[]),...(other>0&&otherAcc?[{accountId:otherAcc.id,debit:0,credit:other,memo:'Diğer bordro kesintileri'}]:[])]}}});
      const expenseLine=await tx.journalEntryLine.findFirst({where:{journalEntryId:entry.id,accountId:expenseAcc.id},select:{id:true}});
      if(expenseLine){ const centers=[...new Set(items.map(i=>i.cost_center_id).filter(Boolean))]; if(centers.length===1) await tx.$executeRawUnsafe(`INSERT INTO cost_center_expense_links(journal_entry_line_id,cost_center_id) VALUES($1::text,$2::text) ON CONFLICT(journal_entry_line_id) DO UPDATE SET cost_center_id=EXCLUDED.cost_center_id`,expenseLine.id,centers[0]); }
      await tx.$executeRawUnsafe(`UPDATE payroll_items SET status='POSTED',updated_at=NOW() WHERE period_id=$1::text`,periodId);
      await tx.$executeRawUnsafe(`UPDATE payroll_periods SET status='POSTED',posted_at=NOW(),journal_entry_id=$2::text,updated_at=NOW() WHERE id=$1::text`,periodId,entry.id);
      return {periodId,status:'POSTED',journalEntryId:entry.id,totals:{employerCost:expense,netPayable:net,taxesPayable:taxes,socialSecurityPayable:social,otherPayables:other}};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
}