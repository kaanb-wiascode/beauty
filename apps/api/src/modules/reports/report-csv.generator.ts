import { Injectable } from '@nestjs/common';

const UTF8_BOM = '\uFEFF';
const FORMULA_PREFIX = /^[=+\-@]/;

@Injectable()
export class ReportCsvGenerator {
  generate(
    columns: readonly string[],
    rows: readonly Record<string, unknown>[],
  ) {
    const header = columns.map((column) => this.escapeCell(column)).join(',');
    const lines = rows.map((row) =>
      columns.map((column) => this.escapeCell(row[column])).join(','),
    );

    return `${UTF8_BOM}${[header, ...lines].join('\r\n')}\r\n`;
  }

  private escapeCell(value: unknown) {
    let normalized = this.normalizeValue(value);

    if (typeof normalized === 'string' && FORMULA_PREFIX.test(normalized)) {
      normalized = `'${normalized}`;
    }

    const text = String(normalized);
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  }

  private normalizeValue(value: unknown): string | number | boolean {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    return JSON.stringify(value);
  }
}
