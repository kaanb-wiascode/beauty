import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type PayrollPaymentMethod = 'BANK' | 'CASH';
export type PayrollLiabilityType = 'TAX' | 'SOCIAL_SECURITY' | 'OTHER';

@Injectable()
export class PayrollSettlementService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}
  private round(v:number){return Math.round((v+Number.EPSILON)*100)/100;}
  private journalNumber(d:Date){return `JE-${d.toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`;}
  private accountCode(method:PayrollPaymentMethod){return method==='CASH'?'100':'102';}

  private async ensureAccount(tx:Prisma.TransactionClient,tenantId:string,companyId:string,code:string,name:string,type:'ASSET'|'LIABILITY'){
    const existing=await tx.chartOfAccount.findFirst({where:{tenantId,companyId,code},select:{id:true,active:true}});
    if(existing){if(!existing.active)return tx.chartOfAccount.update({where:{id:existing.id},data:{active:true},select:{id:true}});return existing;}
    return tx.chartOfAccount.create({data:{tenantId,companyId,code,name,type,active:true},select:{id:true}});
  }

  async paySalary(periodId:string,staffId:string,amountInput:number,method:PayrollPaymentMethod,userId:string,note?:string){
    const {tenantId,companyId,branchId}=this.context(); const amount=this.round(Number(amountInput));
    if(!Number.isFinite(amount)||amount<=0) throw new BadRequestException('Salary payment amount must be greater than zero.');
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRawUnsafe<any[]>(
        `SELECT pp.id,pp.status,pi.branch_id AS "branchId",pi.net_amount AS "netAmount"
         FROM payroll_periods pp JOIN payroll_items pi ON pi.period_id=pp.id
         WHERE pp.id=$1::text AND pp.tenant_id=$2::text AND pp.company_id=$3::text
           AND pp.status='POSTED' AND pi.staff_id=$4::text
           AND ($5::text IS NULL OR pi.branch_id=$5::text)
         FOR UPDATE OF pp,pi`,periodId,tenantId,companyId,staffId,branchId);
      if(!rows.length) throw new NotFoundException('Posted payroll item not found.');
      const item=rows[0];
      const paidRows=await tx.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(SUM(amount),0)::numeric AS paid FROM salary_payments
         WHERE tenant_id=$1::text AND company_id=$2::text AND period_id=$3::text AND staff_id=$4::text AND status='PAID'`,tenantId,companyId,periodId,staffId);
      const paid=this.round(Number(paidRows[0]?.paid??0)); const remaining=this.round(Number(item.netAmount)-paid);
      if(amount>remaining+0.01) throw new BadRequestException(`Salary payment exceeds remaining payable amount ${remaining}.`);

      const personnel=await this.ensureAccount(tx,tenantId,companyId,'335','Personele Borçlar','LIABILITY');
      const paymentCode=this.accountCode(method); const payment=await this.ensureAccount(tx,tenantId,companyId,paymentCode,paymentCode==='100'?'Kasa':'Bankalar','ASSET');
      const now=new Date(); const paymentId=randomUUID();
      const entry=await tx.journalEntry.create({data:{tenantId,companyId,branchId:item.branchId,number:this.journalNumber(now),status:'POSTED',entryDate:now,description:`Personel ücret ödemesi ${staffId}`,referenceType:'SALARY_PAYMENT',referenceId:paymentId,postedAt:now,lines:{create:[{accountId:personnel.id,debit:amount,credit:0,memo:'Net ücret borcu kapama'},{accountId:payment.id,debit:0,credit:amount,memo:method}]}}});
      await tx.$executeRawUnsafe(
        `INSERT INTO salary_payments(id,tenant_id,company_id,branch_id,period_id,staff_id,amount,method,status,paid_at,note,journal_entry_id,payment_account_code)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,'PAID',NOW(),$9,$10::text,$11)`,paymentId,tenantId,companyId,item.branchId,periodId,staffId,amount,method,note??null,entry.id,paymentCode);
      return {paymentId,periodId,staffId,amount,remaining:this.round(remaining-amount),journalEntryId:entry.id,status:'PAID'};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async settleLiability(periodId:string,type:PayrollLiabilityType,amountInput:number,method:PayrollPaymentMethod,userId:string,note?:string){
    const {tenantId,companyId,branchId}=this.context(); const amount=this.round(Number(amountInput));
    if(!Number.isFinite(amount)||amount<=0) throw new BadRequestException('Liability settlement amount must be greater than zero.');
    return this.prisma.$transaction(async tx=>{
      const periods=await tx.$queryRawUnsafe<any[]>(
        `SELECT id,status,branch_id AS "branchId" FROM payroll_periods
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='POSTED'
           AND ($4::text IS NULL OR branch_id=$4::text OR branch_id IS NULL) FOR UPDATE`,periodId,tenantId,companyId,branchId);
      if(!periods.length) throw new NotFoundException('Posted payroll period not found.');
      const totals=await tx.$queryRawUnsafe<any[]>(
        `SELECT
           COALESCE(SUM(income_tax+stamp_tax),0)::numeric AS tax,
           COALESCE(SUM(employee_social_security+unemployment_employee+employer_social_security+unemployment_employer),0)::numeric AS social,
           COALESCE(SUM(other_deductions),0)::numeric AS other
         FROM payroll_items WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,periodId,tenantId,companyId);
      const due=this.round(Number(type==='TAX'?totals[0]?.tax:type==='SOCIAL_SECURITY'?totals[0]?.social:totals[0]?.other));
      const priorRows=await tx.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(SUM(amount),0)::numeric AS paid FROM payroll_liability_payments
         WHERE tenant_id=$1::text AND company_id=$2::text AND period_id=$3::text AND type=$4`,tenantId,companyId,periodId,type);
      const prior=this.round(Number(priorRows[0]?.paid??0)); const remaining=this.round(due-prior);
      if(amount>remaining+0.01) throw new BadRequestException(`Liability settlement exceeds remaining payable amount ${remaining}.`);
      const liabilityCode=type==='TAX'?'360':type==='SOCIAL_SECURITY'?'361':'369';
      const liabilityName=type==='TAX'?'Ödenecek Vergi ve Fonlar':type==='SOCIAL_SECURITY'?'Ödenecek Sosyal Güvenlik Kesintileri':'Ödenecek Diğer Yükümlülükler';
      const liability=await this.ensureAccount(tx,tenantId,companyId,liabilityCode,liabilityName,'LIABILITY');
      const paymentCode=this.accountCode(method); const payment=await this.ensureAccount(tx,tenantId,companyId,paymentCode,paymentCode==='100'?'Kasa':'Bankalar','ASSET');
      const now=new Date(); const settlementId=randomUUID();
      const entry=await tx.journalEntry.create({data:{tenantId,companyId,branchId:periods[0].branchId??null,number:this.journalNumber(now),status:'POSTED',entryDate:now,description:`Bordro yükümlülük ödemesi ${type}`,referenceType:'PAYROLL_LIABILITY_PAYMENT',referenceId:settlementId,postedAt:now,lines:{create:[{accountId:liability.id,debit:amount,credit:0,memo:type},{accountId:payment.id,debit:0,credit:amount,memo:method}]}}});
      await tx.$executeRawUnsafe(
        `INSERT INTO payroll_liability_payments(id,tenant_id,company_id,branch_id,period_id,type,amount,method,payment_account_code,note,journal_entry_id,created_by_user_id)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11::text,$12::text)`,settlementId,tenantId,companyId,periods[0].branchId??null,periodId,type,amount,method,paymentCode,note??null,entry.id,userId);
      return {settlementId,periodId,type,amount,remaining:this.round(remaining-amount),journalEntryId:entry.id,status:'PAID'};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
}
