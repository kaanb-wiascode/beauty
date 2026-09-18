import { Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityInspectionCatalogService } from './quality-inspection-catalog.service';

@Controller('quality/inspections/catalog')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualityInspectionCatalogController {
  constructor(private readonly catalog: QualityInspectionCatalogService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get()
  @RequirePermission('quality', 'read')
  list() {
    return this.catalog.listCatalog();
  }

  @Post('install')
  @RequirePermission('quality', 'manage')
  install(@Req() req: { user?: { sub?: string } }) {
    return this.catalog.install(this.userId(req));
  }
}
