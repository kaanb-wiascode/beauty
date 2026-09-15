import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { FinanceSetupService } from './finance-setup.service';

const categorySchema = z.object({
  code: z.string().trim().min(1).max(50).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  parentId: z.string().uuid().optional(),
});

const costCenterSchema = z.object({
  code: z.string().trim().min(1).max(50).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(150),
});

@Controller('finance/setup')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('finance', 'read')
export class FinanceSetupController {
  constructor(private readonly service: FinanceSetupService) {}

  @Get('expense-categories')
  listCategories() {
    return this.service.listCategories();
  }

  @Post('expense-categories')
  @RequirePermission('finance', 'manage')
  createCategory(@Body() body: unknown) {
    return this.service.createCategory(categorySchema.parse(body));
  }

  @Get('cost-centers')
  listCostCenters() {
    return this.service.listCostCenters();
  }

  @Post('cost-centers')
  @RequirePermission('finance', 'manage')
  createCostCenter(@Body() body: unknown) {
    return this.service.createCostCenter(costCenterSchema.parse(body));
  }
}
