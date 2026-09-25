import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TeamService } from './team.service';

const conversationSchema = z.object({
  type: z.enum(['DIRECT', 'GROUP', 'CHANNEL']),
  name: z.string().trim().min(1).max(120).optional(),
  memberUserIds: z.array(z.string().uuid()).max(100).default([]),
  announcementOnly: z.boolean().optional(),
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  replyToMessageId: z.string().uuid().nullable().optional(),
});

const editMessageSchema = z.object({
  body: z.string().trim().min(1).max(10000),
});

const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
});

const groupMemberSchema = z.object({
  userId: z.string().uuid(),
});

const renameGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const typingSchema = z.object({
  typing: z.boolean(),
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

  @Sse('events')
  events(@CurrentUser() user: JwtPayload) {
    return this.team.events(user.sub);
  }

  @Get('unread-summary')
  unreadSummary(@CurrentUser() user: JwtPayload) {
    return this.team.unreadSummary(user.sub);
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

  @Patch('messages/:id')
  editMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = editMessageSchema.parse(body);
    return this.team.editMessage(user.sub, id, parsed.body);
  }

  @Delete('messages/:id')
  deleteMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.deleteMessage(user.sub, id);
  }

  @Post('messages/:id/pin')
  togglePin(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.togglePin(user.sub, id);
  }

  @Post('messages/:id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  addAttachment(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    if (!file) throw new BadRequestException('Dosya yüklenemedi.');
    return this.team.addAttachment(user.sub, id, file);
  }

  @Get('attachments/:id')
  async openAttachment(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const attachment = await this.team.openAttachment(user.sub, id);
    return new StreamableFile(attachment.stream, {
      type: attachment.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
    });
  }

  @Post('messages/:id/reactions')
  toggleReaction(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = reactionSchema.parse(body);
    return this.team.toggleReaction(user.sub, id, parsed.emoji);
  }

  @Get('conversations/:id/pins')
  pinnedMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.pinnedMessages(user.sub, id);
  }

  @Get('conversations/:id/search')
  searchMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('q') query?: string,
  ) {
    return this.team.searchMessages(user.sub, id, query ?? '');
  }

  @Patch('conversations/:id')
  renameGroup(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = renameGroupSchema.parse(body);
    return this.team.renameGroup(user.sub, id, parsed.name);
  }

  @Get('conversations/:id/members')
  conversationMembers(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.conversationMembers(user.sub, id);
  }

  @Post('conversations/:id/members')
  addGroupMember(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = groupMemberSchema.parse(body);
    return this.team.addGroupMember(user.sub, id, parsed.userId);
  }

  @Delete('conversations/:id/members/:userId')
  removeGroupMember(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.team.removeGroupMember(user.sub, id, userId);
  }

  @Get('conversations/:id/typing')
  typingUsers(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.typingUsers(user.sub, id);
  }

  @Post('conversations/:id/typing')
  setTyping(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = typingSchema.parse(body);
    return this.team.setTyping(user.sub, id, parsed.typing);
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
