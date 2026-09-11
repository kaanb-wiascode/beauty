import { Module } from '@nestjs/common';

import { MarketplaceController } from './marketplace.controller';
import { MarketplacePublicController } from './marketplace-public.controller';
import { MarketplaceService } from './marketplace.service';

@Module({
  controllers: [MarketplaceController, MarketplacePublicController],
  providers: [MarketplaceService],
})
export class MarketplaceModule {}
