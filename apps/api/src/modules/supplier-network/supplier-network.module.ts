import { Module } from '@nestjs/common';

import { PlatformAdminGuard } from '../../common/auth/platform-admin.guard';
import { PlatformSupplierNetworkController } from './platform-supplier-network.controller';
import { PlatformSupplierNetworkService } from './platform-supplier-network.service';
import { SupplierMembershipController } from './supplier-membership.controller';
import { SupplierMembershipService } from './supplier-membership.service';
import { SupplierNetworkController } from './supplier-network.controller';
import { SupplierNetworkService } from './supplier-network.service';

@Module({
  controllers: [
    SupplierNetworkController,
    PlatformSupplierNetworkController,
    SupplierMembershipController,
  ],
  providers: [
    SupplierNetworkService,
    PlatformSupplierNetworkService,
    SupplierMembershipService,
    PlatformAdminGuard,
  ],
  exports: [SupplierNetworkService],
})
export class SupplierNetworkModule {}
