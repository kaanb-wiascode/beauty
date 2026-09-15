import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import type {
  CreateReportSavedViewInput,
  UpdateReportSavedViewInput,
} from './dto/report-saved-view.dto';
import { getReportDefinition, type ReportDefinition } from './report-definition';
import {
  ReportSavedViewsRepository,
  type ReportSavedViewRecord,
} from './report-saved-views.repository';
import { ReportsService } from './reports.service';

@Injectable()
export class ReportSavedViewsService {
  constructor(
    private readonly repository: ReportSavedViewsRepository,
    private readonly reports: ReportsService,
  ) {}

  async create(user: JwtPayload, input: CreateReportSavedViewInput) {
    const definition = await this.authorize(user, input.reportKey);
    this.validateColumns(definition, input.columns);
    this.validateSort(definition, input.sort?.key);
    return this.repository.create(user, input);
  }

  async list(user: JwtPayload) {
    const rows = await this.repository.list(user);
    const catalog = await this.reports.getCatalog(user);
    const allowed = new Set(catalog.map((report) => report.key));
    return rows.filter((row) => allowed.has(row.reportKey as never));
  }

  async get(user: JwtPayload, id: string) {
    const row = await this.requireOwned(user, id);
    await this.authorize(user, row.reportKey);
    return row;
  }

  async update(user: JwtPayload, id: string, input: UpdateReportSavedViewInput) {
    const current = await this.requireOwned(user, id);
    const definition = await this.authorize(user, current.reportKey);

    if (input.columns) this.validateColumns(definition, input.columns);
    if (input.sort?.key) this.validateSort(definition, input.sort.key);

    const updated = await this.repository.update(user, id, input);
    if (!updated) throw new NotFoundException('Saved report not found');
    return updated;
  }

  async delete(user: JwtPayload, id: string) {
    await this.requireOwned(user, id);
    const deleted = await this.repository.delete(user, id);
    if (!deleted) throw new NotFoundException('Saved report not found');
    return { id };
  }

  private async requireOwned(user: JwtPayload, id: string) {
    const row = await this.repository.findById(user, id);
    if (!row) throw new NotFoundException('Saved report not found');
    return row;
  }

  private async authorize(user: JwtPayload, reportKey: string) {
    const definition = getReportDefinition(reportKey as never);
    if (!definition) throw new BadRequestException('Unsupported report');

    const catalog = await this.reports.getCatalog(user);
    if (!catalog.some((report) => report.key === definition.key)) {
      throw new ForbiddenException(
        'You do not have permission to view this saved report',
      );
    }
    return definition;
  }

  private validateColumns(
    definition: ReportDefinition,
    columns: readonly string[],
  ) {
    const invalid = [...new Set(columns)].filter(
      (column) => !definition.availableColumns.includes(column),
    );
    if (invalid.length) {
      throw new BadRequestException(
        `Unsupported saved report columns: ${invalid.join(', ')}`,
      );
    }
  }

  private validateSort(definition: ReportDefinition, key?: string) {
    if (key && !definition.sortableColumns.includes(key)) {
      throw new BadRequestException(`Unsupported saved report sort: ${key}`);
    }
  }
}
