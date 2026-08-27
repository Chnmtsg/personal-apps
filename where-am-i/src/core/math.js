/**
 * The measurement engine.
 *
 * Pure functions over plain objects. No storage, no DOM, no clock of its own —
 * `today` is always passed in. That is what lets the whole engine be tested in
 * Node, and it is the rule this file must never break.
 *
 * The app answers three questions and this file answers all three:
 *   1. how far from the start   -> goalProgress
 *   2. ahead or behind pace     -> pace / paceLabel
 *   3. where will I land        -> projection
 *
 * Progress and pace are two separate numbers and are never merged into one
 * score. Someone 60% done and 20% behind schedule needs to see both.
 */

import { toDayNumber, fromDayNumber } from './time.js';

/** Overshoot stays visible instead of flattening at 100%. */
export const PROGRESS_CEILING = 1.25;

/** Pace bands, best-first. Order matters: every at-risk pace is also behind. */
export const PACE_BANDS = ['ahead', 'on-track', 'behind', 'at-risk'];
export const PACE_ON_TRACK = 0.05;
export const PACE_AT_RISK = -0.2;

/** Least-squares window: the last 5 check-ins, and never fewer than 3. */
export const VELOCITY_WINDOW = 5;
export const VELOCITY_MIN_POINTS = 3;

/**
 * Beyond this, a projected date is arithmetic rather than information. Saying
 * "not at this rate" is honest; printing a date in 2098 is not.
 */
export const PROJECTION_HORIZON_DAYS = 3650;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * The direction of travel. Stored on the indicator, but inferred from the
 * numbers when absent so half-built or imported indicators still behave.
 */
export function direction(indicator) {
  if (indicator?.direction === 'up' || indicator?.direction === 'down') {
    return indicator.direction;
  }
  const falling = Number.isFinite(indicator?.target)
    && Number.isFinite(indicator?.baseline)
    && indicator.target < indicator.baseline;
  return falling ? 'down' : 'up';
}

/** Has the number arrived at, or passed, the target? Direction decides which side counts. */
export function reachedTarget(indicator) {
  const current = indicator?.current;
  const target = indicator?.target;
  if (!Number.isFinite(current) || !Number.isFinite(target)) return false;
  return direction(indicator) === 'down' ? current <= target : current >= target;
}

/**
 * Progress on one indicator, as a fraction of the distance from baseline to
 * target.
 *
 *   (current - baseline) / (target - baseline)
 *
 * Direction needs no special case: for a falling target the denominator is
 * negative and so is the numerator, and the ratio comes out positive. That is
 * why baseline is captured at creation and never assumed to be zero — without
 * it, "lose 6kg" and "gain 6kg" could not share one formula.
 *
 * Returns a number in [0, PROGRESS_CEILING], or null if the inputs are not
 * numbers.
 */
export function indicatorProgress(indicator) {
  const baseline = indicator?.baseline;
  const current = indicator?.current;
  const target = indicator?.target;
  if (![baseline, current, target].every(Number.isFinite)) return null;

  const span = target - baseline;
  if (span === 0) {
    // Nothing to travel. "Hold at 70kg" is complete while the number is held.
    return reachedTarget(indicator) ? 1 : 0;
  }
  return clamp((current - baseline) / span, 0, PROGRESS_CEILING);
}

/**
 * The weighted mean of the indicators' progress.
 *
 * Indicators with unreadable numbers are dropped rather than counted as zero:
 * one broken indicator should not make the whole goal look like a failure.
 * Returns null when nothing is measurable, which the UI shows as "not measured
 * yet" rather than as 0%.
 */
export function goalProgress(indicators) {
  if (!Array.isArray(indicators) || indicators.length === 0) return null;

  let weighted = 0;
  let total = 0;
  for (const indicator of indicators) {
    const progress = indicatorProgress(indicator);
    if (progress === null) continue;
    const weight = Number.isFinite(indicator?.weight) && indicator.weight > 0 ? indicator.weight : 1;
    weighted += weight * progress;
    total += weight;
  }
  return total === 0 ? null : weighted / total;
}

/**
 * How far through the calendar the goal is — the pace the deadline demands.
 * Clamped to [0, 1]: before the start nothing is owed, after the deadline
 * everything is.
 */
export function expectedProgress(startDate, targetDate, todayDate) {
  const start = toDayNumber(startDate);
  const end = toDayNumber(targetDate);
  const now = toDayNumber(todayDate);
  if (start === null || end === null || now === null) return null;

  // A same-day or inverted window has no span to divide by, so the deadline
  // alone decides: still ahead means nothing is owed yet, past means all of it
  // is. The start date cannot be the reference here — in an inverted window it
  // sits after the deadline, and a goal is not owed nothing after it is due.
  if (end <= start) return now < end ? 0 : 1;

  return clamp((now - start) / (end - start), 0, 1);
}

