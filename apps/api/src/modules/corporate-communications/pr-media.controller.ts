import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { createPrActivitySchema, listPrActivitiesSchema, updatePrActivitySchema } from './pr-media.schemas';
import { PrMediaService } from './pr-media.service';

@Controller('corporate-communications/pr-media')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
@RequirePermission('communications','read')
export class PrMediaController {
  constructor(private readonly service:PrMediaService){}

  @Get()
  list(@Query() query:unknown){return this.service.list(listPrActivitiesSchema.parse(query));}

  @Post()
  @RequirePermission('communications','manage')
  create(@Body() body:unknown,@CurrentUser() user:JwtPayload){return this.service.create(createPrActivitySchema.parse(body),user.sub);}

  @Patch(':id')
  @RequirePermission('communications','manage')
  update(@Param('id',new ParseUUIDPipe()) id:string,@Body() body:unknown){return this.service.update(id,updatePrActivitySchema.parse(body));}
}
