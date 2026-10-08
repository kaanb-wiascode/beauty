import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TemporaryAccessService } from './temporary-access.service';

const createTemporaryGrantSchema = z.object({
  membershipId: z.string().uuid(),
  permissionId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(3).max(500),
});

@Controller('admin/temporary-access')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TemporaryAccessController {
  constructor(private readonly service: TemporaryAccessService) {}

  @Get()
  @RequirePermission('roles', 'read')
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermission('roles', 'update')
  create(@Body() body: unknown) {
    return this.service.create(createTemporaryGrantSchema.parse(body));
  }

  @Post(':id/revoke')
  @RequirePermission('roles', 'update')
  revoke(@Param('id') id: string) {
    return this.service.revoke(id);
  }
}
