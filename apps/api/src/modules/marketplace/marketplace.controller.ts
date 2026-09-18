import {
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { MarketplaceService } from './marketplace.service';

@Controller('marketplace')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class MarketplaceController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
  ) {}

  private userId(req: { user?: { sub?: string } }) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return userId;
  }

  @Get('preview')
  @UseGuards(PermissionsGuard)
  @RequirePermission('services', 'read')
  async previewCurrentBranch() {
    return this.marketplaceService.previewCurrentBranch();
  }

  @Get('publication')
  @UseGuards(PermissionsGuard)
  @RequirePermission('services', 'read')
  async publicationStatus() {
    return this.marketplaceService.publicationStatus();
  }

  @Post('publication/publish')
  @UseGuards(PermissionsGuard)
  @RequirePermission('services', 'update')
  async publishCurrentBranch(@Req() req: { user?: { sub?: string } }) {
    return this.marketplaceService.publishCurrentBranch(this.userId(req));
  }

  @Post('publication/unpublish')
  @UseGuards(PermissionsGuard)
  @RequirePermission('services', 'update')
  async unpublishCurrentBranch(@Req() req: { user?: { sub?: string } }) {
    return this.marketplaceService.unpublishCurrentBranch(this.userId(req));
  }
}
