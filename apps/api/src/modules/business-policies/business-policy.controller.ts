import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { BusinessPolicyService } from './business-policy.service';

const createSchema=z.object({policyKey:z.string().trim().min(2).max(100),domain:z.string().trim().min(2).max(80),action:z.string().trim().min(1).max(80),name:z.string().trim().min(2).max(120),description:z.string().trim().max(500).optional(),rules:z.record(z.string(),z.unknown()).default({})});
const evaluateSchema=z.object({policyKey:z.string().trim().min(2).max(100),facts:z.record(z.string(),z.unknown()).default({})});

@Controller('admin/business-policies')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class BusinessPolicyController{
 constructor(private readonly service:BusinessPolicyService){}
 @Get() @RequirePermission('roles','read') list(@Query('domain') domain?:string){return this.service.list(domain?.trim()||undefined)}
 @Post() @RequirePermission('roles','update') create(@Body() body:unknown){return this.service.create(createSchema.parse(body))}
 @Post(':id/publish') @RequirePermission('roles','update') publish(@Param('id') id:string){return this.service.publish(id)}
 @Post('evaluate') @RequirePermission('roles','read') evaluate(@Body() body:unknown){return this.service.evaluate(evaluateSchema.parse(body))}
}
