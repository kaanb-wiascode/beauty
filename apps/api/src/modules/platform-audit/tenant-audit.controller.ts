import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from './platform-audit.service';

const tenantAuditQuerySchema = z
  .object({
    actorUserId: z.string().trim().min(1).optional(),
    resource: z.string().trim().min(1).optional(),
    action: z.string().trim().min(1).optional(),
    entityType: z.string().trim().min(1).optional(),
    entityId: z.string().trim().min(1).optional(),
    companyId: z.string().trim().min(1).optional(),
    branchId: z.string().trim().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    {
      message: 'Audit date range is invalid.',
      path: ['to'],
    },
  );

@Controller('admin/audit-events')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class TenantAuditController {
  constructor(
    private readonly platformAudit: PlatformAuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'read')
  async findAll(@Query() query: Record<string, unknown>) {
    const filter = tenantAuditQuerySchema.parse(query);
    return this.platformAudit.findTenantEvents(
      this.tenantContext.getTenantId(),
      filter,
    );
  }
}
