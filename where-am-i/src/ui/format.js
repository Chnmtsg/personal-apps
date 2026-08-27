/**
 * Turning numbers into words, in one place.
 *
 * The rule throughout: never print a number the app is not sure of. A missing
 * measurement reads as "not measured", never as 0, and a forecast it cannot
 * make says so.
 */

import { daysBetween } from '../core/time.js';

export const PACE_TEXT = {
  ahead: 'ahead',
  'on-track': 'on track',
  behind: 'behind',
  'at-risk': 'at risk',
};

/** Percentages are whole numbers. A goal is never 62.4% done in any useful sense. */
export function percent(fraction) {
  return Number.isFinite(fraction) ? `${Math.round(fraction * 100)}%` : '—';
}

/** Signed, for pace: the sign is the whole point. */
export function signedPercent(fraction) {
  if (!Number.isFinite(fraction)) return '—';
  const points = Math.round(fraction * 100);
  return `${points > 0 ? '+' : ''}${points}%`;
}

/**
 * Measurements keep enough precision to be recognisable and no more: 84.2kg
 * stays 84.2, 3 stays 3, and 0.4285 sessions per day becomes 0.43.
 */
export function measure(value, unit) {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  const decimals = magnitude >= 100 || Number.isInteger(value) ? 0 : magnitude >= 1 ? 1 : 2;
  const text = value.toFixed(decimals);
  return unit ? `${text} ${unit}` : text;
}

/** A unit that is already a rate: "per week", "sessions/week", "a day". */
const isRateUnit = (unit) => /\bper\b|\//i.test(unit ?? '');

export function rate(perDay, unit) {
  if (!Number.isFinite(perDay)) return null;
  const perWeek = perDay * 7;
  // Per week reads better than per day for almost everything a person tracks;
  // a daily rate of 0.03 tells nobody anything.
  //
  // The unit is dropped when it is itself a rate, or an indicator measured in
  // sessions per week would report "+0.13 per week a week". The card already
  // names the unit directly above this line.
  const named = unit && !isRateUnit(unit) ? `${unit} ` : '';
  return `${perWeek > 0 ? '+' : ''}${measure(perWeek)} ${named}a week`;
}

export function shortDate(iso) {
  if (!iso) return '—';
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function dayCount(days) {
  if (!Number.isFinite(days)) return '—';
  if (days === 0) return 'today';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  return `${days} day${days === 1 ? '' : 's'} left`;
}

export function since(iso, todayIso) {
  const days = daysBetween(iso, todayIso);
  if (days === null) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
