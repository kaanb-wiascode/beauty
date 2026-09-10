import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
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
@UseGuards(JwtAuthGuard, TenantAuthGuard)
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
  reserve(@Param('id') id: string, @Body() body: unknown) {
    const input = reserveSchema.parse(body);
    return this.sessionsService.reserve(id, input.appointmentId);
  }

  @Post(':id/release')
  release(@Param('id') id: string) {
    return this.sessionsService.release(id);
  }

  @Post(':id/consume')
  consume(@Param('id') id: string) {
    return this.sessionsService.consume(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.sessionsService.cancel(id);
  }
}
