import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { InventoryService } from './inventory.service';
import { WarehouseAccountingService } from './warehouse-accounting.service';
import { InventoryGovernanceService } from './inventory-governance.service';
import { InventoryTransferReceiptService } from './inventory-transfer-receipt.service';
import { InventoryValuationReportService } from './inventory-valuation-report.service';

const adjustmentSchema = z.object({
  warehouseId: z.string().uuid(),
  type: z.enum(['ADJUSTMENT_IN','ADJUSTMENT_OUT','DAMAGE','EXPIRED']),
  reason: z.string().trim().min(1).max(500),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
    unitCost: z.coerce.number().min(0).optional(),
  })).min(1),
});

const cycleCountSchema = z.object({
  warehouseId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  items: z.array(z.object({
    productId: z.string().uuid(),
    countedQuantity: z.coerce.number().min(0),
  })).min(1),
});
const cycleCountListSchema = z.object({
  status: z.enum(['DRAFT','SUBMITTED','APPROVED','REJECTED','POSTED']).optional(),
});
const rejectCycleCountSchema = z.object({ reason: z.string().trim().min(1).max(500) });
const valuationQuerySchema = z.object({ warehouseId: z.string().uuid().optional() });
const movementReportSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

@Controller('inventory')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
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
    if (!userId) throw new UnauthorizedException('Authenticated user id is missing.');
    return userId;
  }

  @Get('overview') overview(){ return this.inventory.overview(); }
  @Get('products') products(@Query('search') search?:string){ return this.inventory.products(search); }
  @Post('products') createProduct(@Body() body:any){ return this.inventory.createProduct(body); }
  @Get('categories') categories(){ return this.inventory.categories(); }
  @Post('categories') createCategory(@Body() body:any){ return this.inventory.createCategory(body); }
  @Post('movements') movement(@Body() body:any){ return this.inventory.addMovement(body.productId,body.warehouseId,Number(body.quantity),body.type,body.unitCost!==undefined?Number(body.unitCost):undefined,body.referenceId,body.note); }
  @Get('movements') movements(@Query('limit') limit?:string){ return this.inventory.movements(Number(limit||80)); }
  @Get('services/:serviceId/materials') serviceMaterials(@Param('serviceId') id:string){ return this.inventory.serviceMaterials(id); }
  @Post('services/:serviceId/materials') setServiceMaterials(@Param('serviceId') id:string,@Body() body:any){ return this.inventory.setServiceMaterials(id,Array.isArray(body.materials)?body.materials:[]); }
  @Get('purchase-requests') purchaseRequests(){ return this.inventory.purchaseRequests(); }
  @Get('suppliers') suppliers(){ return this.inventory.suppliers(); }
  @Post('suppliers') createSupplier(@Body() body:any){ return this.inventory.createSupplier(body); }
  @Get('purchase-orders') purchaseOrders(){ return this.inventory.purchaseOrders(); }
  @Post('purchase-orders') createPurchaseOrder(@Body() body:any){ return this.inventory.createPurchaseOrder(body); }
  @Get('assets') assets(){ return this.inventory.assets(); }
  @Post('assets') createAsset(@Body() body:any){ return this.inventory.createAsset(body); }
  @Get('assets/maintenance') assetMaintenance(){ return this.inventory.assetMaintenance(); }
  @Post('assets/maintenance') createAssetMaintenance(@Body() body:any){ return this.inventory.createAssetMaintenance(body); }
  @Get('notifications') notifications(){ return this.inventory.notifications(); }

  @Get('transfers') transfers(){ return this.inventory.transfers(); }
  @Post('transfers') createTransfer(@Body() body:any){ return this.inventory.createTransfer(body); }
  @Post('transfers/:id/approve') approveTransfer(@Param('id') id:string,@Req() req:{user?:{sub?:string}}){ return this.governance.approveTransfer(id,this.userId(req)); }
  @Post('transfers/:id/dispatch') dispatchTransfer(@Param('id') id:string,@Req() req:{user?:{sub?:string}}){ return this.governance.dispatchTransfer(id,this.userId(req)); }
  @Post('transfers/:id/receive') receiveTransfer(@Param('id') id:string,@Req() req:{user?:{sub?:string}}){ return this.transferReceipt.receive(id,this.userId(req)); }

  @Get('accounting/valuation') valuation(){ return this.warehouseAccounting.valuation(); }
  @Get('accounting/reconciliation') reconciliation(){ return this.warehouseAccounting.reconciliation(); }
  @Post('accounting/adjustments')
  postAdjustment(@Body() body:unknown,@Req() req:{user?:{sub?:string}}){
    const parsed=adjustmentSchema.parse(body);
    return this.warehouseAccounting.postAdjustment({...parsed,userId:this.userId(req)});
  }

  @Get('accounting/valuation/detail')
  valuationDetail(@Query() query:unknown){ const parsed=valuationQuerySchema.parse(query); return this.valuationReports.detail(parsed.warehouseId); }
  @Get('accounting/movement-summary')
  movementSummary(@Query() query:unknown){ const parsed=movementReportSchema.parse(query); return this.valuationReports.movementSummary(parsed.from,parsed.to,parsed.warehouseId); }
  @Get('accounting/in-transit') inTransit(){ return this.valuationReports.inTransit(); }

  @Post('cycle-counts')
  createCycleCount(@Body() body:unknown,@Req() req:{user?:{sub?:string}}){
    const parsed=cycleCountSchema.parse(body);
    return this.governance.createCycleCount({...parsed,userId:this.userId(req)});
  }
  @Get('cycle-counts')
  listCycleCounts(@Query() query:unknown){ const parsed=cycleCountListSchema.parse(query); return this.governance.listCycleCounts(parsed.status); }
  @Post('cycle-counts/:id/submit') submitCycleCount(@Param('id') id:string,@Req() req:{user?:{sub?:string}}){ return this.governance.submitCycleCount(id,this.userId(req)); }
  @Post('cycle-counts/:id/approve') approveCycleCount(@Param('id') id:string,@Req() req:{user?:{sub?:string}}){ return this.governance.approveCycleCount(id,this.userId(req)); }
  @Post('cycle-counts/:id/reject')
  rejectCycleCount(@Param('id') id:string,@Body() body:unknown,@Req() req:{user?:{sub?:string}}){
    return this.governance.rejectCycleCount(id,this.userId(req),rejectCycleCountSchema.parse(body).reason);
  }
  @Post('cycle-counts/:id/post') postCycleCount(@Param('id') id:string,@Req() req:{user?:{sub?:string}}){ return this.governance.postCycleCount(id,this.userId(req)); }
}
