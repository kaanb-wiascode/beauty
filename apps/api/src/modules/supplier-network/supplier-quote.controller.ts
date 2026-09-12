import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  SupplierPortalAuthGuard,
  type SupplierPortalRequest,
} from './supplier-portal-auth.guard';
import { SupplierPortalRoleGuard } from './supplier-portal-role.guard';
import { SupplierPortalRoles } from './supplier-portal-roles.decorator';
import { SupplierQuoteService } from './supplier-quote.service';

const uuid = z.string().uuid();
const quoteItemSchema = z.object({
  rfqItemId: uuid,
  unitPrice: z.coerce.number().min(0),
  availableQuantity: z.coerce.number().min(0).nullable().optional(),
  leadTimeDays: z.coerce.number().int().min(0).optional(),
  note: z.string().trim().max(500).optional(),
});
const saveQuoteSchema = z.object({
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  note: z.string().trim().max(2000).optional(),
  validUntil: z.coerce.date().nullable().optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  items: z.array(quoteItemSchema).min(1),
});
const transitionSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
});

@Controller('supplier-portal/rfqs')
@UseGuards(SupplierPortalAuthGuard, SupplierPortalRoleGuard)
export class SupplierQuoteController {
  constructor(private readonly quotes: SupplierQuoteService) {}

  private principal(req: SupplierPortalRequest) {
    if (!req.supplierPortalAuth) {
      throw new Error('Supplier portal principal missing after guard.');
    }
    return req.supplierPortalAuth;
  }

  @Get()
  @SupplierPortalRoles('OWNER', 'ADMIN', 'MEMBER')
  list(@Req() req: SupplierPortalRequest) {
    return this.quotes.list(this.principal(req));
  }

  @Get(':id')
  @SupplierPortalRoles('OWNER', 'ADMIN', 'MEMBER')
  get(@Param('id') id: string, @Req() req: SupplierPortalRequest) {
    return this.quotes.get(this.principal(req), uuid.parse(id));
  }

  @Post(':id/quote')
  @SupplierPortalRoles('OWNER', 'ADMIN')
  save(
    @Param('id') id: string,
    @Req() req: SupplierPortalRequest,
    @Body() body: unknown,
  ) {
    return this.quotes.save(
      this.principal(req),
      uuid.parse(id),
      saveQuoteSchema.parse(body),
    );
  }

  @Post(':id/quote/submit')
  @SupplierPortalRoles('OWNER', 'ADMIN')
  submit(
    @Param('id') id: string,
    @Req() req: SupplierPortalRequest,
    @Body() body: unknown,
  ) {
    const parsed = transitionSchema.parse(body);
    return this.quotes.submit(
      this.principal(req),
      uuid.parse(id),
      parsed.expectedVersion,
    );
  }

  @Post(':id/quote/withdraw')
  @SupplierPortalRoles('OWNER', 'ADMIN')
  withdraw(
    @Param('id') id: string,
    @Req() req: SupplierPortalRequest,
    @Body() body: unknown,
  ) {
    const parsed = transitionSchema.parse(body);
    return this.quotes.withdraw(
      this.principal(req),
      uuid.parse(id),
      parsed.expectedVersion,
    );
  }
}
