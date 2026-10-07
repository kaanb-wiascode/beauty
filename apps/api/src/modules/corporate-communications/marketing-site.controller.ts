import {
  Body,
  Controller,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  MarketingPublicRateLimit,
  MarketingPublicRateLimitGuard,
} from './marketing-public-rate-limit.guard';
import { demoRequestSchema } from './marketing-site.schemas';
import { MarketingSiteService } from './marketing-site.service';

@Controller('marketing-site')
@UseGuards(MarketingPublicRateLimitGuard)
export class MarketingSiteController {
  constructor(private readonly marketingSite: MarketingSiteService) {}

  @Post('demo-requests')
  @MarketingPublicRateLimit('demo-request', 8, 15 * 60)
  createDemoRequest(
    @Body() body: unknown,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.marketingSite.createDemoRequest(
      demoRequestSchema.parse(body),
      userAgent,
    );
  }
}
