import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import type { ReportExportJobRecord } from './report-export-jobs.repository';
import { reportDefinitions } from './report-definition';

@Injectable()
export class ReportExportAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(job: ReportExportJobRecord): Promise<JwtPayload> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: job.membershipId,
        userId: job.requestedBy,
        tenantId: job.tenantId,
        companyId: job.companyId,
        roleId: job.roleId,
        status: 'ACTIVE',
      },
      include: {
        role: {
          select: {
            id: true,
            companyId: true,
            scope: true,
          },
        },
        branchAccesses: {
          select: {
            branchId: true,
          },
        },
      },
    });

    if (!membership) {
      throw new UnauthorizedException(
        'Export requester membership is missing or inactive',
      );
    }

    if (
      membership.role.companyId &&
      membership.role.companyId !== membership.companyId
    ) {
      throw new UnauthorizedException('Export role organization is invalid');
    }

    if (membership.role.scope !== job.roleScope) {
      throw new UnauthorizedException('Export role scope is out of date');
    }

    if (job.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: job.branchId,
          companyId: job.companyId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      if (!branch) {
        throw new ForbiddenException('Export branch access is no longer valid');
      }

      if (job.roleScope === 'BRANCH' || job.roleScope === 'COMPANY') {
        const hasBranchAccess = membership.branchAccesses.some(
          (access) => access.branchId === job.branchId,
        );
        if (!hasBranchAccess) {
          throw new ForbiddenException('Export branch access is no longer valid');
        }
      }
    } else if (job.roleScope === 'BRANCH') {
      throw new UnauthorizedException('Export branch context is required');
    }

    const definition = reportDefinitions.find(
      (report) => report.key === job.reportKey,
    );
    if (!definition) {
      throw new ForbiddenException('Export report definition is no longer valid');
    }

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        roleId: job.roleId,
        OR: definition.requiredPermissions.map((permission) => ({
          permission: {
            resource: permission.resource,
            action: permission.action,
          },
        })),
        role: {
          tenantId: job.tenantId,
          OR: [{ companyId: null }, { companyId: job.companyId }],
        },
      },
      select: {
        permission: {
          select: {
            resource: true,
            action: true,
          },
        },
      },
    });

    const granted = new Set(
      rolePermissions.map(
        ({ permission }) => `${permission.resource}:${permission.action}`,
      ),
    );
    const hasAllPermissions = definition.requiredPermissions.every(
      (permission) =>
        granted.has(`${permission.resource}:${permission.action}`),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Export permission is no longer valid');
    }

    return {
      sub: job.requestedBy,
      tenantId: job.tenantId,
      membershipId: job.membershipId,
      roleId: job.roleId,
      companyId: job.companyId,
      branchId: job.branchId,
      roleScope: job.roleScope,
    };
  }
}
