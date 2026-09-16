import { Body, Controller, Get, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityOverdueService } from './quality-overdue.service';

@Controller('quality/overdue')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class QualityOverdueController {
  constructor(private readonly overdue: QualityOverdueService) {}

  private userId(req:{user?:{sub?:string}}){
    const id=req.user?.sub;
    if(!id)throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get()
  @RequirePermission('quality','read')
  list(@Query('limit')limit?:string){return this.overdue.list(limit?Number(limit):undefined);}

  @Post('process')
  @RequirePermission('quality','manage')
  process(@Body() body:{limit?:number},@Req() req:{user?:{sub?:string}}){
    return this.overdue.process(this.userId(req),body?.limit);
  }
}
