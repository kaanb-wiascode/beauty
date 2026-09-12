import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingCertificateService } from './training-certificate.service';

@Controller('training/certificates')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingCertificateController {
  constructor(private readonly certificates:TrainingCertificateService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Get() @RequirePermission('training','read')
  list(@Query('staffId')staffId?:string,@Query('status')status?:string,@Query('limit')limit?:string){return this.certificates.list({staffId:staffId||undefined,status:status||undefined,limit:limit?Number(limit):undefined});}

  @Post('process-expired') @RequirePermission('training','manage')
  processExpired(@Query('limit')limit:string|undefined,@Req()req:{user?:{sub?:string}}){return this.certificates.processExpired(this.userId(req),limit?Number(limit):100);}

  @Post(':id/revoke') @RequirePermission('training','manage')
  revoke(@Param('id')id:string,@Body()body:{reason:string},@Req()req:{user?:{sub?:string}}){return this.certificates.revoke(id,body.reason,this.userId(req));}

  @Post(':id/renew') @RequirePermission('training','manage')
  renew(@Param('id')id:string,@Body()body:{dueAt?:string|null},@Req()req:{user?:{sub?:string}}){return this.certificates.assignRenewal(id,body??{},this.userId(req));}

  @Get(':id/events') @RequirePermission('training','read')
  events(@Param('id')id:string){return this.certificates.events(id);}
}
