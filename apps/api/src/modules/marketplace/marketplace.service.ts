import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Produces the exact public-safe projection that a branch would expose to
   * Marketplace. This endpoint is intentionally tenant-authenticated for now;
   * public publication is introduced only after an explicit opt-in model is
   * persisted in the database.
   */
  async previewCurrentBranch() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();

    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected to preview Marketplace listing data.',
      );
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        companyId,
        status: 'ACTIVE',
        company: {
          tenantId,
          status: 'ACTIVE',
        },
      },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        phone: true,
        email: true,
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        services: {
          where: {
            tenantId,
            status: 'ACTIVE',
          },
          orderBy: {
            name: 'asc',
          },
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            price: true,
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException('Active branch not found');
    }

    return {
      listing: {
        company: branch.company,
        branch: {
          id: branch.id,
          name: branch.name,
          code: branch.code,
          address: branch.address,
          phone: branch.phone,
          email: branch.email,
        },
        services: branch.services,
      },
      publication: {
        status: 'PREVIEW_ONLY',
        public: false,
      },
    };
  }
}
