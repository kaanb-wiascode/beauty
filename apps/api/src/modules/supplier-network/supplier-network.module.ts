import { Module } from '@nestjs/common';
import { SupplierNetworkService } from './supplier-network.service';

@Module({
  providers: [SupplierNetworkService],
  exports: [SupplierNetworkService],
})
export class SupplierNetworkModule {}
