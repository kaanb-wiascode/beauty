import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
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

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

@Controller('supplier-network')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class SupplierNetworkController {
  constructor(
    private readonly supplierNetwork: SupplierNetworkService,
  ) {}

  private userId(req: { user?: { sub?: string } }) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return userId;
  }

  @Get('connections')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'read')
  async listConnections() {
    return this.supplierNetwork.listConnections();
  }

  @Get('audit')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'read')
  async listAudit(@Query() query: unknown) {
    const input = auditQuerySchema.parse(query);
    return this.supplierNetwork.listAudit(input.limit);
  }

  @Post('connections')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'update')
  async connectInventorySupplier(
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = connectSupplierSchema.parse(body);
    return this.supplierNetwork.connectInventorySupplier(
      input,
      this.userId(req),
    );
  }
}
