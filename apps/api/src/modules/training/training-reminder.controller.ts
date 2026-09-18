import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingReminderService } from './training-reminder.service';

@Controller('training')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingReminderController {
  constructor(private readonly reminders: TrainingReminderService) {}

  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Post('reminders/process')
  @RequirePermission('training','manage')
  process(@Body() body:any,@Req() req:{user?:{sub?:string}}){return this.reminders.process(this.userId(req),body?.limit==null?undefined:Number(body.limit));}

  @Get('learner/me/reminders')
  @RequirePermission('training','read')
  mine(@Req() req:{user?:{sub?:string}}){return this.reminders.mine(this.userId(req));}

  @Post('learner/me/reminders/:reminderId/acknowledge')
  @RequirePermission('training','read')
  acknowledge(@Param('reminderId') reminderId:string,@Req() req:{user?:{sub?:string}}){return this.reminders.acknowledge(this.userId(req),reminderId);}
}
