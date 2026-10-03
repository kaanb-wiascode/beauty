import { Injectable } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';

export type ReportExportBranding = {
  companyName: string;
  branchName: string | null;
};

@Injectable()
export class ReportExportBrandingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(user: JwtPayload): Promise<ReportExportBranding> {
    const company = await this.prisma.company.findFirst({
      where: {
        id: user.companyId,
        tenantId: user.tenantId,
        status: 'ACTIVE',
      },
      select: { name: true },
    });

    if (!company) {
      return { companyName: 'WiOS 360', branchName: null };
    }

    if (!user.branchId) {
      return { companyName: company.name, branchName: null };
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: user.branchId,
        companyId: user.companyId,
        status: 'ACTIVE',
      },
      select: { name: true },
    });

    return {
      companyName: company.name,
      branchName: branch?.name ?? null,
    };
  }
}
