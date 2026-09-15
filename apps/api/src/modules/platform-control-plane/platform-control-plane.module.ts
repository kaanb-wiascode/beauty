import { Module } from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { PlatformJwtStrategy } from '../../common/auth/platform-jwt.strategy';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { PlatformAuditReadService } from './platform-audit-read.service';
import { PlatformControlPlaneController } from './platform-control-plane.controller';
import { PlatformCustomerContextService } from './platform-customer-context.service';
import { PlatformIamMutationService } from './platform-iam-mutation.service';
import { PlatformIamReadService } from './platform-iam-read.service';
import { PlatformPrivilegedExecutionService } from './platform-privileged-execution.service';
import { PlatformPrivilegedOperationsService } from './platform-privileged-operations.service';
import { PlatformReadModelService } from './platform-read-model.service';
import { PlatformTenantGovernanceReadService } from './platform-tenant-governance-read.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [PlatformControlPlaneController],
  providers: [
    PlatformReadModelService,
    PlatformTenantGovernanceReadService,
    PlatformCustomerContextService,
    PlatformIamReadService,
    PlatformIamMutationService,
    PlatformAuditReadService,
    PlatformPrivilegedOperationsService,
    PlatformPrivilegedExecutionService,
    PlatformJwtStrategy,
    PlatformJwtAuthGuard,
    PlatformPermissionsGuard,
  ],
  exports: [
    PlatformReadModelService,
    PlatformTenantGovernanceReadService,
    PlatformCustomerContextService,
  ],
})
export class PlatformControlPlaneModule {}
