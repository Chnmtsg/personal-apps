/**
 * Day-precision time.
 *
 * Every date in this app is a calendar day, never an instant. A check-in
 * happened "on the 4th", not "at 14:07 local". Storing instants would make the
 * same check-in fall on different days for a user who travels, and the whole
 * app is arithmetic over day counts.
 *
 * So: dates are 'YYYY-MM-DD' strings on disk, and integer day numbers in the
 * maths. Parsing is forced to UTC because 'YYYY-MM-DD' passed to `new Date()`
 * is already UTC by spec, and any local-time conversion would shift the day.
 */

const MS_PER_DAY = 86400000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false;
  // Rejects 2026-02-31: Date normalises it, so it round-trips to a different string.
  return toIsoDate(new Date(`${value}T00:00:00Z`)) === value;
}

/** A Date (or anything Date accepts) to 'YYYY-MM-DD', read in UTC. */
export function toIsoDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * 'YYYY-MM-DD' to a whole number of days since the epoch.
 * This is the only number the maths ever sees, so a day is always exactly 1
 * apart from the next — no DST hour to lose.
 */
export function toDayNumber(isoDate) {
  if (!isIsoDate(isoDate)) return null;
  return Math.round(Date.parse(`${isoDate}T00:00:00Z`) / MS_PER_DAY);
}

export function fromDayNumber(dayNumber) {
  if (!Number.isFinite(dayNumber)) return null;
  return toIsoDate(new Date(Math.round(dayNumber) * MS_PER_DAY));
}

/** Whole days from `a` to `b`. Negative when b is earlier. */
export function daysBetween(a, b) {
  const from = toDayNumber(a);
  const to = toDayNumber(b);
  if (from === null || to === null) return null;
  return to - from;
}

export function addDays(isoDate, days) {
  const day = toDayNumber(isoDate);
  if (day === null || !Number.isFinite(days)) return null;
  return fromDayNumber(day + Math.round(days));
}

/**
 * Today as the user's calendar sees it.
 *
 * Deliberately reads the *local* clock and then labels it as a day, rather
 * than using the UTC day: a user in UTC+9 checking in at 08:00 means the 4th,
 * not the 3rd.
 */
export function today(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
