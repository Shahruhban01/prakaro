import { z } from 'zod';

export const auxStates = ['MODERATING', 'NON_MODERATING', 'BREAK', 'MEETING', 'OFFLINE', 'TRAINING'] as const;
type AuxState = typeof auxStates[number];
export type AuxTotals = Record<AuxState, number>;
const day = 86400000;
const hour = 3600000;
const dateKey = z.string().date();
function timezoneIsValid(timezone: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); return true; }
  catch { return false; }
}

export const reportingTimezone = z.string().min(1).max(100).refine(timezoneIsValid);

export const analyticsFilters = z.object({
  timezone: reportingTimezone.default('UTC'),
  preset: z.enum(['today', 'yesterday', '7days', '30days', 'custom']).default('7days'),
  from: dateKey.optional(), through: dateKey.optional(),
  organizationId: z.string().uuid().optional(), lobId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(), queueId: z.string().uuid().optional(),
  moderatorId: z.string().uuid().optional(),
  status: z.enum(['APPROVE', 'REJECT', 'ESCALATE']).optional(),
  dimension: z.enum(['moderators', 'teams', 'lobs', 'organizations', 'queues']).default('queues'),
  order: z.enum(['name', 'completed', 'aht']).default('completed'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  search: z.string().trim().max(80).default(''),
}).strict().superRefine((filters, ctx) => {
  if (filters.preset === 'custom') {
    if (!filters.from || !filters.through || filters.from > filters.through ||
        Date.parse(filters.through) - Date.parse(filters.from) > 92 * day) {
      ctx.addIssue({ code: 'custom', path: ['through'], message: 'Choose an ordered range of at most 93 local days.' });
    }
  } else if (filters.from || filters.through) {
    ctx.addIssue({ code: 'custom', path: ['preset'], message: 'Explicit dates require the custom preset.' });
  }
});
export type AnalyticsFilters = z.infer<typeof analyticsFilters>;
export type Bucket = { label: string; start: Date; end: Date };

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export function reportWindow(filters: AnalyticsFilters, now: Date) {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: filters.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  function localDay(ms: number) {
    const parts = format.formatToParts(ms);
    const value = (type: string) => parts.find((item) => item.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
  // Search for the first instant in the local date, including midnight offset transitions.
  function boundary(date: string) {
    const guess = Date.parse(date);
    let low = guess - 2 * day;
    let high = guess + 2 * day;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (localDay(middle) < date) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  const today = Date.parse(localDay(+now));
  const span = filters.preset === '30days' ? 29 : filters.preset === '7days' ? 6 : 0;
  const last = filters.through ?? isoDay(today - (filters.preset === 'yesterday' ? day : 0));
  const first = filters.from ?? isoDay(Date.parse(last) - span * day);
  const daily: Bucket[] = [];
  for (let cursor = Date.parse(first); cursor <= Date.parse(last); cursor += day) {
    const start = boundary(isoDay(cursor));
    const end = boundary(isoDay(cursor + day));
    if (start < end && start < +now) daily.push({
      label: isoDay(cursor), start: new Date(start), end: new Date(Math.min(end, +now)),
    });
  }
  const hourly: Bucket[] = [];
  const latest = daily.at(-1);
  const formatHour = new Intl.DateTimeFormat('en-GB', {
    timeZone: filters.timezone, hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset',
  });
  if (latest) for (let cursor = +latest.start; cursor < +latest.end; cursor += hour) {
    hourly.push({ label: formatHour.format(cursor), start: new Date(cursor),
      end: new Date(Math.min(cursor + hour, +latest.end)) });
  }
  const start = new Date(boundary(first));
  const end = new Date(Math.max(+start, Math.min(boundary(isoDay(Date.parse(last) + day)), +now)));
  return { start, end, from: first, through: last, daily, hourly };
}

export const emptyAux = (): AuxTotals => ({
  MODERATING: 0, NON_MODERATING: 0, BREAK: 0, MEETING: 0, OFFLINE: 0, TRAINING: 0,
});

export type AuxSource = {
  id: string; moderatorId: string; state: AuxState; startedAt: Date; effectiveEnd: Date;
};

/** First-started interval owns overlaps. Ties use the immutable interval ID. */
export function calculateAux(rows: AuxSource[], start: Date, end: Date, daily: Bucket[]) {
  const totals = emptyAux();
  const perDay = daily.map(({ label }) => ({ label, states: emptyAux() }));
  const byModerator = new Map<string, AuxTotals>();
  const lastEnd = new Map<string, number>();
  let overlappingIntervals = 0;
  let invalidIntervals = 0;
  for (const row of [...rows].sort((a, b) => +a.startedAt - +b.startedAt || a.id.localeCompare(b.id))) {
    if (+row.effectiveEnd < +row.startedAt) { invalidIntervals++; continue; }
    const requestedStart = Math.max(+start, +row.startedAt);
    const to = Math.min(+end, +row.effectiveEnd);
    if (requestedStart >= to) continue;
    const from = Math.max(requestedStart, lastEnd.get(row.moderatorId) ?? requestedStart);
    if (from > requestedStart) overlappingIntervals++;
    if (from >= to) continue;
    lastEnd.set(row.moderatorId, to);
    const length = (to - from) / 1000;
    totals[row.state] += length;
    const personal = byModerator.get(row.moderatorId) ?? emptyAux();
    personal[row.state] += length;
    byModerator.set(row.moderatorId, personal);
    daily.forEach((bucket, index) => {
      perDay[index]!.states[row.state] += Math.max(0, Math.min(to, +bucket.end) - Math.max(from, +bucket.start)) / 1000;
    });
  }
  return { totals, perDay, byModerator, overlappingIntervals, invalidIntervals };
}
