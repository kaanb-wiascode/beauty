import { Injectable } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { reportDefinitions } from './report-definition';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCatalog(
    user: Pick<JwtPayload, 'roleId' | 'tenantId' | 'companyId'>,
  ) {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        roleId: user.roleId,
        role: {
          tenantId: user.tenantId,
          OR: [
            { companyId: null },
            { companyId: user.companyId },
          ],
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
        ({ permission }) =>
          `${permission.resource}:${permission.action}`,
      ),
    );

    return reportDefinitions.filter((report) =>
      report.requiredPermissions.every((permission) =>
        granted.has(`${permission.resource}:${permission.action}`),
      ),
    );
  }
}
