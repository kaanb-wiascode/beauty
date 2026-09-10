import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { ProcurementRequestsService } from './procurement-requests.service';

@Module({
  controllers: [ProcurementController],
  providers: [ProcurementService, ProcurementRequestsService],
  exports: [ProcurementService, ProcurementRequestsService],
})
export class ProcurementModule {}
