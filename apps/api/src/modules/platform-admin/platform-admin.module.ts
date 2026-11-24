import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { DeviceSecurityGuard } from './guards/device-security.guard';

@Module({
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, DeviceSecurityGuard],
  exports: [PlatformAdminService, DeviceSecurityGuard],
})
export class PlatformAdminModule {}
