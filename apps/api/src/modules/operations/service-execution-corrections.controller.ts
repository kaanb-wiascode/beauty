import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  cancelServiceExecutionSchema,
  reverseServiceExecutionCompletionSchema,
} from './dto/service-execution-correction.dto';
import { ServiceExecutionCorrectionsService } from './service-execution-corrections.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/service-executions')
export class ServiceExecutionCorrectionsController {
  constructor(private readonly corrections: ServiceExecutionCorrectionsService) {}

  @Post(':executionId/cancel')
  @RequirePermission('appointments', 'update')
  cancel(
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @Body() body: unknown,
  ) {
    return this.corrections.cancel(executionId, cancelServiceExecutionSchema.parse(body));
  }

  @Post(':executionId/reverse-completion')
  @RequirePermission('appointments', 'update')
  reverseCompletion(
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @Body() body: unknown,
  ) {
    return this.corrections.reverseCompletion(
      executionId,
      reverseServiceExecutionCompletionSchema.parse(body),
    );
  }
}
