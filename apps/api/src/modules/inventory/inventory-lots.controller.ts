import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { InventoryLotsService } from './inventory-lots.service';

const uuid = z.string().uuid();

const lotListSchema = z.object({
  productId: uuid.optional(),
  warehouseId: uuid.optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
});

const createLotSchema = z
  .object({
    productId: uuid,
    warehouseId: uuid,
    lotNumber: z.string().trim().min(1).max(120),
    manufacturedAt: z.coerce.date().nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    quantity: z.coerce.number().positive(),
    unitCost: z.coerce.number().min(0).optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (value) =>
      !value.manufacturedAt ||
      !value.expiresAt ||
      value.manufacturedAt <= value.expiresAt,
    {
      message: 'Manufactured date cannot be after expiry date.',
      path: ['expiresAt'],
    },
  );

@Controller('inventory/lots')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('inventory', 'read')
export class InventoryLotsController {
  constructor(private readonly lots: InventoryLotsService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.lots.list(lotListSchema.parse(query));
  }

  @Post()
  @RequirePermission('inventory', 'write')
  create(@Body() body: unknown) {
    return this.lots.create(createLotSchema.parse(body));
  }
}
