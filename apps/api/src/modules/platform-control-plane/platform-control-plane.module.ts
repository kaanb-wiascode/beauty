import { Module } from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { PlatformJwtStrategy } from '../../common/auth/platform-jwt.strategy';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import { PlatformAuditReadService } from './platform-audit-read.service';
import { PlatformControlPlaneController } from './platform-control-plane.controller';
import { PlatformIamMutationService } from './platform-iam-mutation.service';
import { PlatformIamReadService } from './platform-iam-read.service';
import { PlatformPrivilegedExecutionService } from './platform-privileged-execution.service';
import { PlatformPrivilegedOperationsService } from './platform-privileged-operations.service';
import { PlatformReadModelService } from './platform-read-model.service';

@Module({
  controllers: [PlatformControlPlaneController],
  providers: [
    PlatformReadModelService,
    PlatformIamReadService,
    PlatformIamMutationService,
    PlatformAuditReadService,
    PlatformPrivilegedOperationsService,
    PlatformPrivilegedExecutionService,
    PlatformJwtStrategy,
    PlatformJwtAuthGuard,
    PlatformPermissionsGuard,
  ],
  exports: [PlatformReadModelService],
})
export class PlatformControlPlaneModule {}
