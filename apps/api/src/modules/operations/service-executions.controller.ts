import {
  BadRequestException,
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
import { startWalkInServiceExecutionSchema } from './dto/walk-in-service-execution.dto';
import { OperationsServiceChecklistsService } from './operations-service-checklists.service';
import { OperationsStaffEligibilityService } from './operations-staff-eligibility.service';
import { ServiceExecutionReadService } from './service-execution-read.service';
import { ServiceExecutionsService } from './service-executions.service';
import { WalkInServiceExecutionsService } from './walk-in-service-executions.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/service-executions')
export class ServiceExecutionsController {
  constructor(
    private readonly executions: ServiceExecutionsService,
    private readonly executionRead: ServiceExecutionReadService,
    private readonly walkInExecutions: WalkInServiceExecutionsService,
    private readonly checklists: OperationsServiceChecklistsService,
    private readonly eligibility: OperationsStaffEligibilityService,
  ) {}

  @Get('visits/:visitId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  listByVisit(@Param('visitId', new ParseUUIDPipe()) visitId: string) {
    return this.executionRead.listByVisit(visitId);
  }

  @Post('visits/:visitId/start')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  async start(
    @Param('visitId', new ParseUUIDPipe()) visitId: string,
    @Body() body: unknown,
  ) {
    const input = startServiceExecutionSchema.parse(body);
    await this.eligibility.assertAppointmentExecutionEligible(input.appointmentId);
    return this.executions.start(visitId, input);
  }

  @Post('visits/:visitId/start-walk-in')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  startWalkIn(
    @Param('visitId', new ParseUUIDPipe()) visitId: string,
    @Body() body: unknown,
  ) {
    return this.walkInExecutions.start(
      visitId,
      startWalkInServiceExecutionSchema.parse(body),
    );
  }

  @Post(':executionId/complete')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  async complete(
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @Body() body: unknown,
  ) {
    const checklist = await this.checklists.getExecutionChecklist(executionId);
    if (checklist.completionBlocked) {
      throw new BadRequestException(
        'Required service checklist items must be completed first.',
      );
    }
    return this.executions.complete(
      executionId,
      completeServiceExecutionSchema.parse(body),
    );
  }

  @Post(':executionId/complete-appointment')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  completeAppointment(
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
  ) {
    return this.executions.completeAppointmentHandoff(executionId);
  }
}
