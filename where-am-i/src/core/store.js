/**
 * The domain layer: everything the screens are allowed to ask for.
 *
 * The whole dataset is held in memory and written through to IndexedDB. That is
 * a deliberate ceiling: one person's goals and daily check-ins are kilobytes,
 * and keeping a single in-memory copy means every screen renders from the same
 * numbers with no async gaps to race.
 *
 * Views never touch db.js and never mutate what `state()` hands back.
 */

import * as db from './db.js';
import { makeGoal, makeIndicator, makeCheckIn, validateGoalDraft } from './model.js';
import { toDayNumber } from './time.js';

const cache = { goals: [], indicators: [], checkIns: [], loaded: false };
const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce() {
  for (const listener of [...listeners]) listener(state());
}

export async function load() {
  const [goals, indicators, checkIns] = await Promise.all([
    db.getAll('goals'),
    db.getAll('indicators'),
    db.getAll('checkIns'),
  ]);
  Object.assign(cache, { goals, indicators, checkIns, loaded: true });
  announce();
  return state();
}

export function state() {
  return cache;
}

export const goals = () => cache.goals;
export const goal = (goalId) => cache.goals.find((g) => g.id === goalId) ?? null;
export const indicatorsOf = (goalId) => cache.indicators.filter((i) => i.goalId === goalId);
export const indicator = (indicatorId) => cache.indicators.find((i) => i.id === indicatorId) ?? null;
export const checkInsOf = (indicatorId) => cache.checkIns.filter((c) => c.indicatorId === indicatorId);

/**
 * The newest reading for an indicator: latest day wins, and within a day the
 * most recently recorded wins. Ordering by `createdAt` is what makes a
 * same-day correction a correction rather than a second opinion.
 */
function newestCheckIn(checkIns) {
  let newest = null;
  for (const checkIn of checkIns) {
    const day = toDayNumber(checkIn.date);
    if (day === null || !Number.isFinite(checkIn.value)) continue;
    if (!newest) { newest = checkIn; continue; }
    const newestDay = toDayNumber(newest.date);
    if (day > newestDay || (day === newestDay && (checkIn.createdAt ?? '') >= (newest.createdAt ?? ''))) {
      newest = checkIn;
    }
  }
  return newest;
}

/**
 * `current` is derived, never independently edited.
 *
 * It is stored on the indicator anyway because the goal list would otherwise
 * have to scan every check-in to draw a ring. Recomputing it on every write
 * keeps the copy honest: delete the check-in and the number goes back.
 */
function deriveCurrent(indicatorRecord, checkIns) {
  const newest = newestCheckIn(checkIns);
  return { ...indicatorRecord, current: newest ? newest.value : indicatorRecord.baseline };
}

export async function createGoal(goalDraft, indicatorDrafts) {
  const record = makeGoal(goalDraft);
  const indicators = (indicatorDrafts ?? []).map((draft) => makeIndicator(draft, record.id));
  const verdict = validateGoalDraft(record, indicators);
  if (!verdict.ok) return { ...verdict, goal: null };

  await db.write(['goals', 'indicators'], (goalStore, indicatorStore) => {
    goalStore.put(record);
    for (const item of indicators) indicatorStore.put(item);
  });

  cache.goals = [...cache.goals, record];
  cache.indicators = [...cache.indicators, ...indicators];
  announce();
  return { ...verdict, goal: record };
}

export async function updateGoal(goalId, patch) {
  const existing = goal(goalId);
  if (!existing) return null;
  const updated = { ...existing, ...patch, id: goalId };
  await db.put('goals', updated);
  cache.goals = cache.goals.map((g) => (g.id === goalId ? updated : g));
  announce();
  return updated;
}

export async function deleteGoal(goalId) {
  const doomedIndicators = indicatorsOf(goalId).map((i) => i.id);
  const doomedCheckIns = cache.checkIns.filter((c) => doomedIndicators.includes(c.indicatorId));

  // Cascade in one transaction: a goal whose indicators outlive it leaves
  // check-ins that no screen can reach and no export can explain.
  await db.write(db.STORES, (goalStore, indicatorStore, checkInStore) => {
    goalStore.delete(goalId);
    for (const id of doomedIndicators) indicatorStore.delete(id);
    for (const checkIn of doomedCheckIns) checkInStore.delete(checkIn.id);
  });

  cache.goals = cache.goals.filter((g) => g.id !== goalId);
  cache.indicators = cache.indicators.filter((i) => i.goalId !== goalId);
  cache.checkIns = cache.checkIns.filter((c) => !doomedIndicators.includes(c.indicatorId));
  announce();
}

export async function addIndicator(goalId, draft) {
  const record = makeIndicator(draft, goalId);
  await db.put('indicators', record);
  cache.indicators = [...cache.indicators, record];
  announce();
  return record;
}

export async function deleteIndicator(indicatorId) {
  const doomed = checkInsOf(indicatorId);
  await db.write(['indicators', 'checkIns'], (indicatorStore, checkInStore) => {
    indicatorStore.delete(indicatorId);
    for (const checkIn of doomed) checkInStore.delete(checkIn.id);
  });
  cache.indicators = cache.indicators.filter((i) => i.id !== indicatorId);
  cache.checkIns = cache.checkIns.filter((c) => c.indicatorId !== indicatorId);
  announce();
}

/**
 * Record a check-in screen's worth of numbers.
 *
 * `entries` is [{ indicatorId, value, date, note }]. Blank values are skipped
 * rather than stored as zero — a missed measurement is missing, not nought.
 */
export async function recordCheckIns(entries) {
  const records = (entries ?? [])
    .map((entry) => makeCheckIn(entry))
    .filter((record) => Number.isFinite(record.value) && record.indicatorId);
  if (records.length === 0) return [];

  const nextCheckIns = [...cache.checkIns, ...records];
  const touched = new Set(records.map((record) => record.indicatorId));
  const nextIndicators = cache.indicators.map((item) => (
    touched.has(item.id)
      ? deriveCurrent(item, nextCheckIns.filter((c) => c.indicatorId === item.id))
      : item
  ));

  await db.write(['checkIns', 'indicators'], (checkInStore, indicatorStore) => {
    for (const record of records) checkInStore.put(record);
    for (const item of nextIndicators) if (touched.has(item.id)) indicatorStore.put(item);
  });

  cache.checkIns = nextCheckIns;
  cache.indicators = nextIndicators;
  announce();
  return records;
}

export async function deleteCheckIn(checkInId) {
  const doomed = cache.checkIns.find((c) => c.id === checkInId);
  if (!doomed) return;

  const nextCheckIns = cache.checkIns.filter((c) => c.id !== checkInId);
  const owner = indicator(doomed.indicatorId);
  const revised = owner
    ? deriveCurrent(owner, nextCheckIns.filter((c) => c.indicatorId === owner.id))
    : null;

  await db.write(['checkIns', 'indicators'], (checkInStore, indicatorStore) => {
    checkInStore.delete(checkInId);
    if (revised) indicatorStore.put(revised);
  });

  cache.checkIns = nextCheckIns;
  if (revised) cache.indicators = cache.indicators.map((i) => (i.id === revised.id ? revised : i));
  announce();
}

/** Used by import, which replaces the dataset wholesale. */
export async function replaceAll(contents) {
  await db.replaceAll(contents);
  await load();
}
