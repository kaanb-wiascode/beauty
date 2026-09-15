import { ReportXlsxGenerator } from './report-xlsx.generator';

describe('ReportXlsxGenerator', () => {
  const generator = new ReportXlsxGenerator();

  it('generates an OOXML workbook with summary, detail and filters sheets', () => {
    const workbook = generator.generate({
      columns: ['name', 'collected'],
      rows: [{ name: 'Ada Yılmaz', collected: 1250.5 }],
      summary: { rowCount: 1, totalCollected: 1250.5 },
      metadata: {
        reportKey: 'staff.performance',
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-30T23:59:59.999Z'),
        generatedAt: new Date('2026-09-15T12:00:00.000Z'),
      },
    });

    expect(workbook.subarray(0, 2).toString()).toBe('PK');
    expect(workbook.includes(Buffer.from('[Content_Types].xml'))).toBe(true);
    expect(workbook.includes(Buffer.from('workbook.xml'))).toBe(true);
    expect(workbook.includes(Buffer.from('Ada Yılmaz'))).toBe(true);
    expect(workbook.includes(Buffer.from('staff.performance'))).toBe(true);
  });

  it('escapes XML and keeps numbers as numeric cells', () => {
    const workbook = generator.generate({
      columns: ['name', 'amount'],
      rows: [{ name: 'A&B <Test>', amount: 42.25 }],
      metadata: {
        reportKey: 'payments.summary',
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-02T00:00:00.000Z'),
        generatedAt: new Date('2026-09-15T12:00:00.000Z'),
      },
    });

    expect(workbook.includes(Buffer.from('A&amp;B &lt;Test&gt;'))).toBe(true);
    expect(workbook.includes(Buffer.from('<v>42.25</v>'))).toBe(true);
  });
});
