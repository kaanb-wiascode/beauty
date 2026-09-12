import { Module } from '@nestjs/common';

import { MarketplaceBookingService } from './marketplace-booking.service';
import { MarketplaceController } from './marketplace.controller';
import { MarketplacePublicController } from './marketplace-public.controller';
import { MarketplaceService } from './marketplace.service';

@Module({
  controllers: [MarketplaceController, MarketplacePublicController],
  providers: [MarketplaceService, MarketplaceBookingService],
})
export class MarketplaceModule {}
