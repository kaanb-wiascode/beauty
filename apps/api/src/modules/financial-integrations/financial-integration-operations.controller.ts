import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  FinancialIntegrationPermissionGuard,
  RequireFinancialIntegrationPermission,
} from './financial-integration-permission.guard';
import { FinancialIntegrationAuditService } from './financial-integration-audit.service';
import { FinancialIntegrationAlertsService } from './financial-integration-alerts.service';

const auditQuerySchema = z.object({
  entityId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(120).optional(),
  outcome: z.enum(['SUCCESS', 'FAILED']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

@Controller('financial-integrations')
@UseGuards(JwtAuthGuard, TenantAuthGuard, FinancialIntegrationPermissionGuard)
@RequireFinancialIntegrationPermission('read')
export class FinancialIntegrationOperationsController {
  constructor(
    private readonly audit: FinancialIntegrationAuditService,
    private readonly alerts: FinancialIntegrationAlertsService,
  ) {}

  @Get('audit-logs')
  auditLogs(@Query() query: unknown) {
    return this.audit.list(auditQuerySchema.parse(query));
  }

  @Get(':id/alerts')
  alertsForIntegration(@Param('id') id: string) {
    return this.alerts.get(id);
  }
}
