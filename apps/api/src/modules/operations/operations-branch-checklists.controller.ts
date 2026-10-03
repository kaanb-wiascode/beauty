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
  @RequirePermission('operations', 'read')
  templates(@Query() query: unknown) {
    return this.checklists.listTemplates(
      listBranchChecklistTemplatesSchema.parse(query),
    );
  }

  @Post('templates')
  @RequirePermission('operations', 'manage')
  publishTemplate(@Body() body: unknown) {
    return this.checklists.publishTemplate(
      publishBranchChecklistTemplateSchema.parse(body),
    );
  }

  @Get('runs')
  @RequirePermission('operations', 'read')
  runs(@Query() query: unknown) {
    return this.checklists.listRuns(listBranchChecklistRunsSchema.parse(query));
  }

  @Post('runs/start')
  @RequirePermission('operations', 'manage')
  startRun(@Body() body: unknown) {
    return this.checklists.startRun(startBranchChecklistRunSchema.parse(body));
  }

  @Get('runs/:runId')
  @RequirePermission('operations', 'read')
  getRun(@Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.checklists.getRun(runId);
  }

  @Patch('runs/:runId/items/:itemId')
  @RequirePermission('operations', 'manage')
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
  @RequirePermission('operations', 'manage')
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
