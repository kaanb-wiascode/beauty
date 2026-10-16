import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingDevelopmentAutomationService } from './training-development-automation.service';
import { TrainingDevelopmentPlanService } from './training-development-plan.service';
import { TrainingPlanningService } from './training-planning.service';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createDevelopmentPlanSchema = z.object({
  branchId: uuid,
  staffId: uuid,
  title: z.string().trim().min(1).max(240),
  startDate: date.optional(),
  targetDate: date.nullable().optional(),
  ownerUserId: uuid.nullable().optional(),
}).strict();
const developmentPlanItemSchema = z.object({
  sequence: z.number().int().positive(),
  itemType: z.enum(['COMPETENCY','COURSE','PROGRAM','ACTION','COACHING','MENTORING','PROJECT','STRETCH_ASSIGNMENT']),
  competencyId: uuid.nullable().optional(),
  courseId: uuid.nullable().optional(),
  programId: uuid.nullable().optional(),
  targetLevel: z.number().min(0).max(100).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  dueDate: date.nullable().optional(),
  activityTitle: z.string().trim().min(1).max(240).nullable().optional(),
  activityDescription: z.string().trim().max(4000).nullable().optional(),
  facilitatorStaffId: uuid.nullable().optional(),
}).strict();

@Controller('training/planning')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingPlanningController {
  constructor(
    private readonly planning: TrainingPlanningService,
    private readonly developmentPlans: TrainingDevelopmentPlanService,
    private readonly developmentAutomation: TrainingDevelopmentAutomationService,
  ) {}

  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}
  @Get('calendar') @RequirePermission('training','read') calendar(@Query('from')from?:string,@Query('to')to?:string,@Query('branchId')branchId?:string){return this.planning.calendar({from,to,branchId});}
  @Post('sessions') @RequirePermission('training','manage') session(@Body()body:any,@Req()req:{user?:{sub?:string}}){return this.planning.createSession(body,this.userId(req));}
  @Post('sessions/:id/enroll') @RequirePermission('training','manage') enroll(@Param('id')id:string,@Body()body:any,@Req()req:{user?:{sub?:string}}){return this.planning.enroll(id,body,this.userId(req));}
  @Post('sessions/:id/start') @RequirePermission('training','manage') start(@Param('id')id:string,@Req()req:{user?:{sub?:string}}){return this.planning.transitionSession(id,'IN_PROGRESS',{},this.userId(req));}
  @Post('sessions/:id/complete') @RequirePermission('training','manage') complete(@Param('id')id:string,@Req()req:{user?:{sub?:string}}){return this.planning.transitionSession(id,'COMPLETED',{},this.userId(req));}
  @Post('sessions/:id/cancel') @RequirePermission('training','manage') cancel(@Param('id')id:string,@Body()body:any,@Req()req:{user?:{sub?:string}}){return this.planning.transitionSession(id,'CANCELLED',body,this.userId(req));}
  @Post('sessions/:sessionId/enrollments/:enrollmentId/:status') @RequirePermission('training','manage') enrollmentStatus(@Param('sessionId')sessionId:string,@Param('enrollmentId')enrollmentId:string,@Param('status')status:string,@Req()req:{user?:{sub?:string}}){return this.planning.transitionEnrollment(sessionId,enrollmentId,status,this.userId(req));}
  @Get('development-plans') @RequirePermission('training','read') plans(@Query('staffId')staffId?:string){return this.planning.listPlans(staffId||undefined);}
  @Get('development-plans/:id') @RequirePermission('training','read') planDetail(@Param('id')id:string){return this.developmentPlans.detail(uuid.parse(id));}
  @Post('development-plans') @RequirePermission('training','manage') plan(@Body()body:unknown,@Req()req:{user?:{sub?:string}}){return this.planning.createPlan(createDevelopmentPlanSchema.parse(body),this.userId(req));}
  @Post('development-plans/:id/items')
  @RequirePermission('training','manage')
  async item(@Param('id')id:string,@Body()body:unknown,@Req()req:{user?:{sub?:string}}){
    const planId=uuid.parse(id),actor=this.userId(req),input=developmentPlanItemSchema.parse(body);
    const item=await this.developmentPlans.addItem(planId,input,actor);
    if(input.itemType==='COURSE'||input.itemType==='PROGRAM'){
      const assignment=await this.developmentAutomation.materialize(planId,item.id,actor);
      return {...item,assignment};
    }
    return item;
  }
  @Post('development-plans/:id/items/:itemId/materialize') @RequirePermission('training','manage') materialize(@Param('id')id:string,@Param('itemId')itemId:string,@Req()req:{user?:{sub?:string}}){return this.developmentAutomation.materialize(uuid.parse(id),uuid.parse(itemId),this.userId(req));}
  @Post('development-plans/synchronize') @RequirePermission('training','manage') synchronize(@Query('limit')limit:string|undefined,@Req()req:{user?:{sub?:string}}){return this.developmentAutomation.synchronize(this.userId(req),limit?Number(limit):undefined);}
  @Post('development-plans/:id/items/:itemId/:status') @RequirePermission('training','manage') itemStatus(@Param('id')id:string,@Param('itemId')itemId:string,@Param('status')status:string,@Req()req:{user?:{sub?:string}}){return this.planning.transitionPlanItem(uuid.parse(id),uuid.parse(itemId),status,this.userId(req));}
  @Post('development-plans/:id/:status') @RequirePermission('training','manage') planStatus(@Param('id')id:string,@Param('status')status:string,@Req()req:{user?:{sub?:string}}){return this.planning.transitionPlan(uuid.parse(id),status,this.userId(req));}
}
