import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { SupplierCatalogBuyerService } from './supplier-catalog-buyer.service';

const uuid = z.string().uuid();
const linkSchema = z.object({ catalogVariantId: uuid });

@Controller('supplier-network/catalog')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('inventory', 'read')
export class SupplierCatalogBuyerController {
  constructor(private readonly catalog: SupplierCatalogBuyerService) {}

  private userId(req: { user?: { sub?: string } }) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return userId;
  }

  @Get('variants')
  listVariants() {
    return this.catalog.listVariants();
  }

  @Get('links')
  listLinks() {
    return this.catalog.listLinks();
  }

  @Post('products/:productId/link')
  @RequirePermission('inventory', 'write')
  linkProduct(
    @Param('productId') productId: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const parsed = linkSchema.parse(body);
    return this.catalog.linkProduct(
      uuid.parse(productId),
      parsed.catalogVariantId,
      this.userId(req),
    );
  }
}
