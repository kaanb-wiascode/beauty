import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('overview') overview() { return this.inventory.overview(); }
  @Get('products') products(@Query('search') search?: string) { return this.inventory.products(search); }
  @Post('products') createProduct(@Body() body: any) { return this.inventory.createProduct(body); }
  @Post('movements') movement(@Body() body: any) {
    return this.inventory.addMovement(body.productId, body.warehouseId, Number(body.quantity), body.type, body.unitCost !== undefined ? Number(body.unitCost) : undefined, body.referenceId, body.note);
  }
  @Get('services/:serviceId/materials') serviceMaterials(@Param('serviceId') serviceId: string) { return this.inventory.serviceMaterials(serviceId); }
  @Post('services/:serviceId/materials') setServiceMaterials(@Param('serviceId') serviceId: string, @Body() body: any) { return this.inventory.setServiceMaterials(serviceId, Array.isArray(body.materials) ? body.materials : []); }
  @Get('purchase-requests') purchaseRequests() { return this.inventory.purchaseRequests(); }
}
