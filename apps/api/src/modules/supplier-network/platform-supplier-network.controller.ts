import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/auth/platform-admin.guard';
import { PlatformSupplierNetworkService } from './platform-supplier-network.service';

const listQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const idSchema = z.string().uuid();

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
}
