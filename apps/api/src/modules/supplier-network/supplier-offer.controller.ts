import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { SupplierOfferService } from './supplier-offer.service';

const uuid = z.string().uuid();
const commercialSchema = z.object({
  supplierSku: z.string().trim().max(120).optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  unitPrice: z.coerce.number().min(0),
  minimumOrderQuantity: z.coerce.number().positive().optional(),
  orderMultiple: z.coerce.number().positive().optional(),
  availableQuantity: z.coerce.number().min(0).nullable().optional(),
  leadTimeDays: z.coerce.number().int().min(0).optional(),
  preparationDays: z.coerce.number().int().min(0).optional(),
  shippingDays: z.coerce.number().int().min(0).optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validTo: z.coerce.date().nullable().optional(),
  visibilityScope: z.enum(['CONNECTED', 'RESTRICTED']).optional(),
  eligibleConnectionIds: z.array(uuid).max(500).optional(),
});
const createSchema = commercialSchema.extend({ catalogVariantId: uuid });
const updateSchema = commercialSchema.extend({
  expectedVersion: z.coerce.number().int().positive(),
});
const transitionSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
});

@Controller('supplier-portal/offers')
@UseGuards(SupplierPortalAuthGuard, SupplierPortalRoleGuard)
export class SupplierOfferController {
  constructor(private readonly offers: SupplierOfferService) {}

  private principal(req: SupplierPortalRequest) {
    if (!req.supplierPortalAuth) {
      throw new Error('Supplier portal principal missing after guard.');
    }
    return req.supplierPortalAuth;
  }

  @Get('catalog/variants')
  @SupplierPortalRoles('OWNER', 'ADMIN', 'MEMBER')
  catalogVariants(@Req() req: SupplierPortalRequest) {
    return this.offers.listCatalogVariants(this.principal(req));
  }

  @Get('eligibility-options')
  @SupplierPortalRoles('OWNER', 'ADMIN', 'MEMBER')
  eligibilityOptions(@Req() req: SupplierPortalRequest) {
    return this.offers.listEligibilityOptions(this.principal(req));
  }

  @Get()
  @SupplierPortalRoles('OWNER', 'ADMIN', 'MEMBER')
  list(@Req() req: SupplierPortalRequest) {
    return this.offers.list(this.principal(req));
  }

  @Post()
  @SupplierPortalRoles('OWNER', 'ADMIN')
  create(@Req() req: SupplierPortalRequest, @Body() body: unknown) {
    return this.offers.create(this.principal(req), createSchema.parse(body));
  }

  @Patch(':id')
  @SupplierPortalRoles('OWNER', 'ADMIN')
  update(
    @Param('id') id: string,
    @Req() req: SupplierPortalRequest,
    @Body() body: unknown,
  ) {
    return this.offers.update(
      this.principal(req),
      uuid.parse(id),
      updateSchema.parse(body),
    );
  }

  @Post(':id/activate')
  @SupplierPortalRoles('OWNER', 'ADMIN')
  activate(
    @Param('id') id: string,
    @Req() req: SupplierPortalRequest,
    @Body() body: unknown,
  ) {
    const parsed = transitionSchema.parse(body);
    return this.offers.transition(
      this.principal(req),
      uuid.parse(id),
      parsed.expectedVersion,
      'ACTIVE',
    );
  }

  @Post(':id/deactivate')
  @SupplierPortalRoles('OWNER', 'ADMIN')
  deactivate(
    @Param('id') id: string,
    @Req() req: SupplierPortalRequest,
    @Body() body: unknown,
  ) {
    const parsed = transitionSchema.parse(body);
    return this.offers.transition(
      this.principal(req),
      uuid.parse(id),
      parsed.expectedVersion,
      'INACTIVE',
    );
  }

  @Post(':id/archive')
  @SupplierPortalRoles('OWNER', 'ADMIN')
  archive(
    @Param('id') id: string,
    @Req() req: SupplierPortalRequest,
    @Body() body: unknown,
  ) {
    const parsed = transitionSchema.parse(body);
    return this.offers.transition(
      this.principal(req),
      uuid.parse(id),
      parsed.expectedVersion,
      'ARCHIVED',
    );
  }
}
