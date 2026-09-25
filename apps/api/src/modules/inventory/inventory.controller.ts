import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { InventoryService } from './inventory.service';
import { WarehouseAccountingService } from './warehouse-accounting.service';
import { InventoryGovernanceService } from './inventory-governance.service';
import { InventoryTransferReceiptService } from './inventory-transfer-receipt.service';
import { InventoryValuationReportService } from './inventory-valuation-report.service';

const uuid = z.string().uuid();
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();
const currency = z.string().trim().regex(/^[A-Z]{3}$/).optional();
const inventoryUnit = z.enum([
  'UNIT',
  'ML',
  'LITER',
  'GRAM',
  'KG',
  'METER',
  'PAIR',
  'BOX',
]);
const movementType = z.enum([
  'PURCHASE',
  'SERVICE_CONSUMPTION',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'DAMAGE',
  'EXPIRED',
  'RETURN',
]);
const purchaseStatus = z.enum([
  'DRAFT',
  'PENDING',
  'APPROVED',
  'ORDERED',
  'RECEIVED',
  'CANCELLED',
]);

const productSchema = z.object({
  categoryId: uuid.nullable().optional(),
  warehouseId: uuid.optional(),
  supplierId: uuid.nullable().optional(),
  name: z.string().trim().min(1).max(200),
  sku: optionalText(120),
  barcode: optionalText(120),
  brand: optionalText(120),
  manufacturer: optionalText(160),
  model: optionalText(160),
  description: optionalText(4000),
  originCountry: optionalText(120),
  packageQuantity: z.coerce.number().positive().nullable().optional(),
  unit: inventoryUnit.optional(),
  trackStock: z.boolean().optional(),
  trackExpiry: z.boolean().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  salePrice: z.coerce.number().min(0).optional(),
  currency,
  minimumOrderQuantity: z.coerce.number().positive().optional(),
  orderMultiple: z.coerce.number().positive().optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).optional(),
  preparationDays: z.coerce.number().int().min(0).max(3650).optional(),
  shippingDays: z.coerce.number().int().min(0).max(3650).optional(),
  returnable: z.boolean().optional(),
  imageUrl: optionalText(2000),
  notes: optionalText(4000),
  initialQuantity: z.coerce.number().min(0).optional(),
  minimumQuantity: z.coerce.number().min(0).optional(),
  targetQuantity: z.coerce.number().min(0).optional(),
  supplierProductCode: optionalText(120),
  isPrimary: z.boolean().optional(),
  unitCost: z.coerce.number().min(0).optional(),
  supplierMinimumOrderQuantity: z.coerce.number().positive().optional(),
  supplierOrderMultiple: z.coerce.number().positive().optional(),
  supplierLeadTimeDays: z.coerce.number().int().min(0).max(3650).optional(),
  supplierPreparationDays: z.coerce.number().int().min(0).max(3650).optional(),
  supplierShippingDays: z.coerce.number().int().min(0).max(3650).optional(),
});

const categorySchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: optionalText(80),
  parentId: uuid.nullable().optional(),
  description: optionalText(2000),
  defaultUnit: inventoryUnit.nullable().optional(),
});

const movementSchema = z.object({
  productId: uuid,
  warehouseId: uuid,
  quantity: z.coerce.number().positive(),
  type: movementType,
  unitCost: z.coerce.number().min(0).optional(),
  referenceId: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
});

const movementListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const serviceMaterialsSchema = z.object({
  materials: z
    .array(
      z.object({
        productId: uuid,
        quantity: z.coerce.number().positive(),
      }),
    )
    .max(500),
});

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: optionalText(160),
  phone: optionalText(40),
  email: z.string().email().max(320).nullable().optional(),
  taxNumber: optionalText(80),
  address: optionalText(2000),
  notes: optionalText(4000),
});

const purchaseOrderSchema = z.object({
  supplierId: uuid.nullable().optional(),
  warehouseId: uuid,
  status: purchaseStatus.optional(),
  note: optionalText(4000),
  orderedAt: z.coerce.date().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: uuid,
        quantity: z.coerce.number().positive(),
        unitCost: z.coerce.number().min(0),
      }),
    )
    .min(1)
    .max(1000),
});

