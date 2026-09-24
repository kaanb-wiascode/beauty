import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TeamService } from './team.service';

const conversationSchema = z.object({
  type: z.enum(['DIRECT', 'GROUP']),
  name: z.string().trim().min(1).max(120).optional(),
  memberUserIds: z.array(z.string().uuid()).min(1).max(100),
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  replyToMessageId: z.string().uuid().nullable().optional(),
});

const presenceSchema = z.object({
  status: z.enum([
    'AVAILABLE',
    'BUSY',
    'IN_SESSION',
    'ON_BREAK',
    'IN_MEETING',
    'DO_NOT_DISTURB',
    'OFFLINE',
  ]),
  statusText: z.string().trim().max(160).nullable().optional(),
  statusUntil: z.coerce.date().nullable().optional(),
});

@Controller('team')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get('people')
  people(@CurrentUser() user: JwtPayload) {
    return this.team.people(user.sub);
  }

  @Get('conversations')
  conversations(@CurrentUser() user: JwtPayload) {
    return this.team.conversations(user.sub);
  }

  @Post('conversations')
  createConversation(
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ) {
    return this.team.createConversation(user.sub, conversationSchema.parse(body));
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
  ) {
    return this.team.messages(user.sub, id, Number(limit ?? 100));
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.team.sendMessage(user.sub, id, messageSchema.parse(body));
  }

  @Post('conversations/:id/read')
  markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.markRead(user.sub, id);
  }

  @Patch('presence')
  updatePresence(
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ) {
    return this.team.updatePresence(user.sub, presenceSchema.parse(body));
  }

  @Post('heartbeat')
  heartbeat(@CurrentUser() user: JwtPayload) {
    return this.team.heartbeat(user.sub);
  }
}
