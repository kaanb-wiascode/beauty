import { Injectable } from '@nestjs/common';

type GeneratePdfInput = {
  title: string;
  columns: readonly string[];
  rows: ReadonlyArray<Record<string, unknown>>;
  summary?: Record<string, unknown> | null;
  metadata: {
    reportKey: string;
    from: Date;
    to: Date;
    generatedAt: Date;
    branding?: {
      companyName: string;
      branchName?: string | null;
    };
  };
};

type PdfLine = {
  text: string;
  size?: number;
  bold?: boolean;
  muted?: boolean;
  gapAfter?: number;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const LINE_HEIGHT = 14;
const ROWS_PER_PAGE = 31;
const CONFIDENTIALITY_LABEL = 'CONFIDENTIAL / GIZLI';

@Injectable()
export class ReportPdfGenerator {
  generate(input: GeneratePdfInput) {
    const pages = this.pageLines(input);
    return this.buildPdf(pages);
  }

  private pageLines(input: GeneratePdfInput) {
    const detailRows = input.rows.map((row) =>
      input.columns.map((column) => this.formatValue(row[column])),
    );
    const chunks: string[][][] = [];

    for (let index = 0; index < detailRows.length; index += ROWS_PER_PAGE) {
      chunks.push(detailRows.slice(index, index + ROWS_PER_PAGE));
    }
    if (chunks.length === 0) chunks.push([]);

    return chunks.map((rows, pageIndex) => {
      const lines: PdfLine[] = [];
      if (pageIndex === 0) {
        if (input.metadata.branding?.companyName) {
          lines.push({
            text: this.normalize(input.metadata.branding.companyName),
            size: 10,
            bold: true,
            muted: true,
          });
        }
        if (input.metadata.branding?.branchName) {
          lines.push({
            text: this.normalize(input.metadata.branding.branchName),
            size: 8,
            muted: true,
            gapAfter: 3,
          });
        }

        lines.push({ text: this.normalize(input.title), size: 17, bold: true, gapAfter: 4 });
        lines.push({
          text: `Rapor: ${this.normalize(input.metadata.reportKey)}`,
          size: 8,
          muted: true,
        });
        lines.push({
          text: `Donem: ${this.date(input.metadata.from)} - ${this.date(input.metadata.to)}`,
          size: 8,
          muted: true,
        });
        lines.push({
          text: `Olusturulma: ${this.dateTime(input.metadata.generatedAt)}`,
          size: 8,
          muted: true,
          gapAfter: 5,
        });

        if (input.summary && Object.keys(input.summary).length > 0) {
          lines.push({ text: 'Ozet', size: 11, bold: true });
          for (const [key, value] of Object.entries(input.summary)) {
            lines.push({
              text: `${this.normalize(key)}: ${this.formatValue(value)}`,
              size: 8,
            });
          }
          lines.push({ text: '', gapAfter: 3 });
        }
      } else {
        lines.push({
          text: this.normalize(input.title),
          size: 10,
          bold: true,
          muted: true,
          gapAfter: 3,
        });
      }

      lines.push({
        text: input.columns.map((column) => this.normalize(column)).join(' | '),
        size: 8,
        bold: true,
        gapAfter: 2,
      });
      for (const row of rows) {
        lines.push({ text: this.truncate(row.join(' | '), 110), size: 8 });
      }
      lines.push({ text: '', gapAfter: 2 });
      lines.push({
        text: `${CONFIDENTIALITY_LABEL}    Page ${pageIndex + 1} / ${chunks.length}`,
        size: 7,
        muted: true,
      });
      return lines;
    });
  }

  private buildPdf(pages: readonly PdfLine[][]) {
    const objects: string[] = [];
    const add = (value: string) => {
      objects.push(value);
      return objects.length;
    };

    const catalogId = add('');
    const pagesId = add('');
    const regularFontId = add(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    );
    const boldFontId = add(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    );

    const pageIds: number[] = [];
    for (const lines of pages) {
      const stream = this.contentStream(lines);
      const contentId = add(
        `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
      );
      const pageId = add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
      pageIds.push(pageId);
    }

    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] /Count ${pageIds.length} >>`;

    const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const chunks = [header];
    const offsets = [0];
    let offset = Buffer.byteLength(header, 'latin1');

    objects.forEach((object, index) => {
      offsets.push(offset);
      const serialized = `${index + 1} 0 obj\n${object}\nendobj\n`;
      chunks.push(serialized);
      offset += Buffer.byteLength(serialized, 'latin1');
    });

    const xrefOffset = offset;
    const xref = [
      `xref\n0 ${objects.length + 1}\n`,
      '0000000000 65535 f \n',
      ...offsets.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n \n`),
      `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ].join('');
    chunks.push(xref);

    return Buffer.from(chunks.join(''), 'latin1');
  }

  private contentStream(lines: readonly PdfLine[]) {
    const commands: string[] = [];
    let y = PAGE_HEIGHT - MARGIN;

    for (const line of lines) {
      const size = line.size ?? 9;
      const font = line.bold ? '/F2' : '/F1';
      const gray = line.muted ? '0.42 g' : '0 g';
      commands.push(
        'BT',
        gray,
        `${font} ${size} Tf`,
        `1 0 0 1 ${MARGIN} ${y} Tm`,
        `(${this.escapePdf(this.truncate(line.text, 120))}) Tj`,
        'ET',
      );
      y -= LINE_HEIGHT + (line.gapAfter ?? 0);
    }

    return commands.join('\n');
  }

  private formatValue(value: unknown) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return this.dateTime(value);
    if (typeof value === 'object') return this.normalize(JSON.stringify(value));
    return this.normalize(String(value));
  }

  private normalize(value: string) {
    return value
      .replaceAll('ç', 'c')
      .replaceAll('Ç', 'C')
      .replaceAll('ğ', 'g')
      .replaceAll('Ğ', 'G')
      .replaceAll('ı', 'i')
      .replaceAll('İ', 'I')
      .replaceAll('ö', 'o')
      .replaceAll('Ö', 'O')
      .replaceAll('ş', 's')
      .replaceAll('Ş', 'S')
      .replaceAll('ü', 'u')
      .replaceAll('Ü', 'U')
      .replace(/[^\x20-\x7E]/g, '?');
  }

  private escapePdf(value: string) {
    return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  }

  private truncate(value: string, max: number) {
    return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3))}...`;
  }

  private date(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private dateTime(value: Date) {
    return value.toISOString().replace('T', ' ').replace('.000Z', 'Z');
  }
}
