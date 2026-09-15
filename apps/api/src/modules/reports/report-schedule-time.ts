import type { CreateReportScheduleInput } from './dto/report-schedule.dto';

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const weekdayMap: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    hour: Number(value('hour')),
    minute: Number(value('minute')),
    weekday: weekdayMap[value('weekday')] ?? 0,
  };
}

function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;

  for (let index = 0; index < 3; index += 1) {
    const observed = localParts(new Date(candidate), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    );
    candidate -= observedAsUtc - target;
  }

  const result = new Date(candidate);
  const verified = localParts(result, timeZone);
  if (
    verified.year !== year ||
    verified.month !== month ||
    verified.day !== day ||
    verified.hour !== hour ||
    verified.minute !== minute
  ) {
    return null;
  }
  return result;
}

export function nextReportScheduleRun(
  input: Pick<
    CreateReportScheduleInput,
    | 'frequency'
    | 'timezone'
    | 'localHour'
    | 'localMinute'
    | 'dayOfWeek'
    | 'dayOfMonth'
  >,
  now = new Date(),
) {
  const current = localParts(now, input.timezone);
  const start = new Date(Date.UTC(current.year, current.month - 1, current.day));

  for (let offset = 0; offset <= 370; offset += 1) {
    const localDate = new Date(start);
    localDate.setUTCDate(localDate.getUTCDate() + offset);
    const year = localDate.getUTCFullYear();
    const month = localDate.getUTCMonth() + 1;
    const day = localDate.getUTCDate();
    const weekday = ((localDate.getUTCDay() + 6) % 7) + 1;

    if (input.frequency === 'WEEKLY' && weekday !== input.dayOfWeek) continue;
    if (input.frequency === 'MONTHLY' && day !== input.dayOfMonth) continue;

    const candidate = zonedLocalToUtc(
      year,
      month,
      day,
      input.localHour,
      input.localMinute,
      input.timezone,
    );
    if (candidate && candidate.getTime() > now.getTime()) return candidate;
  }

  throw new Error('Unable to calculate the next scheduled report run');
}
