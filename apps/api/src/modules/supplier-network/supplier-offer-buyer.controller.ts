import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { SupplierOfferBuyerService } from './supplier-offer-buyer.service';

const querySchema = z.object({ catalogVariantId: z.string().uuid().optional() });

@Controller('supplier-network/offers')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('inventory', 'read')
export class SupplierOfferBuyerController {
  constructor(private readonly offers: SupplierOfferBuyerService) {}

  @Get()
  list(@Query() query: unknown) {
    const parsed = querySchema.parse(query);
    return this.offers.listConnectedOffers(parsed.catalogVariantId);
  }
}
