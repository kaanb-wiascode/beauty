import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class PayrollCostCenterAccountingService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}
  private round(v:number){return Math.round((v+Number.EPSILON)*100)/100;}

  async ensureSplit(periodId:string){
    const {tenantId,companyId,branchId}=this.context();
    return this.prisma.$transaction(async tx=>{
      const periods=await tx.$queryRawUnsafe<any[]>(
        `SELECT id,status,branch_id AS "branchId",journal_entry_id AS "journalEntryId"
         FROM payroll_periods
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id=$4::text OR branch_id IS NULL)
         FOR UPDATE`,periodId,tenantId,companyId,branchId);
      if(!periods.length) throw new NotFoundException('Payroll period not found.');
      const period=periods[0];
      if(period.status!=='POSTED'||!period.journalEntryId) throw new BadRequestException('Posted payroll journal is required.');

      const account=await tx.chartOfAccount.findFirst({where:{tenantId,companyId,code:'770'},select:{id:true}});
      if(!account) throw new BadRequestException('Payroll expense account 770 is missing.');

      const groups=await tx.$queryRawUnsafe<any[]>(
        `SELECT cost_center_id AS "costCenterId",COALESCE(SUM(employer_cost),0)::numeric AS amount
         FROM payroll_items
         WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         GROUP BY cost_center_id ORDER BY cost_center_id NULLS LAST`,periodId,tenantId,companyId);
      if(!groups.length) throw new BadRequestException('Payroll period has no expense allocation.');
      const total=this.round(groups.reduce((sum,g)=>sum+Number(g.amount),0));

      const current=await tx.journalEntryLine.findMany({where:{journalEntryId:period.journalEntryId,accountId:account.id},select:{id:true,debit:true,credit:true}});
      const currentDebit=this.round(current.reduce((sum,l)=>sum+Number(l.debit),0));
      if(Math.abs(currentDebit-total)>0.01) throw new BadRequestException('Payroll expense allocation does not reconcile with posted journal.');

      if(current.length===groups.length){
        const linked=await tx.$queryRawUnsafe<any[]>(
          `SELECT jel.id,ccel.cost_center_id AS "costCenterId",jel.debit::numeric AS debit
           FROM journal_entry_lines jel
           LEFT JOIN cost_center_expense_links ccel ON ccel.journal_entry_line_id=jel.id
           WHERE jel."journalEntryId"=$1::text AND jel."accountId"=$2::text`,period.journalEntryId,account.id);
        const expected=groups.map(g=>`${g.costCenterId??'UNALLOCATED'}:${this.round(Number(g.amount)).toFixed(2)}`).sort();
        const actual=linked.map(l=>`${l.costCenterId??'UNALLOCATED'}:${this.round(Number(l.debit)).toFixed(2)}`).sort();
        if(JSON.stringify(expected)===JSON.stringify(actual)) return {periodId,journalEntryId:period.journalEntryId,groups:groups.length,duplicate:true};
      }

      if(current.length!==1) throw new BadRequestException('Payroll expense lines are already partially allocated and require manual review.');
      await tx.$executeRawUnsafe(`DELETE FROM cost_center_expense_links WHERE journal_entry_line_id=$1::text`,current[0].id);
      await tx.journalEntryLine.delete({where:{id:current[0].id}});

      for(const group of groups){
        const amount=this.round(Number(group.amount));
        if(amount<=0) continue;
        const line=await tx.journalEntryLine.create({data:{journalEntryId:period.journalEntryId,accountId:account.id,debit:amount,credit:0,memo:group.costCenterId?'Personel gideri - maliyet merkezi':'Personel gideri - dağıtılmamış'}});
        if(group.costCenterId){
          const centers=await tx.$queryRawUnsafe<any[]>(`SELECT id FROM cost_centers WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND active=true LIMIT 1`,group.costCenterId,tenantId,companyId);
          if(!centers.length) throw new BadRequestException('Payroll cost center is no longer active in company scope.');
          await tx.$executeRawUnsafe(`INSERT INTO cost_center_expense_links(journal_entry_line_id,cost_center_id) VALUES($1::text,$2::text)`,line.id,group.costCenterId);
        }
      }
      return {periodId,journalEntryId:period.journalEntryId,groups:groups.length,duplicate:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
}
