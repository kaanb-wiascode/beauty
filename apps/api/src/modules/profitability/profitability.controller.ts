import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ProfitabilityService } from './profitability.service';
import { NetProfitabilityService } from './net-profitability.service';
import { ProfitabilityConfigService } from './profitability-config.service';
import { CostCenterService } from './cost-center.service';

const filterSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const commissionSchema = z.object({
  rate: z.coerce.number().min(0).max(100),
});

const attributionSchema = z.object({
  appointmentId: z.string().uuid(),
});

const createCostCenterSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
});

const allocationSchema = z.object({
  allocations: z.array(z.object({
    branchId: z.string().uuid(),
    percent: z.coerce.number().positive().max(100),
  })).min(1),
});

const assignExpenseSchema = z.object({
  costCenterId: z.string().uuid(),
});

@Controller('profitability')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class ProfitabilityController {
  constructor(
    private readonly service: ProfitabilityService,
    private readonly net: NetProfitabilityService,
    private readonly config: ProfitabilityConfigService,
    private readonly costCenters: CostCenterService,
  ) {}

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

  @Post('staff/:staffId/commission')
  setStaffCommission(@Param('staffId') staffId: string, @Body() body: unknown) {
    const parsed = commissionSchema.parse(body);
    return this.config.setStaffCommission(staffId, parsed.rate);
  }

  @Post('sale-items/:saleItemId/attribute')
  attributeSaleItem(@Param('saleItemId') saleItemId: string, @Body() body: unknown) {
    const parsed = attributionSchema.parse(body);
    return this.config.attributeSaleItem(saleItemId, parsed.appointmentId);
  }

  @Post('cost-centers')
  createCostCenter(@Body() body: unknown) {
    return this.costCenters.create(createCostCenterSchema.parse(body));
  }

  @Get('cost-centers')
  listCostCenters() {
    return this.costCenters.list();
  }

  @Get('cost-centers/unallocated-expenses')
  listUnallocatedExpenses(@Query() query: unknown) {
    const parsed = filterSchema.parse(query);
    return this.costCenters.listUnallocatedExpenses(parsed.from, parsed.to);
  }

  @Post('cost-centers/:id/allocations')
  setCostCenterAllocations(@Param('id') id: string, @Body() body: unknown) {
    return this.costCenters.setAllocations(id, allocationSchema.parse(body));
  }

  @Post('journal-lines/:journalEntryLineId/cost-center')
  assignExpenseLine(
    @Param('journalEntryLineId') journalEntryLineId: string,
    @Body() body: unknown,
  ) {
    const parsed = assignExpenseSchema.parse(body);
    return this.costCenters.assignExpenseLine(journalEntryLineId, parsed.costCenterId);
  }

  @Get('net/summary')
  netSummary(@Query() query: unknown) {
    return this.net.summary(filterSchema.parse(query));
  }

  @Get('net/branches')
  netByBranch(@Query() query: unknown) {
    return this.net.byBranch(filterSchema.parse(query));
  }

  @Get('net/services')
  netByService(@Query() query: unknown) {
    return this.net.byService(filterSchema.parse(query));
  }

  @Get('net/staff')
  netByStaff(@Query() query: unknown) {
    return this.net.byStaff(filterSchema.parse(query));
  }

  @Get('net/customers')
  netByCustomer(@Query() query: unknown) {
    return this.net.byCustomer(filterSchema.parse(query));
  }
}
