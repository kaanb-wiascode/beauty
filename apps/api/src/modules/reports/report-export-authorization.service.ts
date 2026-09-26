import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import type { ReportExportJobRecord } from './report-export-jobs.repository';
import { reportDefinitions } from './report-definition';

export type ReportExportAuthSnapshot = {
  tenantId: string;
  companyId: string;
  branchId: string | null;
  roleScope: JwtPayload['roleScope'];
  membershipId: string;
  roleId: string;
  requestedBy: string;
  reportKey: string;
};

@Injectable()
export class ReportExportAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  validate(job: ReportExportJobRecord): Promise<JwtPayload> {
    return this.validateSnapshot(job);
  }

  async validateSnapshot(snapshot: ReportExportAuthSnapshot): Promise<JwtPayload> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: snapshot.membershipId,
        userId: snapshot.requestedBy,
        tenantId: snapshot.tenantId,
        companyId: snapshot.companyId,
        roleId: snapshot.roleId,
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

    if (membership.role.scope !== snapshot.roleScope) {
      throw new UnauthorizedException('Export role scope is out of date');
    }

    if (snapshot.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: snapshot.branchId,
          companyId: snapshot.companyId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      if (!branch) {
        throw new ForbiddenException('Export branch access is no longer valid');
      }

      if (snapshot.roleScope === 'BRANCH' || snapshot.roleScope === 'COMPANY') {
        const hasBranchAccess = membership.branchAccesses.some(
          (access) => access.branchId === snapshot.branchId,
        );
        if (!hasBranchAccess) {
          throw new ForbiddenException('Export branch access is no longer valid');
        }
      }
    } else if (snapshot.roleScope === 'BRANCH') {
      throw new UnauthorizedException('Export branch context is required');
    }

    const definition = reportDefinitions.find(
      (report) => report.key === snapshot.reportKey,
    );
    if (!definition) {
      throw new ForbiddenException('Export report definition is no longer valid');
    }

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        roleId: snapshot.roleId,
        OR: definition.requiredPermissions.map((permission) => ({
          permission: {
            resource: permission.resource,
            action: permission.action,
          },
        })),
        role: {
          tenantId: snapshot.tenantId,
          OR: [{ companyId: null }, { companyId: snapshot.companyId }],
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
      sub: snapshot.requestedBy,
      tenantId: snapshot.tenantId,
      membershipId: snapshot.membershipId,
      roleId: snapshot.roleId,
      companyId: snapshot.companyId,
      branchId: snapshot.branchId,
      roleScope: snapshot.roleScope,
    };
  }
}
