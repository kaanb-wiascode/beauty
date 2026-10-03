import { Body, Controller, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmOpportunityCommercialService } from './crm-opportunity-commercial.service';

const schema = z.object({
  version: z.coerce.number().int().min(1),
  estimatedValue: z.coerce.number().min(0).nullable().optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.coerce.date().nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
});

@Controller('crm/opportunities')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmCommercialController {
  constructor(private readonly service: CrmOpportunityCommercialService) {}

  @Patch(':id/commercial')
  @RequirePermission('crm', 'manage')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    const actorUserId = request.user?.sub;
    if (!actorUserId) throw new Error('Authenticated user id is missing.');
    return this.service.update(z.string().uuid().parse(id), schema.parse(body), actorUserId);
  }
}
