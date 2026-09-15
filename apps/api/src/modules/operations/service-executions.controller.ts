import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  completeServiceExecutionSchema,
  startServiceExecutionSchema,
} from './dto/service-execution.dto';
import { ServiceExecutionsService } from './service-executions.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/service-executions')
export class ServiceExecutionsController {
  constructor(private readonly executions: ServiceExecutionsService) {}

  @Get('visits/:visitId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  listByVisit(@Param('visitId', new ParseUUIDPipe()) visitId: string) {
    return this.executions.listByVisit(visitId);
  }

  @Post('visits/:visitId/start')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  start(
    @Param('visitId', new ParseUUIDPipe()) visitId: string,
    @Body() body: unknown,
  ) {
    return this.executions.start(visitId, startServiceExecutionSchema.parse(body));
  }

  @Post(':executionId/complete')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  complete(
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @Body() body: unknown,
  ) {
    return this.executions.complete(
      executionId,
      completeServiceExecutionSchema.parse(body),
    );
  }
}
