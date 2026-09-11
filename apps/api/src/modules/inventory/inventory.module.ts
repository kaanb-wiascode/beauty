import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { WarehouseAccountingService } from './warehouse-accounting.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, WarehouseAccountingService],
  exports: [InventoryService, WarehouseAccountingService],
})
export class InventoryModule {}
