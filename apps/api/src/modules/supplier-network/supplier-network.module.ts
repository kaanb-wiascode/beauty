import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { PlatformAdminGuard } from '../../common/auth/platform-admin.guard';
import { PlatformSupplierNetworkController } from './platform-supplier-network.controller';
import { PlatformSupplierNetworkService } from './platform-supplier-network.service';
import { SupplierCatalogBuyerController } from './supplier-catalog-buyer.controller';
import { SupplierCatalogBuyerService } from './supplier-catalog-buyer.service';
import { SupplierCatalogController } from './supplier-catalog.controller';
import { SupplierCatalogService } from './supplier-catalog.service';
import { SupplierInvitationController } from './supplier-invitation.controller';
import { SupplierInvitationService } from './supplier-invitation.service';
import { SupplierMembershipController } from './supplier-membership.controller';
import { SupplierMembershipService } from './supplier-membership.service';
import { SupplierNetworkController } from './supplier-network.controller';
import { SupplierNetworkService } from './supplier-network.service';
import { SupplierOfferBuyerController } from './supplier-offer-buyer.controller';
import { SupplierOfferBuyerService } from './supplier-offer-buyer.service';
import { SupplierOfferController } from './supplier-offer.controller';
import { SupplierOfferService } from './supplier-offer.service';
import { SupplierPortalAuthController } from './supplier-portal-auth.controller';
import { SupplierPortalAuthGuard } from './supplier-portal-auth.guard';
import { SupplierPortalAuthService } from './supplier-portal-auth.service';
import { SupplierPortalRoleGuard } from './supplier-portal-role.guard';
import { SupplierQuoteController } from './supplier-quote.controller';
import { SupplierQuoteService } from './supplier-quote.service';
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
    SupplierCatalogController,
    SupplierCatalogBuyerController,
    SupplierOfferController,
    SupplierOfferBuyerController,
    SupplierQuoteController,
  ],
  providers: [
    SupplierNetworkService,
    PlatformSupplierNetworkService,
    SupplierMembershipService,
    SupplierVerificationService,
    SupplierPortalAuthService,
    SupplierInvitationService,
    SupplierCatalogService,
    SupplierCatalogBuyerService,
    SupplierOfferService,
    SupplierOfferBuyerService,
    SupplierQuoteService,
    SupplierPortalAuthGuard,
    SupplierPortalRoleGuard,
    PlatformAdminGuard,
  ],
  exports: [
    SupplierNetworkService,
    SupplierCatalogBuyerService,
    SupplierOfferBuyerService,
    SupplierQuoteService,
    SupplierPortalAuthGuard,
    SupplierPortalRoleGuard,
  ],
})
export class SupplierNetworkModule {}
