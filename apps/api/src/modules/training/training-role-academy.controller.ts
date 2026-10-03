import { Body, Controller, Delete, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingRoleAcademyService } from './training-role-academy.service';

const uuid=z.string().uuid();
const saveSchema=z.object({positionId:uuid,programId:uuid,autoAssign:z.boolean().optional()});

@Controller('training/role-academies')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingRoleAcademyController{
  constructor(private readonly academies:TrainingRoleAcademyService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Get()
  @RequirePermission('training','manage')
  list(){return this.academies.list();}

  @Post()
  @RequirePermission('training','manage')
  save(@Body() body:unknown,@Req() req:{user?:{sub?:string}}){return this.academies.save(saveSchema.parse(body),this.userId(req));}

  @Delete(':id')
  @RequirePermission('training','manage')
  deactivate(@Param('id') id:string){return this.academies.deactivate(uuid.parse(id));}

  @Post('process')
  @RequirePermission('training','manage')
  process(@Req() req:{user?:{sub?:string}}){return this.academies.process(this.userId(req));}
}
