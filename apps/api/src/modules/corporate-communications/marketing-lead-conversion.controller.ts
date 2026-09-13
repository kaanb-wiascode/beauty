import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { MarketingLeadCrmBridgeService } from './marketing-lead-crm-bridge.service';

@Controller('corporate-communications/leads')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class MarketingLeadConversionController {
  constructor(private readonly leadConversionService: MarketingLeadCrmBridgeService) {}

  @Post(':id/convert-to-crm')
  @RequirePermission('communications', 'manage')
  convertToCrm(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.leadConversionService.convertToCrm(id, user.sub);
  }
}
