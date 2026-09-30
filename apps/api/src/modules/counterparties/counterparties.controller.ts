import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CounterpartiesService } from './counterparties.service';

const listSchema = z.object({
  kind: z.enum(['CUSTOMER', 'SUPPLIER']).optional(),
  search: z.string().trim().max(120).optional(),
});

const kindSchema = z.enum(['CUSTOMER', 'SUPPLIER']);

@Controller('cari-accounts')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('finance', 'read')
export class CounterpartiesController {
  constructor(private readonly service: CounterpartiesService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.service.list(listSchema.parse(query));
  }

  @Get(':kind/:id')
  detail(
    @Param('kind') kind: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.detail(kindSchema.parse(kind), id);
  }
}
