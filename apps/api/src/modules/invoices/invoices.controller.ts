import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { InvoicesService } from './invoices.service';

const listSchema = z.object({
  direction: z.enum(['SALES', 'PURCHASE']).optional(),
  status: z.enum(['DRAFT', 'ISSUED', 'CANCELLED']).optional(),
});

@Controller('invoices')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('finance', 'read')
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.service.list(listSchema.parse(query));
  }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.detail(id);
  }

  @Post('from-sale/:saleId')
  @RequirePermission('finance', 'manage')
  fromSale(@Param('saleId', new ParseUUIDPipe()) saleId: string) {
    return this.service.createDraftFromSale(saleId);
  }

  @Post('from-supplier-bill/:supplierBillId')
  @RequirePermission('finance', 'manage')
  fromSupplierBill(
    @Param('supplierBillId', new ParseUUIDPipe()) supplierBillId: string,
  ) {
    return this.service.createDraftFromSupplierBill(supplierBillId);
  }
}
