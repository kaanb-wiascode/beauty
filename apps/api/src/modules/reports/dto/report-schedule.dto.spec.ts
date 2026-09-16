import { createReportScheduleSchema } from './report-schedule.dto';

const base = {
  name: 'Haftalık personel raporu',
  reportKey: 'staff.performance',
  frequency: 'WEEKLY',
  timezone: 'Europe/Istanbul',
  localHour: 9,
  localMinute: 15,
  dayOfWeek: 1,
  format: 'XLSX',
  datePreset: 'LAST_7_DAYS',
  columns: ['name', 'collected'],
  sort: { key: 'collected', direction: 'desc' },
  includeSummary: true,
  enabled: true,
} as const;

describe('createReportScheduleSchema', () => {
  it('accepts a bounded weekly schedule', () => {
    expect(createReportScheduleSchema.parse(base)).toMatchObject({
      frequency: 'WEEKLY',
      timezone: 'Europe/Istanbul',
      dayOfWeek: 1,
    });
  });

  it('rejects arbitrary scope and recipient fields', () => {
    expect(() =>
      createReportScheduleSchema.parse({
        ...base,
        tenantId: 'other-tenant',
      }),
    ).toThrow();
    expect(() =>
      createReportScheduleSchema.parse({
        ...base,
        recipients: ['external@example.test'],
      }),
    ).toThrow();
  });

  it('rejects invalid timezone and frequency shape', () => {
    expect(() =>
      createReportScheduleSchema.parse({ ...base, timezone: 'Mars/Olympus' }),
    ).toThrow();
    expect(() =>
      createReportScheduleSchema.parse({
        ...base,
        frequency: 'DAILY',
        dayOfWeek: 1,
      }),
    ).toThrow();
  });

  it('bounds monthly schedules to days 1 through 28', () => {
    expect(() =>
      createReportScheduleSchema.parse({
        ...base,
        frequency: 'MONTHLY',
        dayOfWeek: undefined,
        dayOfMonth: 31,
      }),
    ).toThrow();
  });
});
