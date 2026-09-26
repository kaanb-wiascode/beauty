import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  createServiceChecklistTemplateSchema,
  updateExecutionChecklistItemSchema,
} from './dto/service-checklist.dto';
import { OperationsServiceChecklistsService } from './operations-service-checklists.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/service-checklists')
export class OperationsServiceChecklistsController {
  constructor(private readonly checklists: OperationsServiceChecklistsService) {}

  @Get('services/:serviceId/active')
  @RequirePermission('appointments', 'read')
  activeTemplate(@Param('serviceId', new ParseUUIDPipe()) serviceId: string) {
    return this.checklists.getActiveTemplate(serviceId);
  }

  @Post('services/:serviceId/versions')
  @RequirePermission('appointments', 'update')
  createVersion(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body() body: unknown,
  ) {
    return this.checklists.createVersion(
      serviceId,
      createServiceChecklistTemplateSchema.parse(body),
    );
  }

  @Get('executions/:executionId')
  @RequirePermission('appointments', 'read')
  executionChecklist(
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
  ) {
    return this.checklists.getExecutionChecklist(executionId);
  }

  @Patch('executions/:executionId/items/:itemId')
  @RequirePermission('appointments', 'update')
  updateExecutionItem(
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() body: unknown,
  ) {
    return this.checklists.updateExecutionItem(
      executionId,
      itemId,
      updateExecutionChecklistItemSchema.parse(body),
    );
  }
}
