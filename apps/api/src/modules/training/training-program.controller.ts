import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingProgramService } from './training-program.service';

@Controller('training/programs')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingProgramController {
  constructor(private readonly programs:TrainingProgramService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}
  @Get() @RequirePermission('training','read') list(){return this.programs.list();}
  @Post() @RequirePermission('training','manage') create(@Body()body:any,@Req()req:{user?:{sub?:string}}){return this.programs.createProgram(body,this.userId(req));}
  @Post(':programId/versions') @RequirePermission('training','manage') version(@Param('programId')id:string,@Req()req:{user?:{sub?:string}}){return this.programs.createVersion(id,this.userId(req));}
  @Post('versions/:versionId/items') @RequirePermission('training','manage') item(@Param('versionId')id:string,@Body()body:any){return this.programs.addItem(id,body);}
  @Post('versions/:versionId/publish') @RequirePermission('training','manage') publish(@Param('versionId')id:string,@Req()req:{user?:{sub?:string}}){return this.programs.publish(id,this.userId(req));}
  @Post(':programId/assign') @RequirePermission('training','manage') assign(@Param('programId')id:string,@Body()body:any,@Req()req:{user?:{sub?:string}}){return this.programs.assign(id,body,this.userId(req));}
}
