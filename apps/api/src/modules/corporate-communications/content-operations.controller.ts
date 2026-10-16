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
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  contentDecisionSchema,
  createContentItemSchema,
  listContentItemsSchema,
  publishContentSchema,
  scheduleContentSchema,
  updateContentDraftSchema,
} from './corporate-communications.schemas';
import { ContentOperationsService } from './content-operations.service';

@Controller('corporate-communications')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('communications', 'read')
export class ContentOperationsController {
  constructor(private readonly service: ContentOperationsService) {}

  @Get('content')
  listContent(@Query() query: unknown) {
    return this.service.list(listContentItemsSchema.parse(query));
  }

  @Post('content')
  @RequirePermission('communications', 'manage')
  createContent(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.service.create(createContentItemSchema.parse(body), user.sub);
  }

  @Patch('content/:id')
  @RequirePermission('communications', 'manage')
  updateContent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateDraft(id, updateContentDraftSchema.parse(body), user.sub);
  }

  @Post('content/:id/submit-review')
  @RequirePermission('communications', 'manage')
  submitReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.submitForReview(id, user.sub);
  }

  @Post('content/:id/schedule')
  @RequirePermission('communications', 'manage')
  schedule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.schedule(id, scheduleContentSchema.parse(body), user.sub);
  }

  @Post('content/:id/publish')
  @RequirePermission('communications', 'manage')
  publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.publish(id, publishContentSchema.parse(body), user.sub);
  }

  @Get('approvals')
  listApprovals(@Query('status') status?: string) {
    return this.service.listApprovals(status);
  }

  @Post('approvals/:id/approve')
  @RequirePermission('communications', 'approve')
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.decideApproval(
      id,
      'APPROVED',
      contentDecisionSchema.parse(body),
      user.sub,
    );
  }

  @Post('approvals/:id/request-changes')
  @RequirePermission('communications', 'approve')
  requestChanges(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.decideApproval(
      id,
      'CHANGES_REQUESTED',
      contentDecisionSchema.parse(body),
      user.sub,
    );
  }
}
