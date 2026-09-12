import { Module } from '@nestjs/common';

import { MarketplaceBookingService } from './marketplace-booking.service';
import { MarketplaceController } from './marketplace.controller';
import { MarketplacePublicController } from './marketplace-public.controller';
import { MarketplacePublicRateLimitGuard } from './marketplace-public-rate-limit.guard';
import { MarketplaceService } from './marketplace.service';

@Module({
  controllers: [MarketplaceController, MarketplacePublicController],
  providers: [
    MarketplaceService,
    MarketplaceBookingService,
    MarketplacePublicRateLimitGuard,
  ],
})
export class MarketplaceModule {}
