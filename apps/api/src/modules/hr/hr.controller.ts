import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { HrService } from './hr.service';

@Controller('hr')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Get('attendance')
  attendance() {
    return this.hrService.attendance();
  }

  @Get('leaves')
  leaves() {
    return this.hrService.leaves();
  }

  @Get('payroll')
  payroll() {
    return this.hrService.payroll();
  }
}
