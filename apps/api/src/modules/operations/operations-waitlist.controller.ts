import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  acceptWaitlistMatchSchema,
  cancelWaitlistEntrySchema,
  createWaitlistEntrySchema,
  findWaitlistMatchesSchema,
  listWaitlistEntriesSchema,
} from './dto/waitlist.dto';
import { OperationsBranchWorkingHoursService } from './operations-branch-working-hours.service';
import { OperationsStaffEligibilityService } from './operations-staff-eligibility.service';
import { OperationsWaitlistCandidateService } from './operations-waitlist-candidate.service';
import { OperationsWaitlistMatchingService } from './operations-waitlist-matching.service';
import { OperationsWaitlistRecoveryService } from './operations-waitlist-recovery.service';
import { OperationsWaitlistService } from './operations-waitlist.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/waitlist')
export class OperationsWaitlistController {
  constructor(
    private readonly waitlist: OperationsWaitlistService,
    private readonly candidates: OperationsWaitlistCandidateService,
    private readonly matching: OperationsWaitlistMatchingService,
    private readonly recovery: OperationsWaitlistRecoveryService,
    private readonly eligibility: OperationsStaffEligibilityService,
    private readonly workingHours: OperationsBranchWorkingHoursService,
  ) {}

  @Get()
  @RequirePermission('appointments', 'read')
  list(@Query() query: unknown) {
    return this.waitlist.list(listWaitlistEntriesSchema.parse(query));
  }

  @Post()
  @RequirePermission('appointments', 'update')
  create(@Body() body: unknown) {
    return this.waitlist.create(createWaitlistEntrySchema.parse(body));
  }

  @Post('recovery/:appointmentId/candidates')
  @RequirePermission('appointments', 'read')
  recoveryCandidates(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: unknown,
  ) {
    return this.recovery.candidates(
      appointmentId,
      findWaitlistMatchesSchema.parse(body),
    );
  }

  @Post(':entryId/matches')
  @RequirePermission('appointments', 'read')
  findMatches(
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
  ) {
    return this.candidates.findMatches(entryId, findWaitlistMatchesSchema.parse(body));
  }

  @Post(':entryId/accept-match')
  @RequirePermission('appointments', 'update')
  async acceptMatch(
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
  ) {
    const input = acceptWaitlistMatchSchema.parse(body);
    await this.workingHours.assertOpen({ startAt: input.startAt, endAt: input.endAt });
    await this.eligibility.assertWaitlistEntryEligible(entryId, input);
    return this.matching.acceptMatch(entryId, input);
  }

  @Post(':entryId/cancel')
  @RequirePermission('appointments', 'update')
  cancel(
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
  ) {
    return this.waitlist.cancel(entryId, cancelWaitlistEntrySchema.parse(body));
  }
}
