import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PlatformAdminGuard } from '../../common/auth/platform-admin.guard';
import { PlatformSupplierNetworkService } from './platform-supplier-network.service';

const organizationTypeSchema = z.enum([
  'MANUFACTURER',
  'DISTRIBUTOR',
  'IMPORTER',
  'WHOLESALER',
  'RETAILER',
  'SERVICE_PROVIDER',
  'OTHER',
]);

const listQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const idSchema = z.string().uuid();

const taxIdentityShape = {
  taxCountry: z.string().trim().min(2).max(2).toUpperCase().nullable().optional(),
  taxNumber: z.string().trim().min(1).max(64).nullable().optional(),
};

function validateTaxIdentity(
  value: { taxCountry?: string | null; taxNumber?: string | null },
  ctx: z.RefinementCtx,
) {
  const countryProvided = value.taxCountry !== undefined;
  const numberProvided = value.taxNumber !== undefined;

  if (countryProvided !== numberProvided) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'taxCountry and taxNumber must be provided together',
    });
    return;
  }

  if (
    countryProvided &&
    ((value.taxCountry === null) !== (value.taxNumber === null))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'taxCountry and taxNumber must both be values or both be null',
    });
  }
}

const createOrganizationSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .transform((value) => value.toLowerCase())
      .refine((value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), {
        message: 'Invalid supplier organization slug',
      }),
    legalName: z.string().trim().min(2).max(200),
    displayName: z.string().trim().min(2).max(160),
    organizationType: organizationTypeSchema.default('OTHER'),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
    website: z.string().trim().url().max(500).nullable().optional(),
    email: z.string().trim().email().max(320).nullable().optional(),
    phone: z.string().trim().min(3).max(40).nullable().optional(),
    ...taxIdentityShape,
  })
  .superRefine(validateTaxIdentity);

const updateOrganizationSchema = z
  .object({
    legalName: z.string().trim().min(2).max(200).optional(),
    displayName: z.string().trim().min(2).max(160).optional(),
    organizationType: organizationTypeSchema.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
    website: z.string().trim().url().max(500).nullable().optional(),
    email: z.string().trim().email().max(320).nullable().optional(),
    phone: z.string().trim().min(3).max(40).nullable().optional(),
    ...taxIdentityShape,
  })
  .superRefine(validateTaxIdentity)
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

@Controller('platform/supplier-network')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformSupplierNetworkController {
  constructor(
    private readonly platformSupplierNetwork: PlatformSupplierNetworkService,
  ) {}

  @Get('organizations')
  async listOrganizations(@Query() query: unknown) {
    return this.platformSupplierNetwork.listOrganizations(
      listQuerySchema.parse(query),
    );
  }

  @Get('organizations/:id')
  async getOrganization(@Param('id') id: string) {
    return this.platformSupplierNetwork.getOrganization(idSchema.parse(id));
  }

  @Post('organizations')
  async createOrganization(
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.platformSupplierNetwork.createOrganization(
      createOrganizationSchema.parse(body),
      user.sub,
    );
  }

  @Patch('organizations/:id')
  async updateOrganization(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.platformSupplierNetwork.updateOrganization(
      idSchema.parse(id),
      updateOrganizationSchema.parse(body),
      user.sub,
    );
  }
}
