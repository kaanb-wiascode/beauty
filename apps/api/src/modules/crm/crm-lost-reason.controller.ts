import { Body, Controller, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmLostReasonService } from './crm-lost-reason.service';
import { CrmLostTransitionService } from './crm-lost-transition.service';
const uuid=z.string().uuid(),reasonId=z.string().trim().min(1).max(64);
const createSchema=z.object({code:z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9_]+$/).transform(v=>v.toUpperCase()),label:z.string().trim().min(1).max(120),description:z.string().trim().max(1000).nullable().optional(),sortOrder:z.coerce.number().int().min(0).max(100000).optional()});
const activeSchema=z.object({isActive:z.boolean()});
const loseSchema=z.object({version:z.coerce.number().int().min(1),lostReasonId:reasonId,lostReasonNote:z.string().trim().max(2000).nullable().optional()});
const listSchema=z.object({includeInactive:z.enum(['true','false']).optional()});
@Controller('crm') @UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class CrmLostReasonController{
 constructor(private readonly reasons:CrmLostReasonService,private readonly transitions:CrmLostTransitionService){}
 private actor(req:{user?:{sub?:string}}){if(!req.user?.sub)throw new UnauthorizedException('Authenticated user id is missing.');return req.user.sub;}
 @Get('lost-reasons') @RequirePermission('crm','read') list(@Query() q:unknown){const i=listSchema.parse(q);return this.reasons.list(i.includeInactive==='true');}
 @Post('lost-reasons') @RequirePermission('crm','manage') create(@Body() b:unknown){return this.reasons.create(createSchema.parse(b));}
 @Patch('lost-reasons/:id/active') @RequirePermission('crm','manage') setActive(@Param('id') id:string,@Body() b:unknown){return this.reasons.setActive(reasonId.parse(id),activeSchema.parse(b).isActive);}
 @Post('leads/:id/lost') @RequirePermission('crm','manage') loseLead(@Param('id') id:string,@Body() b:unknown,@Req() r:{user?:{sub?:string}}){return this.transitions.loseLead(uuid.parse(id),loseSchema.parse(b),this.actor(r));}
 @Post('opportunities/:id/lost') @RequirePermission('crm','manage') loseOpportunity(@Param('id') id:string,@Body() b:unknown,@Req() r:{user?:{sub?:string}}){return this.transitions.loseOpportunity(uuid.parse(id),loseSchema.parse(b),this.actor(r));}
}
