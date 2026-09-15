import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { NotificationPolicyService } from './notification-policy.service';

@Controller('admin/notification-policies')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class NotificationPolicyController {
  constructor(private readonly policies: NotificationPolicyService) {}

  @Get()
  @RequirePermission('roles', 'read')
  list() {
    return this.policies.list();
  }

  @Put()
  @RequirePermission('roles', 'update')
  upsert(@Body() body: {
    eventKey?: string;
    audience?: string;
    channels?: string[];
    enabled?: boolean;
    description?: string;
  }) {
    return this.policies.upsert({
      eventKey: body.eventKey ?? '',
      audience: body.audience ?? '',
      channels: Array.isArray(body.channels) ? body.channels : [],
      enabled: body.enabled,
      description: body.description,
    });
  }
}
