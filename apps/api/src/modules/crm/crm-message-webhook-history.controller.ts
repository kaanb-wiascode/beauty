import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmMessageWebhookHistoryService } from './crm-message-webhook-history.service';

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

@Controller('crm/message-webhook-events')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmMessageWebhookHistoryController {
  constructor(private readonly history: CrmMessageWebhookHistoryService) {}

  @Get()
  @RequirePermission('crm', 'read')
  list(@Query() query: unknown) {
    const { limit } = listSchema.parse(query);
    return this.history.list(limit);
  }
}
