import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { InstallmentsService } from './installments.service';

const createInstallmentPlanSchema = z.object({
  installmentCount: z.coerce.number().int().min(2).max(60),
  firstDueAt: z.coerce.date(),
  intervalMonths: z.coerce.number().int().positive().max(24).default(1),
});

@Controller('sales/:saleId/installment-plan')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('finance', 'read')
export class InstallmentsController {
  constructor(private readonly installmentsService: InstallmentsService) {}

  @Post()
  @RequirePermission('finance', 'manage')
  create(@Param('saleId') saleId: string, @Body() body: unknown) {
    return this.installmentsService.createPlan(saleId, createInstallmentPlanSchema.parse(body));
  }

  @Get()
  findOne(@Param('saleId') saleId: string) {
    return this.installmentsService.getPlan(saleId);
  }
}
