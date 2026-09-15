import { ReportPdfGenerator } from './report-pdf.generator';

describe('ReportPdfGenerator', () => {
  const generator = new ReportPdfGenerator();

  it('generates a valid branded PDF with metadata, summary and detail rows', () => {
    const pdf = generator.generate({
      title: 'Personel Performansı',
      columns: ['name', 'collected'],
      rows: [{ name: 'Ada Yılmaz', collected: 1250 }],
      summary: { rowCount: 1, collected: 1250 },
      metadata: {
        reportKey: 'staff.performance',
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-30T23:59:59.999Z'),
        generatedAt: new Date('2026-09-15T12:00:00.000Z'),
        branding: {
          companyName: 'Güzellik Dünyası A.Ş.',
          branchName: 'Kadıköy Şubesi',
        },
      },
    });

    const content = pdf.toString('latin1');
    expect(content.startsWith('%PDF-1.4')).toBe(true);
    expect(content).toContain('/Type /Catalog');
    expect(content).toContain('/Type /Page');
    expect(content).toContain('/BaseFont /Helvetica-Bold');
    expect(content).toContain('Guzellik Dunyasi A.S.');
    expect(content).toContain('Kadikoy Subesi');
    expect(content).toContain('Personel Performansi');
    expect(content).toContain('Ada Yilmaz');
    expect(content).toContain('CONFIDENTIAL / GIZLI');
    expect(content).toContain('Page 1 / 1');
    expect(content.endsWith('%%EOF\n')).toBe(true);
  });

  it('paginates larger reports and includes deterministic page numbering', () => {
    const rows = Array.from({ length: 70 }, (_, index) => ({
      name: `Staff ${index + 1}`,
      collected: index * 10,
    }));

    const content = generator
      .generate({
        title: 'Staff Performance',
        columns: ['name', 'collected'],
        rows,
        metadata: {
          reportKey: 'staff.performance',
          from: new Date('2026-09-01T00:00:00.000Z'),
          to: new Date('2026-09-30T23:59:59.999Z'),
          generatedAt: new Date('2026-09-15T12:00:00.000Z'),
        },
      })
      .toString('latin1');

    expect(content).toContain('/Count 3');
    expect(content).toContain('Page 1 / 3');
    expect(content).toContain('Page 2 / 3');
    expect(content).toContain('Page 3 / 3');
    expect(content.match(/CONFIDENTIAL \/ GIZLI/g)).toHaveLength(3);
  });
});
