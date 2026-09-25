import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { createCreatorCollaborationSchema, createCreatorSchema, listCreatorsSchema } from './creators.schemas';
import { CreatorsService } from './creators.service';

@Controller('corporate-communications/creators')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
@RequirePermission('communications','read')
export class CreatorsController {
  constructor(private readonly service:CreatorsService){}

  @Get()
  list(@Query() query:unknown){return this.service.list(listCreatorsSchema.parse(query));}

  @Post()
  @RequirePermission('communications','manage')
  create(@Body() body:unknown,@CurrentUser() user:JwtPayload){return this.service.create(createCreatorSchema.parse(body),user.sub);}

  @Get(':id/collaborations')
  collaborations(@Param('id',new ParseUUIDPipe()) id:string){return this.service.listCollaborations(id);}

  @Post(':id/collaborations')
  @RequirePermission('communications','manage')
  createCollaboration(@Param('id',new ParseUUIDPipe()) id:string,@Body() body:unknown,@CurrentUser() user:JwtPayload){return this.service.createCollaboration(id,createCreatorCollaborationSchema.parse(body),user.sub);}
}
