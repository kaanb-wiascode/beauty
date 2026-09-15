import { Injectable } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from './tenant-context';

export type BranchScopedWhere =
  | {
      tenantId: string;
      branchId: string;
    }
  | {
      tenantId: string;
      branchId: { in: string[] };
    }
  | {
      tenantId: string;
      branch: { companyId: string };
    };

@Injectable()
export class OrganizationScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async getBranchScopedWhere(): Promise<BranchScopedWhere> {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const roleScope = this.tenantContext.getRoleScope();

    if (branchId) {
      return {
        tenantId,
        branchId,
      };
    }

    if (roleScope === 'CENTRAL') {
      return {
        tenantId,
        branch: {
          companyId,
        },
      };
    }

    if (roleScope === 'COMPANY') {
      const branchIds = await this.getAssignedActiveBranchIds();

      return {
        tenantId,
        branchId: {
          in: branchIds,
        },
      };
    }

    return {
      tenantId,
      branchId: {
        in: [],
      },
    };
  }

  async getAssignedActiveBranchIds(): Promise<string[]> {
    const membershipId = this.tenantContext.getMembershipId();
    const companyId = this.tenantContext.getCompanyId();

    const accesses = await this.prisma.membershipBranchAccess.findMany({
      where: {
        membershipId,
        branch: {
          companyId,
          status: 'ACTIVE',
        },
      },
      select: {
        branchId: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return accesses.map((access) => access.branchId);
  }
}
