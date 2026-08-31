import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { InventoryService } from './inventory.service';
@Controller('inventory')
@UseGuards(JwtAuthGuard,TenantAuthGuard)
export class InventoryController{constructor(private readonly inventory:InventoryService){}
 @Get('overview')overview(){return this.inventory.overview()}
 @Get('products')products(@Query('search') search?:string){return this.inventory.products(search)}
 @Post('products')createProduct(@Body() body:any){return this.inventory.createProduct(body)}
 @Post('movements')movement(@Body() body:any){return this.inventory.addMovement(body.productId,body.warehouseId,Number(body.quantity),body.type,body.unitCost!==undefined?Number(body.unitCost):undefined,body.referenceId,body.note)}
 @Get('movements')movements(@Query('limit') limit?:string){return this.inventory.movements(Number(limit||80))}
 @Get('services/:serviceId/materials')serviceMaterials(@Param('serviceId') id:string){return this.inventory.serviceMaterials(id)}
 @Post('services/:serviceId/materials')setServiceMaterials(@Param('serviceId') id:string,@Body() body:any){return this.inventory.setServiceMaterials(id,Array.isArray(body.materials)?body.materials:[])}
 @Get('purchase-requests')purchaseRequests(){return this.inventory.purchaseRequests()}
 @Get('suppliers')suppliers(){return this.inventory.suppliers()}
 @Post('suppliers')createSupplier(@Body() body:any){return this.inventory.createSupplier(body)}
 @Get('transfers')transfers(){return this.inventory.transfers()}
 @Post('transfers')createTransfer(@Body() body:any){return this.inventory.createTransfer(body)}
}