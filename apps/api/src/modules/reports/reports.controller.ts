import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('catalog')
  @RequirePermission('reports', 'read')
  getCatalog(@Req() request: { user: JwtPayload }) {
    return this.reportsService.getCatalog(request.user);
  }
}
