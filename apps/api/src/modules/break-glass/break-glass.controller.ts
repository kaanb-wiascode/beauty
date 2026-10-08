import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { BreakGlassService } from './break-glass.service';

const reauthSchema = z.object({
  password: z.string().min(1).max(200),
  mfaCode: z.string().trim().regex(/^\d{6}$/),
});

const activateSchema = z.object({
  proofId: z.string().uuid(),
  permissionId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  durationMinutes: z.number().int().min(5).max(60),
  reason: z.string().trim().min(10).max(1000),
});

@Controller('admin/break-glass')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class BreakGlassController {
  constructor(private readonly service: BreakGlassService) {}

  @Get()
  @RequirePermission('roles', 'read')
  list() {
    return this.service.list();
  }

  @Post('reauthenticate')
  @RequirePermission('roles', 'update')
  reauthenticate(@Body() body: unknown) {
    const input = reauthSchema.parse(body);
    return this.service.reauthenticate(input.password, input.mfaCode);
  }

  @Post('activate')
  @RequirePermission('roles', 'update')
  activate(@Body() body: unknown) {
    return this.service.activate(activateSchema.parse(body));
  }

  @Post(':id/revoke')
  @RequirePermission('roles', 'update')
  revoke(@Param('id') id: string) {
    return this.service.revoke(id);
  }
}