/**
 * Progress minus the calendar. Positive is ahead of schedule.
 * Kept as its own number, never folded into progress.
 */
export function pace(progress, expected) {
  if (!Number.isFinite(progress) || !Number.isFinite(expected)) return null;
  return progress - expected;
}

/**
 * The band a pace falls in. Exhaustive and mutually exclusive over every finite
 * number. The at-risk test runs first because at-risk is a subset of behind,
 * and the boundaries themselves read as on track: -0.05 and +0.05 are inside
 * the tolerance, not outside it.
 */
export function paceLabel(paceValue) {
  if (!Number.isFinite(paceValue)) return null;
  if (paceValue < PACE_AT_RISK) return 'at-risk';
  if (paceValue < -PACE_ON_TRACK) return 'behind';
  if (paceValue > PACE_ON_TRACK) return 'ahead';
  return 'on-track';
}

const recordedAt = (checkIn) => (typeof checkIn?.createdAt === 'string' ? checkIn.createdAt : '');

/**
 * One reading per day, latest wins, oldest first.
 *
 * Two check-ins on the same day are a correction, not two data points — someone
 * fixing a typo must not bend the trend line by leaving the typo in it. This is
 * also what keeps the projection stable when a duplicate check-in is added.
 */
export function series(checkIns) {
  if (!Array.isArray(checkIns)) return [];

  const byDay = new Map();
  for (const checkIn of checkIns) {
    const day = toDayNumber(checkIn?.date);
    if (day === null || !Number.isFinite(checkIn?.value)) continue;
    const existing = byDay.get(day);
    // Later-recorded wins for the same day, falling back to insertion order.
    if (!existing || recordedAt(checkIn) >= recordedAt(existing.checkIn)) {
      byDay.set(day, { day, value: checkIn.value, checkIn });
    }
  }

  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

/**
 * Units per day, as the least-squares slope of the last VELOCITY_WINDOW
 * readings.
 *
 * A regression rather than first-to-last, so one bad weigh-in cannot rewrite
 * the forecast. Returns null when there is too little to fit, or when every
 * reading lands on one day and the slope would be a division by zero.
 */
export function velocity(checkIns) {
  const points = series(checkIns).slice(-VELOCITY_WINDOW);
  if (points.length < VELOCITY_MIN_POINTS) return null;

  const meanDay = points.reduce((sum, p) => sum + p.day, 0) / points.length;
  const meanValue = points.reduce((sum, p) => sum + p.value, 0) / points.length;

  let covariance = 0;
  let variance = 0;
  for (const point of points) {
    const dx = point.day - meanDay;
    covariance += dx * (point.value - meanValue);
    variance += dx * dx;
  }
  if (variance === 0) return null;

  const slope = covariance / variance;
  return Number.isFinite(slope) ? slope : null;
}

/**
 * Where the indicator lands at its current speed.
 *
 * Always returns a status rather than a bare date, because "we cannot say" is a
 * real answer and the screen has to be able to print it:
 *
 *   reached          the target is already met
 *   projected        { date, days } — a date worth showing
 *   no-movement      too little data, flat, or travelling away from the target
 *   beyond-horizon   moving, but so slowly the date would be meaningless
 */
export function projection(indicator, checkIns, todayDate) {
  const speed = velocity(checkIns);
  const base = { velocity: speed };

  if (reachedTarget(indicator)) return { ...base, status: 'reached' };

  const current = indicator?.current;
  const target = indicator?.target;
  const now = toDayNumber(todayDate);
  if (!Number.isFinite(current) || !Number.isFinite(target) || now === null) {
    return { ...base, status: 'no-movement' };
  }
  if (speed === null || speed === 0) return { ...base, status: 'no-movement' };

  const days = (target - current) / speed;
  // A negative or non-finite crossing means the trend runs away from the
  // target. Both directions collapse into this one test: for a falling target
  // the remaining distance is negative, so only a negative slope yields a
  // positive number of days.
  if (!Number.isFinite(days) || days <= 0) return { ...base, status: 'no-movement' };
  if (days > PROJECTION_HORIZON_DAYS) return { ...base, status: 'beyond-horizon', days };

  return { ...base, status: 'projected', days, date: fromDayNumber(now + Math.ceil(days)) };
}

/** Everything the goal list and the detail header need, in one pass. */
export function summarise(goal, indicators, todayDate) {
  const list = Array.isArray(indicators) ? indicators : [];
  const progress = goalProgress(list);
  const expected = expectedProgress(goal?.startDate, goal?.targetDate, todayDate);
  const paceValue = pace(progress, expected);
  const end = toDayNumber(goal?.targetDate);
  const now = toDayNumber(todayDate);

  return {
    progress,
    expected,
    pace: paceValue,
    paceLabel: paceLabel(paceValue),
    daysRemaining: end === null || now === null ? null : end - now,
    hasLeading: list.some((indicator) => indicator?.kind === 'leading'),
  };
}