const assetSchema = z.object({
  categoryId: uuid.nullable().optional(),
  assetCode: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  assetType: z.string().trim().min(1).max(80).optional(),
  brand: optionalText(120),
  model: optionalText(160),
  serialNumber: optionalText(160),
  status: z.string().trim().min(1).max(80).optional(),
  condition: z.string().trim().min(1).max(80).optional(),
  branchId: uuid.nullable().optional(),
  warehouseId: uuid.nullable().optional(),
  assignedToStaffId: uuid.nullable().optional(),
  purchaseDate: z.coerce.date().nullable().optional(),
  supplierId: uuid.nullable().optional(),
  invoiceNumber: optionalText(160),
  purchasePrice: z.coerce.number().min(0).optional(),
  currency,
  warrantyStart: z.coerce.date().nullable().optional(),
  warrantyEnd: z.coerce.date().nullable().optional(),
  maintenanceIntervalDays: z.coerce.number().int().positive().max(36500).nullable().optional(),
  nextMaintenanceAt: z.coerce.date().nullable().optional(),
  imageUrl: optionalText(2000),
  notes: optionalText(4000),
});

const assetMaintenanceSchema = z.object({
  assetId: uuid,
  type: z.string().trim().min(1).max(80).optional(),
  status: z.string().trim().min(1).max(80).optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  provider: optionalText(200),
  cost: z.coerce.number().min(0).optional(),
  currency,
  description: optionalText(4000),
});

const transferSchema = z
  .object({
    sourceWarehouseId: uuid,
    destinationWarehouseId: uuid,
    note: optionalText(4000),
    items: z
      .array(
        z.object({
          productId: uuid,
          quantity: z.coerce.number().positive(),
        }),
      )
      .min(1)
      .max(1000),
  })
  .refine(
    (value) => value.sourceWarehouseId !== value.destinationWarehouseId,
    {
      message: 'Source and destination warehouses must be different.',
      path: ['destinationWarehouseId'],
    },
  );

const adjustmentSchema = z.object({
  warehouseId: uuid,
  type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRED']),
  reason: z.string().trim().min(1).max(500),
  items: z
    .array(
      z.object({
        productId: uuid,
        quantity: z.coerce.number().positive(),
        unitCost: z.coerce.number().min(0).optional(),
      }),
    )
    .min(1),
});

