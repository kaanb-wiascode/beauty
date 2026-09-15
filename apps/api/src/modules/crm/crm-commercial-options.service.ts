import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class CrmCommercialOptionsService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  async list() {
    const c = this.tenantContext.getContext();
    const [branches, services, packages] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{id:string;name:string;code:string}>>(
        `SELECT b.id,b.name,b.code FROM branches b JOIN companies c ON c.id=b."companyId" WHERE b."companyId"=$1::text AND c."tenantId"=$2::text AND b.status='ACTIVE' ORDER BY b.name,b.id`,
        c.companyId,c.tenantId,
      ),
      this.prisma.$queryRawUnsafe<Array<{id:string;branchId:string;name:string;price:unknown}>>(
        `SELECT s.id,s."branchId" AS "branchId",s.name,s.price FROM services s JOIN branches b ON b.id=s."branchId" WHERE s."tenantId"=$1::text AND b."companyId"=$2::text AND s.status='ACTIVE' AND b.status='ACTIVE' ORDER BY s.name,s.id`,
        c.tenantId,c.companyId,
      ),
      this.prisma.$queryRawUnsafe<Array<{id:string;branchId:string;name:string;price:unknown}>>(
        `SELECT p.id,p."branchId" AS "branchId",p.name,p.price FROM service_packages p JOIN branches b ON b.id=p."branchId" WHERE p."tenantId"=$1::text AND b."companyId"=$2::text AND p.active=TRUE AND b.status='ACTIVE' ORDER BY p.name,p.id`,
        c.tenantId,c.companyId,
      ),
    ]);
    return { branches, services, packages };
  }
}
