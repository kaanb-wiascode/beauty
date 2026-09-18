import { Injectable } from '@nestjs/common';

const textEncoder = new TextEncoder();

@Injectable()
export class ReportXlsxGenerator {
  generate(input: {
    columns: readonly string[];
    rows: readonly Record<string, unknown>[];
    summary?: Record<string, unknown> | null;
    metadata: {
      reportKey: string;
      from: Date;
      to: Date;
      generatedAt: Date;
    };
  }): Buffer {
    const files = new Map<string, Buffer>();
    const sheets: Array<{ name: string; path: string }> = [];

    if (input.summary && Object.keys(input.summary).length > 0) {
      sheets.push({ name: 'Summary', path: 'xl/worksheets/sheet1.xml' });
      files.set('xl/worksheets/sheet1.xml', this.keyValueSheet(input.summary));
    }

    const detailIndex = sheets.length + 1;
    sheets.push({ name: 'Detail', path: `xl/worksheets/sheet${detailIndex}.xml` });
    files.set(
      `xl/worksheets/sheet${detailIndex}.xml`,
      this.tableSheet(input.columns, input.rows),
    );

    const metadataIndex = sheets.length + 1;
    sheets.push({ name: 'Filters', path: `xl/worksheets/sheet${metadataIndex}.xml` });
    files.set(
      `xl/worksheets/sheet${metadataIndex}.xml`,
      this.keyValueSheet({
        reportKey: input.metadata.reportKey,
        from: input.metadata.from,
        to: input.metadata.to,
        generatedAt: input.metadata.generatedAt,
      }),
    );

    files.set('[Content_Types].xml', this.contentTypes(sheets.length));
    files.set('_rels/.rels', this.rootRelationships());
    files.set('xl/workbook.xml', this.workbookXml(sheets));
    files.set('xl/_rels/workbook.xml.rels', this.workbookRelationships(sheets));
    files.set('xl/styles.xml', this.stylesXml());

    return this.zip(files);
  }

  private tableSheet(
    columns: readonly string[],
    rows: readonly Record<string, unknown>[],
  ) {
    const rowXml: string[] = [];
    rowXml.push(
      `<row r="1">${columns
        .map((column, index) => this.cell(1, index + 1, column, 1))
        .join('')}</row>`,
    );

    rows.forEach((row, rowIndex) => {
      const excelRow = rowIndex + 2;
      rowXml.push(
        `<row r="${excelRow}">${columns
          .map((column, columnIndex) =>
            this.cell(excelRow, columnIndex + 1, row[column]),
          )
          .join('')}</row>`,
      );
    });

    const lastColumn = this.columnName(Math.max(columns.length, 1));
    const lastRow = Math.max(rows.length + 1, 1);
    const autoFilter = columns.length
      ? `<autoFilter ref="A1:${lastColumn}${lastRow}"/>`
      : '';

    return this.buffer(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <sheetData>${rowXml.join('')}</sheetData>
  ${autoFilter}
</worksheet>`);
  }

  private keyValueSheet(values: Record<string, unknown>) {
    const rows = Object.entries(values).map(([key, value], index) => {
      const row = index + 1;
      return `<row r="${row}">${this.cell(row, 1, key, 1)}${this.cell(row, 2, value)}</row>`;
    });

    return this.buffer(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetFormatPr defaultRowHeight="15"/>
  <sheetData>${rows.join('')}</sheetData>
</worksheet>`);
  }

  private cell(row: number, column: number, value: unknown, style = 0) {
    const ref = `${this.columnName(column)}${row}`;
    const styleAttr = style ? ` s="${style}"` : '';

    if (value === null || value === undefined) {
      return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t></t></is></c>`;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
    }

    if (typeof value === 'boolean') {
      return `<c r="${ref}"${styleAttr} t="b"><v>${value ? 1 : 0}</v></c>`;
    }

    if (value instanceof Date) {
      return `<c r="${ref}" s="2"><v>${this.excelSerial(value)}</v></c>`;
    }

    const normalized =
      typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${this.escapeXml(normalized)}</t></is></c>`;
  }

  private excelSerial(value: Date) {
    return value.getTime() / 86400000 + 25569;
  }

  private columnName(index: number) {
    let value = index;
    let result = '';
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result || 'A';
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private contentTypes(sheetCount: number) {
    const overrides = Array.from({ length: sheetCount }, (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    ).join('');

    return this.buffer(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${overrides}
</Types>`);
  }

  private rootRelationships() {
    return this.buffer(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  }

  private workbookXml(sheets: Array<{ name: string }>) {
    const sheetXml = sheets
      .map(
        (sheet, index) =>
          `<sheet name="${this.escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
      )
      .join('');

    return this.buffer(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetXml}</sheets>
</workbook>`);
  }

  private workbookRelationships(sheets: Array<{ path: string }>) {
    const sheetRels = sheets
      .map(
        (sheet, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${sheet.path.split('/').pop()}"/>`,
      )
      .join('');
    const stylesId = sheets.length + 1;

    return this.buffer(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${stylesId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  }

  private stylesXml() {
    return this.buffer(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font/><font><b/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`);
  }

  private buffer(value: string) {
    return Buffer.from(textEncoder.encode(value));
  }

  private zip(files: Map<string, Buffer>) {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const [name, data] of files) {
      const nameBuffer = Buffer.from(name, 'utf8');
      const crc = this.crc32(data);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0, 6);
      local.writeUInt16LE(0, 8);
      local.writeUInt16LE(0, 10);
      local.writeUInt16LE(0, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuffer.length, 26);
      local.writeUInt16LE(0, 28);
      localParts.push(local, nameBuffer, data);

      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0, 8);
      central.writeUInt16LE(0, 10);
      central.writeUInt16LE(0, 12);
      central.writeUInt16LE(0, 14);
      central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(data.length, 20);
      central.writeUInt32LE(data.length, 24);
      central.writeUInt16LE(nameBuffer.length, 28);
      central.writeUInt16LE(0, 30);
      central.writeUInt16LE(0, 32);
      central.writeUInt16LE(0, 34);
      central.writeUInt16LE(0, 36);
      central.writeUInt32LE(0, 38);
      central.writeUInt32LE(offset, 42);
      centralParts.push(central, nameBuffer);

      offset += local.length + nameBuffer.length + data.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(files.size, 8);
    end.writeUInt16LE(files.size, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDirectory, end]);
  }

  private crc32(data: Buffer) {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
}
