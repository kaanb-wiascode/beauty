import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class PayrollPeriodService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  async create(year:number,month:number){
    if(!Number.isInteger(year)||year<2000||year>2200) throw new BadRequestException('Invalid payroll year.');
    if(!Number.isInteger(month)||month<1||month>12) throw new BadRequestException('month must be between 1 and 12.');
    const tenantId=this.tenant.getTenantId(); const companyId=this.tenant.getCompanyId(); const branchId=this.tenant.getBranchId();
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO payroll_periods(tenant_id,company_id,branch_id,year,month,status)
       VALUES($1::text,$2::text,$3::text,$4,$5,'DRAFT')
       ON CONFLICT(tenant_id,year,month)
       DO UPDATE SET company_id=COALESCE(payroll_periods.company_id,EXCLUDED.company_id),
                     branch_id=CASE WHEN payroll_periods.branch_id IS NULL THEN EXCLUDED.branch_id ELSE payroll_periods.branch_id END,
                     updated_at=NOW()
       RETURNING *`,tenantId,companyId,branchId,year,month);
    const period=rows[0];
    if(period.company_id&&period.company_id!==companyId) throw new BadRequestException('Payroll period belongs to another company.');
    return period;
  }
}
