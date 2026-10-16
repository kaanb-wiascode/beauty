import { Injectable } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { ReportExportInput } from './dto/report-export.dto';
import { ReportsService } from './reports.service';

@Injectable()
export class ReportExportWorkerContextService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async materialize(user: JwtPayload, input: ReportExportInput) {
    const contextId = ContextIdFactory.create();

    this.moduleRef.registerRequestByContextId(
      { user, reportExportWorker: true },
      contextId,
    );

    const tenantContext = await this.moduleRef.resolve(
      TenantContext,
      contextId,
      { strict: false },
    );
    tenantContext.setContext({
      tenantId: user.tenantId,
      membershipId: user.membershipId,
      companyId: user.companyId,
      branchId: user.branchId,
      roleScope: user.roleScope,
    });

    const reportsService = await this.moduleRef.resolve(
      ReportsService,
      contextId,
      { strict: false },
    );

    return reportsService.materializeExport(user, input);
  }
}
