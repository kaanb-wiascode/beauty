import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { WarehouseAccountingService } from './warehouse-accounting.service';
import { InventoryGovernanceService } from './inventory-governance.service';
import { InventoryTransferReceiptService } from './inventory-transfer-receipt.service';
import { InventoryValuationReportService } from './inventory-valuation-report.service';

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryService,
    WarehouseAccountingService,
    InventoryGovernanceService,
    InventoryTransferReceiptService,
    InventoryValuationReportService,
  ],
  exports: [
    InventoryService,
    WarehouseAccountingService,
    InventoryGovernanceService,
    InventoryTransferReceiptService,
    InventoryValuationReportService,
  ],
})
export class InventoryModule {}
