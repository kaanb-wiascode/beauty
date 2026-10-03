import { Body, Controller, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ProcurementOfferOrderService } from './procurement-offer-order.service';

const uuid = z.string().uuid();
const createSchema = z.object({
  warehouseId: uuid,
  inventoryProductId: uuid,
  quantity: z.coerce.number().positive(),
  expectedOfferVersion: z.coerce.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(160),
});

@Controller('procurement/supplier-offers')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('inventory', 'write')
export class ProcurementOfferOrderController {
  constructor(private readonly service: ProcurementOfferOrderService) {}

  private userId(req: { user?: { sub?: string } }) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is missing.');
    return userId;
  }

  @Post(':offerId/purchase-order')
  createDraftOrder(
    @Param('offerId') offerId: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.service.createDraftOrder(
      uuid.parse(offerId),
      createSchema.parse(body),
      this.userId(req),
    );
  }
}
