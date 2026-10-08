import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';

@Injectable()
export class PayrollPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  async create(year:number,month:number){
    if(!Number.isInteger(year)||year<2000||year>2200) throw new BadRequestException('Geçerli bir bordro yılı girilmelidir.');
    if(!Number.isInteger(month)||month<1||month>12) throw new BadRequestException('Ay 1 ile 12 arasında olmalıdır.');

    const tenantId=this.tenant.getTenantId();
    const companyId=this.tenant.getCompanyId();
    const activeBranchId=this.tenant.getBranchId();
    const scope=await this.organizationScope.getBranchScopedWhere();

    let branchId:string|null=null;
    if('branchId' in scope){
      if(!activeBranchId) throw new BadRequestException('Şubeye bağlı bordro dönemi oluşturmak için bir şube seçilmelidir.');
      const allowed=typeof scope.branchId==='string'?[scope.branchId]:scope.branchId.in;
      if(!allowed.includes(activeBranchId)) throw new BadRequestException('Seçilen şube aktif organizasyon kapsamının dışında.');
      branchId=activeBranchId;
    }

    const rows=branchId
      ?await this.prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO payroll_periods(tenant_id,company_id,branch_id,year,month,status)
         VALUES($1::text,$2::text,$3::text,$4,$5,'DRAFT')
         ON CONFLICT(tenant_id,company_id,branch_id,year,month) WHERE branch_id IS NOT NULL
         DO UPDATE SET updated_at=NOW()
         RETURNING *`,tenantId,companyId,branchId,year,month)
      :await this.prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO payroll_periods(tenant_id,company_id,branch_id,year,month,status)
         VALUES($1::text,$2::text,NULL,$3,$4,'DRAFT')
         ON CONFLICT(tenant_id,company_id,year,month) WHERE branch_id IS NULL
         DO UPDATE SET updated_at=NOW()
         RETURNING *`,tenantId,companyId,year,month);
    const period=rows[0];
    if(period.company_id&&period.company_id!==companyId) throw new BadRequestException('Bordro dönemi başka bir şirkete ait.');
    if(branchId&&period.branch_id!==branchId) throw new BadRequestException('Bordro dönemi başka bir şubeye ait.');
    return period;
  }
}