const cycleCountSchema = z.object({
  warehouseId: uuid,
  reason: z.string().trim().min(1).max(500),
  items: z
    .array(
      z.object({
        productId: uuid,
        countedQuantity: z.coerce.number().min(0),
      }),
    )
    .min(1),
});
const cycleCountListSchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED']).optional(),
});
const rejectCycleCountSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
const valuationQuerySchema = z.object({ warehouseId: uuid.optional() });
const movementReportSchema = z
  .object({
    warehouseId: uuid.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'Start date must be before end date.',
    path: ['to'],
  });

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('inventory', 'read')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly warehouseAccounting: WarehouseAccountingService,
    private readonly governance: InventoryGovernanceService,
    private readonly transferReceipt: InventoryTransferReceiptService,
    private readonly valuationReports: InventoryValuationReportService,
  ) {}

  private userId(req: { user?: { sub?: string } }) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return userId;
  }

  @Get('overview')
  overview() {
    return this.inventory.overview();
  }

  @Get('products')
  products(@Query('search') search?: string) {
    return this.inventory.products(search?.trim().slice(0, 200));
  }

  @Post('products')
  @RequirePermission('inventory', 'write')
  createProduct(@Body() body: unknown) {
    return this.inventory.createProduct(productSchema.parse(body));
  }

  @Get('categories')
  categories() {
    return this.inventory.categories();
  }

  @Post('categories')
  @RequirePermission('inventory', 'write')
  createCategory(@Body() body: unknown) {
    return this.inventory.createCategory(categorySchema.parse(body));
  }

  @Post('movements')
  @RequirePermission('inventory', 'write')
  movement(@Body() body: unknown) {
    const input = movementSchema.parse(body);
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
  movements(@Query() query: unknown) {
    const input = movementListSchema.parse(query);
    return this.inventory.movements(input.limit ?? 80);
  }

  @Get('services/:serviceId/materials')
  serviceMaterials(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
  ) {
    return this.inventory.serviceMaterials(serviceId);
  }

  @Post('services/:serviceId/materials')
  @RequirePermission('inventory', 'write')
  setServiceMaterials(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body() body: unknown,
  ) {
    const input = serviceMaterialsSchema.parse(body);
    return this.inventory.setServiceMaterials(serviceId, input.materials);
  }

  @Get('purchase-requests')
  purchaseRequests() {
    return this.inventory.purchaseRequests();
  }

  @Get('suppliers')
  suppliers() {
    return this.inventory.suppliers();
  }

  @Post('suppliers')
  @RequirePermission('inventory', 'write')
  createSupplier(@Body() body: unknown) {
    return this.inventory.createSupplier(supplierSchema.parse(body));
  }

  @Get('purchase-orders')
  purchaseOrders() {
    return this.inventory.purchaseOrders();
  }

  @Post('purchase-orders')
  @RequirePermission('inventory', 'write')
  createPurchaseOrder(@Body() body: unknown) {
    return this.inventory.createPurchaseOrder(purchaseOrderSchema.parse(body));
  }

  @Get('assets')
  assets() {
    return this.inventory.assets();
  }

  @Post('assets')
  @RequirePermission('inventory', 'write')
  createAsset(@Body() body: unknown) {
    return this.inventory.createAsset(assetSchema.parse(body));
  }

  @Get('assets/maintenance')
  assetMaintenance() {
    return this.inventory.assetMaintenance();
  }

  @Post('assets/maintenance')
  @RequirePermission('inventory', 'write')
  createAssetMaintenance(@Body() body: unknown) {
    return this.inventory.createAssetMaintenance(
      assetMaintenanceSchema.parse(body),
    );
  }

  @Get('notifications')
  notifications() {
    return this.inventory.notifications();
  }

  @Get('transfers')
  transfers() {
    return this.inventory.transfers();
  }

  @Post('transfers')
  @RequirePermission('inventory', 'write')
  createTransfer(@Body() body: unknown) {
    return this.inventory.createTransfer(transferSchema.parse(body));
  }

  @Post('transfers/:id/approve')
  @RequirePermission('inventory', 'write')
  approveTransfer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.governance.approveTransfer(id, this.userId(req));
  }

  @Post('transfers/:id/dispatch')
  @RequirePermission('inventory', 'write')
  dispatchTransfer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.governance.dispatchTransfer(id, this.userId(req));
  }

  @Post('transfers/:id/receive')
  @RequirePermission('inventory', 'write')
  receiveTransfer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.transferReceipt.receive(id, this.userId(req));
  }

  @Get('accounting/valuation')
  valuation() {
    return this.warehouseAccounting.valuation();
  }

  @Get('accounting/reconciliation')
  reconciliation() {
    return this.warehouseAccounting.reconciliation();
  }

  @Post('accounting/adjustments')
  @RequirePermission('inventory', 'write')
  postAdjustment(
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const parsed = adjustmentSchema.parse(body);
    return this.warehouseAccounting.postAdjustment({
      ...parsed,
      userId: this.userId(req),
    });
  }

  @Get('accounting/valuation/detail')
  valuationDetail(@Query() query: unknown) {
    const parsed = valuationQuerySchema.parse(query);
    return this.valuationReports.detail(parsed.warehouseId);
  }

  @Get('accounting/movement-summary')
  movementSummary(@Query() query: unknown) {
    const parsed = movementReportSchema.parse(query);
    return this.valuationReports.movementSummary(
      parsed.from,
      parsed.to,
      parsed.warehouseId,
    );
  }

  @Get('accounting/in-transit')
  inTransit() {
    return this.valuationReports.inTransit();
  }

  @Post('cycle-counts')
  @RequirePermission('inventory', 'write')
  createCycleCount(
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const parsed = cycleCountSchema.parse(body);
    return this.governance.createCycleCount({
      ...parsed,
      userId: this.userId(req),
    });
  }

  @Get('cycle-counts')
  listCycleCounts(@Query() query: unknown) {
    const parsed = cycleCountListSchema.parse(query);
    return this.governance.listCycleCounts(parsed.status);
  }

  @Post('cycle-counts/:id/submit')
  @RequirePermission('inventory', 'write')
  submitCycleCount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.governance.submitCycleCount(id, this.userId(req));
  }

  @Post('cycle-counts/:id/approve')
  @RequirePermission('inventory', 'write')
  approveCycleCount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.governance.approveCycleCount(id, this.userId(req));
  }

  @Post('cycle-counts/:id/reject')
  @RequirePermission('inventory', 'write')
  rejectCycleCount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.governance.rejectCycleCount(
      id,
      this.userId(req),
      rejectCycleCountSchema.parse(body).reason,
    );
  }

  @Post('cycle-counts/:id/post')
  @RequirePermission('inventory', 'write')
  postCycleCount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.governance.postCycleCount(id, this.userId(req));
  }
}
