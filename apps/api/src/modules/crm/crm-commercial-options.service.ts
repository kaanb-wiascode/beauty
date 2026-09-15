import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class CrmCommercialOptionsService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  async list() {
    const c = this.tenantContext.getContext();
    const [branches, services, packages] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; name: string; code: string }>>`
        SELECT b.id, b.name, b.code
        FROM branches b
        JOIN companies company ON company.id = b."companyId"
        WHERE b."companyId" = ${c.companyId}
          AND company."tenantId" = ${c.tenantId}
          AND b.status = 'ACTIVE'
        ORDER BY b.name, b.id
      `,
      this.prisma.$queryRaw<Array<{ id: string; branchId: string; name: string; price: unknown }>>`
        SELECT s.id, s."branchId" AS "branchId", s.name, s.price
        FROM services s
        JOIN branches b ON b.id = s."branchId"
        JOIN companies company ON company.id = b."companyId"
        WHERE s."tenantId" = ${c.tenantId}
          AND b."companyId" = ${c.companyId}
          AND company."tenantId" = ${c.tenantId}
          AND s.status = 'ACTIVE'
          AND b.status = 'ACTIVE'
        ORDER BY s.name, s.id
      `,
      this.prisma.$queryRaw<Array<{ id: string; branchId: string; name: string; price: unknown }>>`
        SELECT p.id, p."branchId" AS "branchId", p.name, p.price
        FROM service_packages p
        JOIN branches b ON b.id = p."branchId"
        JOIN companies company ON company.id = b."companyId"
        WHERE p."tenantId" = ${c.tenantId}
          AND b."companyId" = ${c.companyId}
          AND company."tenantId" = ${c.tenantId}
          AND p.active = TRUE
          AND b.status = 'ACTIVE'
        ORDER BY p.name, p.id
      `,
    ]);
    return { branches, services, packages };
  }
}
