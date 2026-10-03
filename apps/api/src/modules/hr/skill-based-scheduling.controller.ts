import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { SkillBasedSchedulingService } from './skill-based-scheduling.service';

@Controller('hr/workforce/skill-scheduling')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
@RequirePermission('hr','read')
export class SkillBasedSchedulingController {
 constructor(private readonly scheduling:SkillBasedSchedulingService){}
 @Get('services/:serviceId/employees/:staffId/eligibility') eligibility(@Param('serviceId') serviceId:string,@Param('staffId') staffId:string,@Query('startAt') startAt:string,@Query('endAt') endAt:string){return this.scheduling.eligibility(staffId,serviceId,startAt,endAt)}
 @Get('services/:serviceId/candidates') candidates(@Param('serviceId') serviceId:string,@Query('startAt') startAt:string,@Query('endAt') endAt:string){return this.scheduling.candidates(serviceId,startAt,endAt)}
}
