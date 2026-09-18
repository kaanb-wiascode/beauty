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

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  completeBranchChecklistRunSchema,
  listBranchChecklistRunsSchema,
  listBranchChecklistTemplatesSchema,
  publishBranchChecklistTemplateSchema,
  startBranchChecklistRunSchema,
  updateBranchChecklistRunItemSchema,
} from './dto/branch-checklist.dto';
import { OperationsBranchChecklistsService } from './operations-branch-checklists.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/branch-checklists')
export class OperationsBranchChecklistsController {
  constructor(private readonly checklists: OperationsBranchChecklistsService) {}

  @Get('templates')
  @RequirePermission('appointments', 'read')
  templates(@Query() query: unknown) {
    return this.checklists.listTemplates(
      listBranchChecklistTemplatesSchema.parse(query),
    );
  }

  @Post('templates')
  @RequirePermission('appointments', 'update')
  publishTemplate(@Body() body: unknown) {
    return this.checklists.publishTemplate(
      publishBranchChecklistTemplateSchema.parse(body),
    );
  }

  @Get('runs')
  @RequirePermission('appointments', 'read')
  runs(@Query() query: unknown) {
    return this.checklists.listRuns(listBranchChecklistRunsSchema.parse(query));
  }

  @Post('runs/start')
  @RequirePermission('appointments', 'update')
  startRun(@Body() body: unknown) {
    return this.checklists.startRun(startBranchChecklistRunSchema.parse(body));
  }

  @Get('runs/:runId')
  @RequirePermission('appointments', 'read')
  getRun(@Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.checklists.getRun(runId);
  }

  @Patch('runs/:runId/items/:itemId')
  @RequirePermission('appointments', 'update')
  updateItem(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() body: unknown,
  ) {
    return this.checklists.updateItem(
      runId,
      itemId,
      updateBranchChecklistRunItemSchema.parse(body),
    );
  }

  @Post('runs/:runId/complete')
  @RequirePermission('appointments', 'update')
  completeRun(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Body() body: unknown,
  ) {
    return this.checklists.completeRun(
      runId,
      completeBranchChecklistRunSchema.parse(body),
    );
  }
}
