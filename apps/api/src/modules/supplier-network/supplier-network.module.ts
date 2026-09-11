import { Module } from '@nestjs/common';

import { SupplierNetworkController } from './supplier-network.controller';
import { SupplierNetworkService } from './supplier-network.service';

@Module({
  controllers: [SupplierNetworkController],
  providers: [SupplierNetworkService],
  exports: [SupplierNetworkService],
})
export class SupplierNetworkModule {}
