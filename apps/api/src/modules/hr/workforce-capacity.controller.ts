import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { WorkforceCapacityService } from './workforce-capacity.service';

@Controller('hr/workforce/capacity')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
@RequirePermission('hr','read')
export class WorkforceCapacityController {
 constructor(private readonly capacity:WorkforceCapacityService){}
 @Get() analyze(@Query('from') from:string,@Query('to') to:string,@Query('branchId') branchId?:string){return this.capacity.analyze(from,to,branchId)}
 @Get('services') services(@Query('from') from:string,@Query('to') to:string,@Query('branchId') branchId?:string){return this.capacity.serviceCapacity(from,to,branchId)}
}
