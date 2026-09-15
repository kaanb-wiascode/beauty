import {
  nextReportScheduleRun,
  resolveReportScheduleDateRange,
} from './report-schedule-time';

describe('nextReportScheduleRun', () => {
  it('calculates the next Istanbul daily run in UTC', () => {
    const result = nextReportScheduleRun(
      {
        frequency: 'DAILY',
        timezone: 'Europe/Istanbul',
        localHour: 9,
        localMinute: 30,
      },
      new Date('2026-09-15T05:00:00.000Z'),
    );

    expect(result.toISOString()).toBe('2026-09-15T06:30:00.000Z');
  });

  it('moves a passed daily run to the next local day', () => {
    const result = nextReportScheduleRun(
      {
        frequency: 'DAILY',
        timezone: 'Europe/Istanbul',
        localHour: 9,
        localMinute: 30,
      },
      new Date('2026-09-15T07:00:00.000Z'),
    );

    expect(result.toISOString()).toBe('2026-09-16T06:30:00.000Z');
  });

  it('honors ISO weekday for weekly schedules', () => {
    const result = nextReportScheduleRun(
      {
        frequency: 'WEEKLY',
        timezone: 'UTC',
        localHour: 8,
        localMinute: 0,
        dayOfWeek: 1,
      },
      new Date('2026-09-15T00:00:00.000Z'),
    );

    expect(result.toISOString()).toBe('2026-09-21T08:00:00.000Z');
  });
});

describe('resolveReportScheduleDateRange', () => {
  it('resolves LAST_7_DAYS using the schedule timezone', () => {
    const range = resolveReportScheduleDateRange(
      'LAST_7_DAYS',
      'Europe/Istanbul',
      new Date('2026-09-15T12:00:00.000Z'),
    );

    expect(range.from.toISOString()).toBe('2026-09-08T21:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-09-15T20:59:59.999Z');
  });

  it('resolves the previous local month without fixed-date drift', () => {
    const range = resolveReportScheduleDateRange(
      'PREVIOUS_MONTH',
      'Europe/Istanbul',
      new Date('2026-09-15T12:00:00.000Z'),
    );

    expect(range.from.toISOString()).toBe('2026-07-31T21:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-08-31T20:59:59.999Z');
  });
});
