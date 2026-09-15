import { Module } from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { PlatformJwtStrategy } from '../../common/auth/platform-jwt.strategy';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import { PlatformControlPlaneController } from './platform-control-plane.controller';
import { PlatformReadModelService } from './platform-read-model.service';

@Module({
  controllers: [PlatformControlPlaneController],
  providers: [
    PlatformReadModelService,
    PlatformJwtStrategy,
    PlatformJwtAuthGuard,
    PlatformPermissionsGuard,
  ],
  exports: [PlatformReadModelService],
})
export class PlatformControlPlaneModule {}
