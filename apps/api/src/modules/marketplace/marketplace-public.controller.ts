import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';

import { MarketplaceService } from './marketplace.service';

const publicListingParamsSchema = z.object({
  companySlug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  branchCode: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/),
});

@Controller('public/marketplace')
export class MarketplacePublicController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
  ) {}

  @Get(':companySlug/:branchCode')
  async listing(
    @Param('companySlug') companySlug: string,
    @Param('branchCode') branchCode: string,
  ) {
    const parsed = publicListingParamsSchema.parse({
      companySlug,
      branchCode,
    });
    return this.marketplaceService.publicListing(
      parsed.companySlug,
      parsed.branchCode,
    );
  }
}
