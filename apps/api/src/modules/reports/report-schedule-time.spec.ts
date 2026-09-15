import { nextReportScheduleRun } from './report-schedule-time';

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
