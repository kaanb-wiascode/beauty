import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { FinanceConfigurationAuditService } from './finance-configuration-audit.service';

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  operation: z.enum(['CREATE', 'UPDATE', 'DELETE']).optional(),
});

@Controller('finance/setup/configuration-audit')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('finance', 'read')
export class FinanceConfigurationAuditController {
  constructor(private readonly service: FinanceConfigurationAuditService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.service.list(auditQuerySchema.parse(query));
  }
}
