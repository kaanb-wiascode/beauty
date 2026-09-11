import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { SupplierNetworkService } from './supplier-network.service';

const connectSupplierSchema = z.object({
  supplierOrganizationId: z.string().uuid(),
  inventorySupplierId: z.string().uuid(),
});

@Controller('supplier-network')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class SupplierNetworkController {
  constructor(
    private readonly supplierNetwork: SupplierNetworkService,
  ) {}

  @Get('connections')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'read')
  async listConnections() {
    return this.supplierNetwork.listConnections();
  }

  @Post('connections')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'update')
  async connectInventorySupplier(@Body() body: unknown) {
    const input = connectSupplierSchema.parse(body);
    return this.supplierNetwork.connectInventorySupplier(input);
  }
}
