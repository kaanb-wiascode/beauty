import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { AccountsReceivableService } from './accounts-receivable.service';

@Controller('accounts-receivable')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('finance', 'read')
export class AccountsReceivableController {
  constructor(private readonly service: AccountsReceivableService) {}

  @Get('summary')
  summary() {
    return this.service.summary();
  }

  @Get('aging')
  aging() {
    return this.service.aging();
  }

  @Get('open')
  open() {
    return this.service.openReceivables();
  }
}
