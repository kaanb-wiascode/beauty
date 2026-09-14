import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmCustomer360Service } from './crm-customer360.service';
import { CrmOperationsService } from './crm-operations.service';

const uuid = z.string().uuid();

const actionFollowUpsSchema = z
  .object({
    mode: z.enum(['OVERDUE', 'TODAY']),
    dayStart: z.coerce.date(),
    dayEnd: z.coerce.date(),
    assignedUserId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .refine((value) => value.dayEnd > value.dayStart, {
    message: 'dayEnd must be after dayStart.',
    path: ['dayEnd'],
  });

const staleOpportunitiesSchema = z.object({
  staleBefore: z.coerce.date(),
  ownerUserId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

@Controller('crm/operations')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmOperationsController {
  constructor(
    private readonly operations: CrmOperationsService,
    private readonly customer360: CrmCustomer360Service,
  ) {}

  @Get('follow-ups')
  @RequirePermission('crm', 'read')
  listFollowUps(@Query() query: unknown) {
    return this.operations.listActionFollowUps(actionFollowUpsSchema.parse(query));
  }

  @Get('stale-opportunities')
  @RequirePermission('crm', 'read')
  listStaleOpportunities(@Query() query: unknown) {
    return this.operations.listStaleOpportunities(staleOpportunitiesSchema.parse(query));
  }

  @Get('customer-360/:customerId')
  @RequirePermission('crm', 'read')
  getCustomer360(@Param('customerId') customerId: string) {
    return this.customer360.getSummary(uuid.parse(customerId));
  }
}
