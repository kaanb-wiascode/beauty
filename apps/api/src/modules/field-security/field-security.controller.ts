import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { FieldSecurityService } from './field-security.service';

const policySchema = z.object({
  fieldGroup: z.string().trim().min(3).max(120),
  requiredResource: z.string().trim().min(1).max(120),
  requiredAction: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
});

@Controller('admin/field-security-policies')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class FieldSecurityController {
  constructor(private readonly service: FieldSecurityService) {}

  @Get()
  @RequirePermission('roles', 'read')
  list() {
    return this.service.list();
  }

  @Put()
  @RequirePermission('roles', 'update')
  upsert(@Body() body: unknown) {
    return this.service.upsert(policySchema.parse(body));
  }
}
