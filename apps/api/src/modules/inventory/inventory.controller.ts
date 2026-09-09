import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { InventoryService } from './inventory.service';

type InventoryBody = Record<string, unknown>;

type ServiceMaterialBody = {
  productId: string;
  quantity: number;
};

const stringField = (body: InventoryBody, key: string): string => {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${key} is required`);
  }
  return value;
};

const serviceMaterials = (body: InventoryBody): ServiceMaterialBody[] => {
  if (!Array.isArray(body.materials)) return [];

  return body.materials.map((material) => {
    if (!material || typeof material !== 'object') {
      throw new BadRequestException('Invalid service material');
    }

    const value = material as Record<string, unknown>;
    const productId = value.productId;
    const quantity = value.quantity;

    if (typeof productId !== 'string' || !productId.trim() || typeof quantity !== 'number') {
      throw new BadRequestException('Invalid service material');
    }

    return { productId, quantity };
  });
};

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('overview') overview() { return this.inventory.overview(); }
  @Get('products') products(@Query('search') search?: string) { return this.inventory.products(search); }
  @Post('products') createProduct(@Body() body: InventoryBody) { return this.inventory.createProduct(body); }
  @Get('categories') categories() { return this.inventory.categories(); }
  @Post('categories') createCategory(@Body() body: InventoryBody) { return this.inventory.createCategory(body); }

  @Post('movements') movement(@Body() body: InventoryBody) {
    return this.inventory.addMovement(
      stringField(body, 'productId'),
      stringField(body, 'warehouseId'),
      Number(body.quantity),
      stringField(body, 'type'),
      body.unitCost !== undefined ? Number(body.unitCost) : undefined,
      typeof body.referenceId === 'string' ? body.referenceId : undefined,
      typeof body.note === 'string' ? body.note : undefined,
    );
  }

  @Get('movements') movements(@Query('limit') limit?: string) { return this.inventory.movements(Number(limit || 80)); }
  @Get('services/:serviceId/materials') serviceMaterials(@Param('serviceId') id: string) { return this.inventory.serviceMaterials(id); }

  @Post('services/:serviceId/materials') setServiceMaterials(@Param('serviceId') id: string, @Body() body: InventoryBody) {
    return this.inventory.setServiceMaterials(id, serviceMaterials(body));
  }

  @Get('purchase-requests') purchaseRequests() { return this.inventory.purchaseRequests(); }
  @Get('suppliers') suppliers() { return this.inventory.suppliers(); }
  @Post('suppliers') createSupplier(@Body() body: InventoryBody) { return this.inventory.createSupplier(body); }
  @Get('purchase-orders') purchaseOrders() { return this.inventory.purchaseOrders(); }
  @Post('purchase-orders') createPurchaseOrder(@Body() body: InventoryBody) { return this.inventory.createPurchaseOrder(body); }
  @Get('assets') assets() { return this.inventory.assets(); }
  @Post('assets') createAsset(@Body() body: InventoryBody) { return this.inventory.createAsset(body); }
  @Get('assets/maintenance') assetMaintenance() { return this.inventory.assetMaintenance(); }
  @Post('assets/maintenance') createAssetMaintenance(@Body() body: InventoryBody) { return this.inventory.createAssetMaintenance(body); }
  @Get('notifications') notifications() { return this.inventory.notifications(); }
  @Get('transfers') transfers() { return this.inventory.transfers(); }
  @Post('transfers') createTransfer(@Body() body: InventoryBody) { return this.inventory.createTransfer(body); }
}
