import { Controller, Get, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingEffectivenessService } from './training-effectiveness.service';

@Controller('training/effectiveness')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingEffectivenessController {
  constructor(private readonly effectiveness: TrainingEffectivenessService) {}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Post('process') @RequirePermission('training','manage')
  process(@Query('preWindowDays')preWindowDays:string|undefined,@Query('postWindowDays')postWindowDays:string|undefined,@Query('limit')limit:string|undefined,@Req()req:{user?:{sub?:string}}){
    return this.effectiveness.process(this.userId(req),{preWindowDays:preWindowDays?Number(preWindowDays):undefined,postWindowDays:postWindowDays?Number(postWindowDays):undefined,limit:limit?Number(limit):undefined});
  }

  @Get() @RequirePermission('training','read')
  list(@Query('branchId')branchId?:string,@Query('staffId')staffId?:string,@Query('outcome')outcome?:string,@Query('limit')limit?:string){
    return this.effectiveness.list({branchId:branchId||undefined,staffId:staffId||undefined,outcome:outcome||undefined,limit:limit?Number(limit):undefined});
  }
}
