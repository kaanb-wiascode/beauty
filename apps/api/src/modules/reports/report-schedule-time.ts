import type {
  CreateReportScheduleInput,
  ReportScheduleDatePreset,
} from './dto/report-schedule.dto';

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

function localDateShift(
  value: Pick<LocalParts, 'year' | 'month' | 'day'>,
  days: number,
) {
  const shifted = new Date(Date.UTC(value.year, value.month - 1, value.day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function localBoundary(
  value: Pick<LocalParts, 'year' | 'month' | 'day'>,
  timeZone: string,
) {
  const result = zonedLocalToUtc(
    value.year,
    value.month,
    value.day,
    0,
    0,
    timeZone,
  );
  if (!result) throw new Error('Unable to resolve scheduled report date boundary');
  return result;
}

export function resolveReportScheduleDateRange(
  preset: ReportScheduleDatePreset,
  timeZone: string,
  now = new Date(),
) {
  const current = localParts(now, timeZone);
  const today = { year: current.year, month: current.month, day: current.day };
  let startLocal = today;
  let endExclusiveLocal = localDateShift(today, 1);

  if (preset === 'YESTERDAY') {
    startLocal = localDateShift(today, -1);
    endExclusiveLocal = today;
  } else if (preset === 'LAST_7_DAYS') {
    startLocal = localDateShift(today, -6);
  } else if (preset === 'LAST_30_DAYS') {
    startLocal = localDateShift(today, -29);
  } else if (preset === 'THIS_MONTH') {
    startLocal = { year: current.year, month: current.month, day: 1 };
    endExclusiveLocal = localDateShift(
      { year: current.year, month: current.month + 1, day: 1 },
      0,
    );
  } else if (preset === 'PREVIOUS_MONTH') {
    endExclusiveLocal = { year: current.year, month: current.month, day: 1 };
    const previousMonth = new Date(Date.UTC(current.year, current.month - 2, 1));
    startLocal = {
      year: previousMonth.getUTCFullYear(),
      month: previousMonth.getUTCMonth() + 1,
      day: 1,
    };
  }

  const from = localBoundary(startLocal, timeZone);
  const nextBoundary = localBoundary(endExclusiveLocal, timeZone);
  return { from, to: new Date(nextBoundary.getTime() - 1) };
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
