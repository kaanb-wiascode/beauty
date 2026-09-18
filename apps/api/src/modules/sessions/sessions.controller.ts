import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { SessionsService } from './sessions.service';

const listSessionsSchema = z.object({
  customerPackageId: z.string().uuid().optional(),
  status: z.enum(['AVAILABLE', 'RESERVED', 'CONSUMED', 'CANCELLED']).optional(),
});

const reserveSchema = z.object({
  appointmentId: z.string().uuid(),
});

@Controller('sessions')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('appointments', 'read')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  findAll(@Query() query: unknown) {
    return this.sessionsService.findAll(listSessionsSchema.parse(query));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }

  @Post(':id/reserve')
  @RequirePermission('appointments', 'update')
  reserve(@Param('id') id: string, @Body() body: unknown) {
    const input = reserveSchema.parse(body);
    return this.sessionsService.reserve(id, input.appointmentId);
  }

  @Post(':id/release')
  @RequirePermission('appointments', 'update')
  release(@Param('id') id: string) {
    return this.sessionsService.release(id);
  }

  @Post(':id/consume')
  @RequirePermission('appointments', 'update')
  consume(@Param('id') id: string) {
    return this.sessionsService.consume(id);
  }

  @Post(':id/cancel')
  @RequirePermission('appointments', 'cancel')
  cancel(@Param('id') id: string) {
    return this.sessionsService.cancel(id);
  }
}
