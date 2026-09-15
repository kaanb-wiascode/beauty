import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

export type UpdateCompanyAdminInput = {
  name?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
};

export type UpdateBranchAdminInput = {
  name?: string;
  code?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

@Injectable()
export class OrganizationAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  private async actorUserId() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const membershipId = this.tenantContext.getMembershipId();
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        tenantId,
        companyId,
        status: 'ACTIVE',
      },
      select: { userId: true },
    });

    if (!membership) {
      throw new BadRequestException('Active company membership is required');
    }

    return membership.userId;
  }

  private auditMetadata() {
    const context = this.tenantContext.getContext();
    return {
      membershipId: context.membershipId,
      companyId: context.companyId,
      branchId: context.branchId,
      roleScope: context.roleScope,
    };
  }

  private async scopedBranchIds(): Promise<string[] | null> {
    const branchId = this.tenantContext.getBranchId();
    const roleScope = this.tenantContext.getRoleScope();

    if (branchId) return [branchId];
    if (roleScope === 'CENTRAL') return null;
    if (roleScope === 'COMPANY') {
      return this.organizationScope.getAssignedActiveBranchIds();
    }
    return [];
  }

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
    const branchIds = await this.scopedBranchIds();

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

  async updateCurrentCompany(input: UpdateCompanyAdminInput) {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();

    if (this.tenantContext.getRoleScope() !== 'CENTRAL') {
      throw new ForbiddenException(
        'Company settings require central company administration scope',
      );
    }

    const current = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId },
      select: { id: true, name: true, slug: true, status: true },
    });
    if (!current) throw new NotFoundException('Company not found');

    const data: Prisma.CompanyUpdateInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('Company name is required');
      data.name = name;
    }
    if (input.status !== undefined) data.status = input.status;

    const actorUserId = await this.actorUserId();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id: current.id },
        data,
        select: { id: true, name: true, slug: true, status: true, updatedAt: true },
      });

      await this.platformAudit.record(
        {
          actorUserId,
          resource: 'organization',
          action: 'company.update',
          targetTenantId: tenantId,
          targetEntityType: 'company',
          targetEntityId: current.id,
          beforeState: current,
          afterState: updated,
          metadata: this.auditMetadata(),
        },
        tx,
      );

      return updated;
    });
  }

  async updateBranch(branchId: string, input: UpdateBranchAdminInput) {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const allowedBranchIds = await this.scopedBranchIds();

    if (allowedBranchIds !== null && !allowedBranchIds.includes(branchId)) {
      throw new NotFoundException('Branch not found');
    }

    const current = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        companyId,
        company: { tenantId },
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
      },
    });
    if (!current) throw new NotFoundException('Branch not found');

    const data: Prisma.BranchUpdateInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('Branch name is required');
      data.name = name;
    }
    if (input.code !== undefined) {
      const code = input.code.trim();
      if (!code) throw new BadRequestException('Branch code is required');
      const duplicate = await this.prisma.branch.findFirst({
        where: {
          companyId,
          id: { not: current.id },
          code,
        },
        select: { id: true },
      });
      if (duplicate) throw new BadRequestException('Branch code already exists');
      data.code = code;
    }
    if (input.status !== undefined) data.status = input.status;
    if (input.address !== undefined) data.address = input.address?.trim() || null;
    if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
    if (input.email !== undefined) data.email = input.email?.trim() || null;

    const actorUserId = await this.actorUserId();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.branch.update({
        where: { id: current.id },
        data,
        select: {
          id: true,
          companyId: true,
          name: true,
          code: true,
          status: true,
          address: true,
          phone: true,
          email: true,
          updatedAt: true,
        },
      });

      await this.platformAudit.record(
        {
          actorUserId,
          resource: 'organization',
          action: 'branch.update',
          targetTenantId: tenantId,
          targetEntityType: 'branch',
          targetEntityId: current.id,
          beforeState: current,
          afterState: updated,
          metadata: {
            ...this.auditMetadata(),
            targetCompanyId: companyId,
            targetBranchId: current.id,
          },
        },
        tx,
      );

      return updated;
    });
  }
}
