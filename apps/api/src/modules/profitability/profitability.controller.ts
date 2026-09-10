import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ProfitabilityService } from './profitability.service';

const filterSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

@Controller('profitability')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class ProfitabilityController {
  constructor(private readonly service: ProfitabilityService) {}

  @Get('summary')
  summary(@Query() query: unknown) {
    return this.service.summary(filterSchema.parse(query));
  }

  @Get('branches')
  byBranch(@Query() query: unknown) {
    return this.service.byBranch(filterSchema.parse(query));
  }

  @Get('services')
  byService(@Query() query: unknown) {
    return this.service.byService(filterSchema.parse(query));
  }

  @Get('staff')
  byStaff(@Query() query: unknown) {
    return this.service.byStaff(filterSchema.parse(query));
  }
}
