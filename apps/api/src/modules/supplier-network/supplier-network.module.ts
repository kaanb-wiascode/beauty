import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { PlatformAdminGuard } from '../../common/auth/platform-admin.guard';
import { PlatformSupplierNetworkController } from './platform-supplier-network.controller';
import { PlatformSupplierNetworkService } from './platform-supplier-network.service';
import { SupplierInvitationController } from './supplier-invitation.controller';
import { SupplierInvitationService } from './supplier-invitation.service';
import { SupplierMembershipController } from './supplier-membership.controller';
import { SupplierMembershipService } from './supplier-membership.service';
import { SupplierNetworkController } from './supplier-network.controller';
import { SupplierNetworkService } from './supplier-network.service';
import { SupplierPortalAuthController } from './supplier-portal-auth.controller';
import { SupplierPortalAuthGuard } from './supplier-portal-auth.guard';
import { SupplierPortalAuthService } from './supplier-portal-auth.service';
import { SupplierPortalRoleGuard } from './supplier-portal-role.guard';
import { SupplierVerificationController } from './supplier-verification.controller';
import { SupplierVerificationService } from './supplier-verification.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [
    SupplierNetworkController,
    PlatformSupplierNetworkController,
    SupplierMembershipController,
    SupplierVerificationController,
    SupplierPortalAuthController,
    SupplierInvitationController,
  ],
  providers: [
    SupplierNetworkService,
    PlatformSupplierNetworkService,
    SupplierMembershipService,
    SupplierVerificationService,
    SupplierPortalAuthService,
    SupplierInvitationService,
    SupplierPortalAuthGuard,
    SupplierPortalRoleGuard,
    PlatformAdminGuard,
  ],
  exports: [
    SupplierNetworkService,
    SupplierPortalAuthGuard,
    SupplierPortalRoleGuard,
  ],
})
export class SupplierNetworkModule {}
