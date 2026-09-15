import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { RestrictTenantMutations } from '../../common/tenant/tenant-lifecycle-policy.decorator';
import { IncomeRecordsService } from './income-records.service';

const createIncomeSchema = z.object({
  categoryId: z.string().uuid(),
  costCenterId: z.string().uuid().optional(),
  counterpartyName: z.string().trim().max(200).optional(),
  counterpartyTaxNumber: z.string().trim().max(50).optional(),
  documentType: z.string().trim().max(80).optional(),
  documentNumber: z.string().trim().max(100).optional(),
  documentDate: z.coerce.date().optional(),
  documentUrl: z.string().url().max(2000).optional(),
  transactionDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  grossAmount: z.coerce.number().nonnegative(),
  netAmount: z.coerce.number().nonnegative(),
  taxAmount: z.coerce.number().nonnegative().default(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('TRY'),
  exchangeRate: z.coerce.number().positive().default(1),
  description: z.string().trim().max(1000).optional(),
  sourceType: z.string().trim().max(100).optional(),
  sourceId: z.string().trim().max(150).optional(),
});

const updateIncomeSchema = createIncomeSchema.partial().extend({
  version: z.coerce.number().int().positive(),
});

const listSchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
const reasonSchema = z.object({ reason: z.string().trim().min(1).max(500) });

@Controller('finance/income')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RestrictTenantMutations()
@RequirePermission('finance', 'read')
export class IncomeRecordsController {
  constructor(private readonly service: IncomeRecordsService) {}

  @Post()
  @RequirePermission('finance', 'manage')
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.service.create(createIncomeSchema.parse(body), user.sub);
  }

  @Get()
  list(@Query() query: unknown) {
    return this.service.list(listSchema.parse(query).limit);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @RequirePermission('finance', 'manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, updateIncomeSchema.parse(body), user.sub);
  }

  @Post(':id/submit')
  @RequirePermission('finance', 'manage')
  submit(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.transitionApproval(id, 'SUBMITTED', user.sub);
  }

  @Post(':id/approve')
  @RequirePermission('finance', 'manage')
  approve(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.transitionApproval(id, 'APPROVED', user.sub);
  }

  @Post(':id/reject')
  @RequirePermission('finance', 'manage')
  reject(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.service.transitionApproval(id, 'REJECTED', user.sub, reasonSchema.parse(body).reason);
  }

  @Post(':id/cancel')
  @RequirePermission('finance', 'manage')
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.service.transitionApproval(id, 'CANCELLED', user.sub, reasonSchema.parse(body).reason);
  }
}
