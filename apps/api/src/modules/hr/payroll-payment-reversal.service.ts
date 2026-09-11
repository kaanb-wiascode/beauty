import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class PayrollPaymentReversalService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}
  private journalNumber(d:Date){return `JE-${d.toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`;}
  private reason(value:string){const clean=(value??'').trim();if(clean.length<5)throw new BadRequestException('Reversal reason must contain at least 5 characters.');return clean;}

  private async reverseJournal(tx:Prisma.TransactionClient, journalEntryId:string, tenantId:string, companyId:string, branchId:string|null, referenceType:string, referenceId:string, description:string){
    const original=await tx.journalEntry.findFirst({where:{id:journalEntryId,tenantId,companyId,status:'POSTED'},include:{lines:true}});
    if(!original||!original.lines.length) throw new BadRequestException('Original payroll settlement journal is missing.');
    const now=new Date();
    return tx.journalEntry.create({data:{tenantId,companyId,branchId,number:this.journalNumber(now),status:'POSTED',entryDate:now,description,referenceType,referenceId,postedAt:now,lines:{create:original.lines.map(line=>({accountId:line.accountId,debit:line.credit,credit:line.debit,memo:`Ters kayıt: ${line.memo??'bordro ödemesi'}`}))}}});
  }

  async reverseSalaryPayment(paymentId:string,userId:string,reasonInput:string){
    const clean=this.reason(reasonInput); const {tenantId,companyId,branchId}=this.context();
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRawUnsafe<any[]>(
        `SELECT id,branch_id AS "branchId",period_id AS "periodId",staff_id AS "staffId",amount,status,journal_entry_id AS "journalEntryId",reversal_journal_entry_id AS "reversalJournalEntryId"
         FROM salary_payments WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id=$4::text) FOR UPDATE`,paymentId,tenantId,companyId,branchId);
      if(!rows.length) throw new NotFoundException('Salary payment not found.'); const payment=rows[0];
      if(payment.status==='REVERSED') return {paymentId,status:'REVERSED',journalEntryId:payment.reversalJournalEntryId,duplicate:true};
      if(payment.status!=='PAID'||!payment.journalEntryId) throw new BadRequestException('Only posted salary payments can be reversed.');
      const period=await tx.$queryRawUnsafe<any[]>(`SELECT status FROM payroll_periods WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text FOR UPDATE`,payment.periodId,tenantId,companyId);
      if(!period.length||period[0].status==='REVERSED') throw new BadRequestException('Payroll period is already reversed.');
      const reversal=await this.reverseJournal(tx,payment.journalEntryId,tenantId,companyId,payment.branchId??null,'SALARY_PAYMENT_REVERSAL',paymentId,`Personel ücret ödeme ters kaydı ${payment.staffId}: ${clean}`);
      await tx.$executeRawUnsafe(`UPDATE salary_payments SET status='REVERSED',reversed_at=NOW(),reversed_by_user_id=$2::text,reversal_reason=$3,reversal_journal_entry_id=$4::text,updated_at=NOW() WHERE id=$1::text`,paymentId,userId,clean,reversal.id);
      return {paymentId,status:'REVERSED',journalEntryId:reversal.id,duplicate:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async reverseLiabilityPayment(paymentId:string,userId:string,reasonInput:string){
    const clean=this.reason(reasonInput); const {tenantId,companyId,branchId}=this.context();
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRawUnsafe<any[]>(
        `SELECT id,branch_id AS "branchId",period_id AS "periodId",type,amount,status,journal_entry_id AS "journalEntryId",reversal_journal_entry_id AS "reversalJournalEntryId"
         FROM payroll_liability_payments WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id=$4::text OR branch_id IS NULL) FOR UPDATE`,paymentId,tenantId,companyId,branchId);
      if(!rows.length) throw new NotFoundException('Payroll liability payment not found.'); const payment=rows[0];
      if(payment.status==='REVERSED') return {paymentId,status:'REVERSED',journalEntryId:payment.reversalJournalEntryId,duplicate:true};
      if(payment.status!=='PAID'||!payment.journalEntryId) throw new BadRequestException('Only posted payroll liability payments can be reversed.');
      const period=await tx.$queryRawUnsafe<any[]>(`SELECT status FROM payroll_periods WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text FOR UPDATE`,payment.periodId,tenantId,companyId);
      if(!period.length||period[0].status==='REVERSED') throw new BadRequestException('Payroll period is already reversed.');
      const reversal=await this.reverseJournal(tx,payment.journalEntryId,tenantId,companyId,payment.branchId??null,'PAYROLL_LIABILITY_PAYMENT_REVERSAL',paymentId,`Bordro yükümlülük ödeme ters kaydı ${payment.type}: ${clean}`);
      await tx.$executeRawUnsafe(`UPDATE payroll_liability_payments SET status='REVERSED',reversed_at=NOW(),reversed_by_user_id=$2::text,reversal_reason=$3,reversal_journal_entry_id=$4::text WHERE id=$1::text`,paymentId,userId,clean,reversal.id);
      return {paymentId,status:'REVERSED',journalEntryId:reversal.id,duplicate:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
}
