import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class OrganizationAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  async currentCompany() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();

    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            branches: true,
            memberships: true,
            roles: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  async accessibleBranches() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const roleScope = this.tenantContext.getRoleScope();

    let branchIds: string[] | null = null;
    if (branchId) {
      branchIds = [branchId];
    } else if (roleScope === 'COMPANY') {
      branchIds = await this.organizationScope.getAssignedActiveBranchIds();
    } else if (roleScope !== 'CENTRAL') {
      branchIds = [];
    }

    return this.prisma.branch.findMany({
      where: {
        companyId,
        company: {
          tenantId,
        },
        ...(branchIds === null ? {} : { id: { in: branchIds } }),
      },
      select: {
        id: true,
        companyId: true,
        name: true,
        code: true,
        status: true,
        address: true,
        phone: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            membershipAccess: true,
            staff: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { name: 'asc' },
      ],
    });
  }
}
