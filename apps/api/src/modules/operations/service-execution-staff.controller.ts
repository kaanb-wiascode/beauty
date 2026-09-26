import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { addExecutionStaffSchema, endExecutionStaffSchema, handoffExecutionStaffSchema } from './dto/service-execution.dto';
import { ServiceExecutionStaffService } from './service-execution-staff.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/service-executions/:executionId/staff')
export class ServiceExecutionStaffController {
  constructor(private readonly staff: ServiceExecutionStaffService) {}

  @Get()
  @RequirePermission('appointments', 'read')
  list(@Param('executionId', new ParseUUIDPipe()) executionId: string) {
    return this.staff.list(executionId);
  }

  @Post()
  @RequirePermission('appointments', 'update')
  add(@Param('executionId', new ParseUUIDPipe()) executionId: string, @Body() body: unknown) {
    return this.staff.add(executionId, addExecutionStaffSchema.parse(body));
  }

  @Post(':assignmentId/end')
  @RequirePermission('appointments', 'update')
  end(
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @Body() body: unknown,
  ) {
    return this.staff.end(executionId, assignmentId, endExecutionStaffSchema.parse(body));
  }

  @Post('handoff')
  @RequirePermission('appointments', 'update')
  handoff(@Param('executionId', new ParseUUIDPipe()) executionId: string, @Body() body: unknown) {
    return this.staff.handoff(executionId, handoffExecutionStaffSchema.parse(body));
  }
}
