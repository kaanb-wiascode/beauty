import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';

import { MarketplaceBookingService } from './marketplace-booking.service';
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

const bookingSchema = z.object({
  serviceId: z.string().uuid(),
  startAt: z.coerce.date(),
  idempotencyKey: z.string().trim().min(8).max(160),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().min(5).max(40).optional(),
}).refine((value) => Boolean(value.email || value.phone), {
  message: 'Email or phone is required.',
});

@Controller('public/marketplace')
export class MarketplacePublicController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly bookingService: MarketplaceBookingService,
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

  @Post(':companySlug/:branchCode/bookings')
  async book(
    @Param('companySlug') companySlug: string,
    @Param('branchCode') branchCode: string,
    @Body() body: unknown,
  ) {
    const scope = publicListingParamsSchema.parse({ companySlug, branchCode });
    const input = bookingSchema.parse(body);
    return this.bookingService.create({
      ...input,
      companySlug: scope.companySlug,
      branchCode: scope.branchCode,
    });
  }
}
