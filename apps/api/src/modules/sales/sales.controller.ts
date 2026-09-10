import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { SalesService } from './sales.service';

const createSaleSchema = z.object({
  customerId: z.string().uuid(),
  discountTotal: z.coerce.number().min(0).default(0),
  items: z.array(z.object({
    type: z.enum(['SERVICE', 'PACKAGE']),
    referenceId: z.string().uuid(),
    quantity: z.coerce.number().int().positive().default(1),
  })).min(1),
});

@Controller('sales')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.salesService.create(createSaleSchema.parse(body));
  }

  @Get()
  findAll() {
    return this.salesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.salesService.confirm(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.salesService.cancel(id);
  }
}
