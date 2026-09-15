import { reportDateRangeSchema } from './report-filters.dto';

describe('reportDateRangeSchema', () => {
  it('coerces a valid date range', () => {
    const result = reportDateRangeSchema.parse({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    });

    expect(result.from).toBeInstanceOf(Date);
    expect(result.to).toBeInstanceOf(Date);
  });

  it('rejects an inverted date range', () => {
    expect(() =>
      reportDateRangeSchema.parse({
        from: '2026-09-30T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects non allow-listed query parameters', () => {
    expect(() =>
      reportDateRangeSchema.parse({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T23:59:59.999Z',
        arbitraryField: 'unsafe',
      }),
    ).toThrow();
  });
});
