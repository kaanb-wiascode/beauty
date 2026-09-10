import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { InventoryService } from './inventory.service';
import type {
  InventoryAssetInput,
  InventoryAssetMaintenanceInput,
  InventoryCategoryInput,
  InventoryMaterialsInput,
  InventoryMovementInput,
  InventoryProductInput,
  InventoryPurchaseOrderInput,
  InventorySupplierInput,
  InventoryTransferInput,
} from './inventory.types';

type InventoryBody = Record<string, unknown>;

const stringField = (body: InventoryBody, key: string): string => {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${key} is required`);
  }
  return value;
};

const numberField = (body: InventoryBody, key: string): number => {
  const value = body[key];
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new BadRequestException(`${key} must be a number`);
  }
  return number;
};

const movementInput = (body: InventoryBody): InventoryMovementInput => ({
  productId: stringField(body, 'productId'),
  warehouseId: stringField(body, 'warehouseId'),
  quantity: numberField(body, 'quantity'),
  type: stringField(body, 'type'),
  unitCost: body.unitCost !== undefined ? numberField(body, 'unitCost') : undefined,
  referenceId: typeof body.referenceId === 'string' ? body.referenceId : undefined,
  note: typeof body.note === 'string' ? body.note : undefined,
});

const serviceMaterials = (body: InventoryBody): InventoryMaterialsInput => {
  if (!Array.isArray(body.materials)) return { materials: [] };

  return {
    materials: body.materials.map((material) => {
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
    }),
  };
};

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('overview')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'read')
  overview() { return this.inventory.overview(); }

  @Get('products')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'read')
  products(@Query('search') search?: string) { return this.inventory.products(search); }

  @Post('products')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'create')
  createProduct(@Body() body: InventoryProductInput) { return this.inventory.createProduct(body); }

  @Get('categories')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'read')
  categories() { return this.inventory.categories(); }

  @Post('categories')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'create')
  createCategory(@Body() body: InventoryCategoryInput) { return this.inventory.createCategory(body); }

  @Post('movements')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'create')
  movement(@Body() body: InventoryBody) {
    const input = movementInput(body);
    return this.inventory.addMovement(
      input.productId,
      input.warehouseId,
      input.quantity,
      input.type,
      input.unitCost,
      input.referenceId,
      input.note,
    );
  }

  @Get('movements')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'read')
  movements(@Query('limit') limit?: string) { return this.inventory.movements(Number(limit || 80)); }

  @Get('services/:serviceId/materials')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'read')
  serviceMaterials(@Param('serviceId') id: string) { return this.inventory.serviceMaterials(id); }

  @Post('services/:serviceId/materials')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'update')
  setServiceMaterials(@Param('serviceId') id: string, @Body() body: InventoryBody) {
    return this.inventory.setServiceMaterials(id, serviceMaterials(body).materials);
  }

  @Get('purchase-requests')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'read')
  purchaseRequests() { return this.inventory.purchaseRequests(); }

  @Get('suppliers')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'read')
  suppliers() { return this.inventory.suppliers(); }

  @Post('suppliers')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'create')
  createSupplier(@Body() body: InventorySupplierInput) { return this.inventory.createSupplier(body); }

  @Get('purchase-orders')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'read')
  purchaseOrders() { return this.inventory.purchaseOrders(); }

  @Post('purchase-orders')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'create')
  createPurchaseOrder(@Body() body: InventoryPurchaseOrderInput) { return this.inventory.createPurchaseOrder(body); }

  @Get('assets')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'read')
  assets() { return this.inventory.assets(); }

  @Post('assets')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'create')
  createAsset(@Body() body: InventoryAssetInput) { return this.inventory.createAsset(body); }

  @Get('assets/maintenance')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'read')
  assetMaintenance() { return this.inventory.assetMaintenance(); }

  @Post('assets/maintenance')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'create')
  createAssetMaintenance(@Body() body: InventoryAssetMaintenanceInput) { return this.inventory.createAssetMaintenance(body); }

  @Get('notifications')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'read')
  notifications() { return this.inventory.notifications(); }

  @Get('transfers')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'read')
  transfers() { return this.inventory.transfers(); }

  @Post('transfers')
  @UseGuards(PermissionsGuard)
  @RequirePermission('inventory', 'create')
  createTransfer(@Body() body: InventoryTransferInput) { return this.inventory.createTransfer(body); }
}
