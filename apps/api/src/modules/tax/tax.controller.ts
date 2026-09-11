import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TaxService } from './tax.service';

const settingsSchema = z.object({
  salesVatRate: z.coerce.number().min(0).max(100),
  purchaseVatRate: z.coerce.number().min(0).max(100),
  pricesIncludeVat: z.boolean(),
});

const summarySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

@Controller('tax')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get('settings')
  settings() { return this.tax.getSettings(); }

  @Put('settings')
  updateSettings(@Body() body: unknown) {
    return this.tax.updateSettings(settingsSchema.parse(body));
  }

  @Get('summary')
  summary(@Query() query: unknown) {
    const parsed = summarySchema.parse(query);
    return this.tax.taxSummary(parsed.from, parsed.to);
  }
}
