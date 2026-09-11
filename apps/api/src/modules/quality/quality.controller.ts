import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityService } from './quality.service';

@Controller('quality')
@UseGuards(JwtAuthGuard,TenantAuthGuard)
export class QualityController {
  constructor(private readonly quality:QualityService){}

  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Get('feedback')
  listFeedback(@Query('classification')classification?:string,@Query('customerId')customerId?:string,@Query('limit')limit?:string){
    return this.quality.listFeedback({classification:classification||undefined,customerId:customerId||undefined,limit:limit?Number(limit):undefined});
  }

  @Post('feedback')
  createFeedback(@Body()b:any,@Req()req:{user?:{sub?:string}}){
    return this.quality.createFeedback({
      branchId:b.branchId,customerId:b.customerId,appointmentId:b.appointmentId??null,serviceId:b.serviceId??null,staffId:b.staffId??null,careEventId:b.careEventId??null,
      source:['MANUAL','POST_SERVICE','COMPLAINT','CUSTOMER_PORTAL','IMPORT'].includes(b.source)?b.source:'MANUAL',
      classification:['UNCLASSIFIED','POSITIVE','NEUTRAL','NEGATIVE','CRITICAL'].includes(b.classification)?b.classification:'UNCLASSIFIED',
      overallRating:b.overallRating==null?null:Number(b.overallRating),comment:b.comment??null,
    },this.userId(req));
  }

  @Post('feedback/:id/escalate')
  escalate(@Param('id')id:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){
    const severity=['LOW','MEDIUM','HIGH','CRITICAL'].includes(b.severity)?b.severity:'MEDIUM';
    return this.quality.escalateFeedback(id,this.userId(req),{category:b.category,severity,title:b.title,assignedUserId:b.assignedUserId??null,slaDueAt:b.slaDueAt??null});
  }

  @Get('cases')
  listCases(@Query('status')status?:string,@Query('severity')severity?:string,@Query('assignedUserId')assignedUserId?:string,@Query('limit')limit?:string){
    return this.quality.listCases({status:status||undefined,severity:severity||undefined,assignedUserId:assignedUserId||undefined,limit:limit?Number(limit):undefined});
  }

  @Get('cases/:id') getCase(@Param('id')id:string){return this.quality.getCase(id);}

  @Post('cases')
  createCase(@Body()b:any,@Req()req:{user?:{sub?:string}}){
    const sourceType=['FEEDBACK','CARE_EVENT','MANUAL','INCIDENT'].includes(b.sourceType)?b.sourceType:'MANUAL';
    const severity=['LOW','MEDIUM','HIGH','CRITICAL'].includes(b.severity)?b.severity:'MEDIUM';
    return this.quality.createCase({branchId:b.branchId,feedbackId:b.feedbackId??null,careEventId:b.careEventId??null,customerId:b.customerId??null,appointmentId:b.appointmentId??null,serviceId:b.serviceId??null,staffId:b.staffId??null,sourceType,category:b.category,severity,title:b.title,description:b.description??null,assignedUserId:b.assignedUserId??null,slaDueAt:b.slaDueAt??null},this.userId(req));
  }

  @Post('cases/:id/assign')
  assign(@Param('id')id:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.quality.assign(id,b.assignedUserId??null,this.userId(req),b.note);}

  @Post('cases/:id/transition')
  transition(@Param('id')id:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){
    const status=String(b.status??'');
    if(!['INVESTIGATING','ACTION_REQUIRED','RESOLVED','CLOSED'].includes(status)) throw new Error('Invalid quality target status.');
    return this.quality.transition(id,status as 'INVESTIGATING'|'ACTION_REQUIRED'|'RESOLVED'|'CLOSED',this.userId(req),{rootCause:b.rootCause,correctiveAction:b.correctiveAction,preventiveAction:b.preventiveAction,resolution:b.resolution,customerFollowUp:b.customerFollowUp,note:b.note});
  }
}
