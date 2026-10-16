import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { PositionCompetencyService } from './position-competency.service';

@Controller('training/position-competencies')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class PositionCompetencyController {
  constructor(private readonly mappings:PositionCompetencyService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Get()
  @RequirePermission('training','read')
  list(){return this.mappings.listMappings();}

  @Post()
  @RequirePermission('training','manage')
  create(@Body()body:any,@Req()req:{user?:{sub?:string}}){return this.mappings.createMapping(body,this.userId(req));}

  @Post('process')
  @RequirePermission('training','manage')
  process(@Body()body:{limit?:number},@Req()req:{user?:{sub?:string}}){return this.mappings.process(this.userId(req),body?.limit);}
}
