import { Module } from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { PlatformJwtStrategy } from '../../common/auth/platform-jwt.strategy';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { PlatformAuditReadService } from './platform-audit-read.service';
import { PlatformControlPlaneController } from './platform-control-plane.controller';
import { PlatformCustomerContextController } from './platform-customer-context.controller';
import { PlatformCustomerContextService } from './platform-customer-context.service';
import { PlatformEntitlementsController } from './platform-entitlements.controller';
import { PlatformEntitlementsService } from './platform-entitlements.service';
import { PlatformIamMutationService } from './platform-iam-mutation.service';
import { PlatformIamReadService } from './platform-iam-read.service';
import { PlatformPrivilegedExecutionService } from './platform-privileged-execution.service';
import { PlatformPrivilegedOperationsService } from './platform-privileged-operations.service';
import { PlatformProvisioningController } from './platform-provisioning.controller';
import { PlatformProvisioningService } from './platform-provisioning.service';
import { PlatformReadModelService } from './platform-read-model.service';
import { PlatformSubscriptionsController } from './platform-subscriptions.controller';
import { PlatformSubscriptionsService } from './platform-subscriptions.service';
import { PlatformTenantGovernanceReadService } from './platform-tenant-governance-read.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [
    PlatformControlPlaneController,
    PlatformCustomerContextController,
    PlatformSubscriptionsController,
    PlatformEntitlementsController,
    PlatformProvisioningController,
  ],
  providers: [
    PlatformReadModelService,
    PlatformTenantGovernanceReadService,
    PlatformCustomerContextService,
    PlatformSubscriptionsService,
    PlatformEntitlementsService,
    PlatformProvisioningService,
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
    PlatformSubscriptionsService,
    PlatformEntitlementsService,
    PlatformProvisioningService,
  ],
})
export class PlatformControlPlaneModule {}
