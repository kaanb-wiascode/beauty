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

  it('preserves timezone offsets as the same instants', () => {
    const result = reportDateRangeSchema.parse({
      from: '2026-09-15T00:00:00+03:00',
      to: '2026-09-15T23:59:59.999+03:00',
    });

    expect(result.from.toISOString()).toBe('2026-09-14T21:00:00.000Z');
    expect(result.to.toISOString()).toBe('2026-09-15T20:59:59.999Z');
  });

  it('accepts an exact single-instant boundary', () => {
    const result = reportDateRangeSchema.parse({
      from: '2026-09-15T10:30:00.000Z',
      to: '2026-09-15T10:30:00.000Z',
    });

    expect(result.from.getTime()).toBe(result.to.getTime());
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
