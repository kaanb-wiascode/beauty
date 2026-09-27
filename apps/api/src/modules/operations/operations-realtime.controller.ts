import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TenantContext } from '../../common/tenant/tenant-context';
import { DomainEventsService } from '../../infrastructure/domain-events/domain-events.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/events')
export class OperationsRealtimeController {
  constructor(
    private readonly events: DomainEventsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Sse('stream')
  @UseGuards(PermissionsGuard)
  @RequirePermission('operations', 'read')
  stream(): Observable<MessageEvent> {
    const context = this.tenantContext.getContext();
    return this.events.stream({
      tenantId: context.tenantId,
      companyId: context.companyId,
      branchId: context.branchId ?? null,
    });
  }
}
