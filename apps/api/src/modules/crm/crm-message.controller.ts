import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmMessageService } from './crm-message.service';

const uuid = z.string().uuid();
const channel = z.enum(['EMAIL', 'SMS', 'WHATSAPP']);
const subject = z.object({
  customerId: uuid.optional(),
  leadId: uuid.optional(),
  opportunityId: uuid.optional(),
}).refine((value) => value.customerId || value.leadId || value.opportunityId, {
  message: 'customerId, leadId, or opportunityId is required.',
});
const listSchema = z.object({
  customerId: uuid.optional(),
  leadId: uuid.optional(),
  opportunityId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const manualSchema = subject.and(z.object({
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  channel,
  recipient: z.string().trim().min(3).max(320).optional(),
  subject: z.string().trim().min(1).max(300).optional(),
  body: z.string().trim().min(1).max(10000),
}));
const draftSchema = subject.and(z.object({
  channel,
  providerKey: z.string().trim().min(1).max(100).optional(),
  recipient: z.string().trim().min(3).max(320).optional(),
  subject: z.string().trim().min(1).max(300).optional(),
  body: z.string().trim().min(1).max(10000),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
}));
const sendSchema = z.object({ version: z.coerce.number().int().min(1) });

@Controller('crm/messages')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmMessageController {
  constructor(private readonly messages: CrmMessageService) {}

  private userId(request: { user?: { sub?: string } }) {
    const id = request.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get()
  @RequirePermission('crm', 'read')
  list(@Query() query: unknown) {
    return this.messages.list(listSchema.parse(query));
  }

  @Get('providers')
  @RequirePermission('crm', 'read')
  providers() {
    return this.messages.providerStatus();
  }

  @Get(':id')
  @RequirePermission('crm', 'read')
  get(@Param('id') id: string) {
    return this.messages.get(uuid.parse(id));
  }

  @Post('manual')
  @RequirePermission('crm', 'manage')
  logManual(
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.messages.logManual(manualSchema.parse(body), this.userId(request));
  }

  @Post('drafts')
  @RequirePermission('crm', 'manage')
  createDraft(
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.messages.createDraft(draftSchema.parse(body), this.userId(request));
  }

  @Post(':id/send')
  @RequirePermission('crm', 'manage')
  send(@Param('id') id: string, @Body() body: unknown) {
    const { version } = sendSchema.parse(body);
    return this.messages.send(uuid.parse(id), version);
  }
}
