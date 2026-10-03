import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import type {
  CreateReportScheduleInput,
  UpdateReportScheduleInput,
} from './dto/report-schedule.dto';
import {
  getReportDefinition,
  type ReportDefinition,
  type ReportKey,
} from './report-definition';
import { ReportScheduleRunsRepository } from './report-schedule-runs.repository';
import { nextReportScheduleRun } from './report-schedule-time';
import {
  ReportSchedulesRepository,
  type ReportScheduleRecord,
} from './report-schedules.repository';
import { ReportsService } from './reports.service';

@Injectable()
export class ReportSchedulesService {
  constructor(
    private readonly repository: ReportSchedulesRepository,
    private readonly reports: ReportsService,
    @Optional() private readonly runs?: ReportScheduleRunsRepository,
  ) {}

  async create(user: JwtPayload, input: CreateReportScheduleInput) {
    const definition = await this.authorize(user, input.reportKey);
    this.validateDefinition(definition, input);
    const nextRunAt = input.enabled ? nextReportScheduleRun(input) : null;
    return this.repository.create(user, input, nextRunAt);
  }

  async list(user: JwtPayload) {
    const rows = await this.repository.list(user);
    const catalog = await this.reports.getCatalog(user);
    const allowed = new Set<ReportKey>(catalog.map((report) => report.key));
    return rows.filter((row) => allowed.has(row.reportKey));
  }

  async get(user: JwtPayload, id: string) {
    const row = await this.requireOwned(user, id);
    await this.authorize(user, row.reportKey);
    return row;
  }

  async listRuns(user: JwtPayload, id: string) {
    const row = await this.requireOwned(user, id);
    await this.authorize(user, row.reportKey);
    if (!this.runs) {
      throw new InternalServerErrorException('Scheduled report history unavailable');
    }
    return this.runs.listForOwner(user, id);
  }

  async update(user: JwtPayload, id: string, input: UpdateReportScheduleInput) {
    const current = await this.requireOwned(user, id);
    await this.authorize(user, current.reportKey);

    let nextRunAt: Date | null | undefined;
    if (input.enabled === false) {
      nextRunAt = null;
    } else if (input.enabled === true && !current.enabled) {
      nextRunAt = this.nextFromRecord(current);
    }

    const updated = await this.repository.update(user, id, input, nextRunAt);
    if (!updated) throw new NotFoundException('Scheduled report not found');
    return updated;
  }

  async delete(user: JwtPayload, id: string) {
    const current = await this.requireOwned(user, id);
    await this.authorize(user, current.reportKey);
    const deleted = await this.repository.delete(user, id);
    if (!deleted) throw new NotFoundException('Scheduled report not found');
    return { id };
  }

  private async requireOwned(user: JwtPayload, id: string) {
    const row = await this.repository.findById(user, id);
    if (!row) throw new NotFoundException('Scheduled report not found');
    return row;
  }

  private async authorize(user: JwtPayload, reportKey: ReportKey) {
    const definition = getReportDefinition(reportKey);
    if (!definition) throw new BadRequestException('Unsupported report');
    const catalog = await this.reports.getCatalog(user);
    if (!catalog.some((report) => report.key === reportKey)) {
      throw new ForbiddenException(
        'You do not have permission to use this scheduled report',
      );
    }
    return definition;
  }

  private validateDefinition(
    definition: ReportDefinition,
    input: CreateReportScheduleInput,
  ) {
    if (!definition.exportFormats.includes(input.format)) {
      throw new BadRequestException('Unsupported scheduled report format');
    }
    const invalidColumns = [...new Set(input.columns)].filter(
      (column) => !definition.exportableColumns.includes(column),
    );
    if (invalidColumns.length) {
      throw new BadRequestException(
        `Unsupported scheduled report columns: ${invalidColumns.join(', ')}`,
      );
    }
    if (input.sort?.key && !definition.sortableColumns.includes(input.sort.key)) {
      throw new BadRequestException(
        `Unsupported scheduled report sort: ${input.sort.key}`,
      );
    }
  }

  private nextFromRecord(record: ReportScheduleRecord) {
    return nextReportScheduleRun({
      frequency: record.frequency,
      timezone: record.timezone,
      localHour: record.localHour,
      localMinute: record.localMinute,
      dayOfWeek: record.dayOfWeek ?? undefined,
      dayOfMonth: record.dayOfMonth ?? undefined,
    });
  }
}
