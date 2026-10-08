import { ReportCsvGenerator } from './report-csv.generator';

describe('ReportCsvGenerator', () => {
  const generator = new ReportCsvGenerator();

  it('preserves Turkish characters with an UTF-8 BOM', () => {
    const csv = generator.generate(['name', 'city'], [
      { name: 'Çağla Yılmaz', city: 'İstanbul' },
    ]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Çağla Yılmaz,İstanbul');
  });

  it('escapes commas, quotes and new lines according to CSV rules', () => {
    const csv = generator.generate(['name', 'note'], [
      { name: 'Ada, Yılmaz', note: 'Satır 1\n"Satır 2"' },
    ]);

    expect(csv).toContain('"Ada, Yılmaz"');
    expect(csv).toContain('"Satır 1\n""Satır 2"""');
  });

  it('neutralizes spreadsheet formula injection', () => {
    const csv = generator.generate(['value'], [
      { value: '=HYPERLINK("https://example.test")' },
      { value: '+1+1' },
      { value: '-10+20' },
      { value: '@SUM(A1:A2)' },
    ]);

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+1+1");
    expect(csv).toContain("'-10+20");
    expect(csv).toContain("'@SUM(A1:A2)");
  });

  it('serializes structured values without dropping data', () => {
    const csv = generator.generate(['methods'], [
      { methods: { CASH: 100, CARD: 250 } },
    ]);

    expect(csv).toContain('{""CASH"":100,""CARD"":250}');
  });
});
