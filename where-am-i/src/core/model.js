/**
 * Shapes, defaults, and the rules that decide what may be saved.
 *
 * Pure, like math.js. Validation lives here rather than in the form so that
 * import cannot smuggle in a goal the wizard would have refused.
 *
 * The one rule this whole app exists to enforce lives in `validateGoalDraft`:
 * a goal with no numbers is not a goal, and it does not get stored.
 */

import { isIsoDate, today } from './time.js';

export const DIRECTIONS = ['up', 'down'];
export const KINDS = ['lagging', 'leading'];
export const STATUSES = ['active', 'done', 'abandoned'];

/**
 * Ids are generated, not derived from content: two indicators may legitimately
 * share a name and unit within one goal.
 */
export function newId(prefix) {
  const random = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14).padEnd(12, '0');
  return `${prefix}_${random}`;
}

const trim = (value) => (typeof value === 'string' ? value.trim() : '');
const num = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || trim(value) === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function makeGoal(draft = {}, now = new Date()) {
  const startDate = isIsoDate(draft.startDate) ? draft.startDate : today(now);
  return {
    id: draft.id || newId('goal'),
    title: trim(draft.title),
    why: trim(draft.why),
    startDate,
    targetDate: isIsoDate(draft.targetDate) ? draft.targetDate : null,
    status: STATUSES.includes(draft.status) ? draft.status : 'active',
    createdAt: draft.createdAt || new Date(now).toISOString(),
  };
}

export function makeIndicator(draft = {}, goalId) {
  const baseline = num(draft.baseline);
  const target = num(draft.target);
  return {
    id: draft.id || newId('ind'),
    goalId: draft.goalId || goalId,
    name: trim(draft.name),
    unit: trim(draft.unit),
    // Direction is derived from the numbers unless it was stated. Someone
    // typing baseline 92 and target 84 has already said "down".
    direction: DIRECTIONS.includes(draft.direction)
      ? draft.direction
      : (baseline !== null && target !== null && target < baseline ? 'down' : 'up'),
    kind: KINDS.includes(draft.kind) ? draft.kind : 'lagging',
    baseline,
    // Current starts at the baseline: on day one, today's number *is* the
    // baseline. Starting it at zero would show instant progress on a falling
    // target and none at all on a rising one.
    current: num(draft.current) ?? baseline,
    target,
    weight: num(draft.weight) && num(draft.weight) > 0 ? num(draft.weight) : 1,
  };
}

export function makeCheckIn(draft = {}, now = new Date()) {
  return {
    id: draft.id || newId('chk'),
    indicatorId: draft.indicatorId,
    value: num(draft.value),
    date: isIsoDate(draft.date) ? draft.date : today(now),
    note: trim(draft.note),
    createdAt: draft.createdAt || new Date(now).toISOString(),
  };
}

/**
 * Faults block a save. Warnings do not — they are shown and can be accepted,
 * because "all my indicators are outcomes" is a bad shape for a goal but the
 * user's call to make.
 */
export function validateIndicator(indicator, index = 0) {
  const faults = [];
  const where = indicator?.name ? `"${indicator.name}"` : `Indicator ${index + 1}`;

  if (!trim(indicator?.name)) faults.push({ field: `indicator.${index}.name`, message: `${where} needs a name.` });
  if (!trim(indicator?.unit)) faults.push({ field: `indicator.${index}.unit`, message: `${where} needs a unit — the thing you are counting.` });
  if (!Number.isFinite(indicator?.baseline)) {
    faults.push({ field: `indicator.${index}.baseline`, message: `${where} needs today's number. Measure it; do not assume zero.` });
  }
  if (!Number.isFinite(indicator?.target)) {
    faults.push({ field: `indicator.${index}.target`, message: `${where} needs a target number.` });
  }
  return faults;
}

/**
 * The gate. Everything that stops a vague goal reaching storage is here, in one
 * readable list, so the rules can be read without reading the wizard.
 */
export function validateGoalDraft(goal, indicators) {
  const faults = [];
  const warnings = [];
  const list = Array.isArray(indicators) ? indicators : [];

  if (!trim(goal?.title)) faults.push({ field: 'title', message: 'A goal needs a title.' });
  if (!isIsoDate(goal?.startDate)) faults.push({ field: 'startDate', message: 'A goal needs a start date.' });
  if (!isIsoDate(goal?.targetDate)) {
    faults.push({ field: 'targetDate', message: 'A goal needs a deadline. Without one there is no pace to be ahead of.' });
  } else if (isIsoDate(goal?.startDate) && goal.targetDate <= goal.startDate) {
    faults.push({ field: 'targetDate', message: 'The deadline has to fall after the start date.' });
  }

  // The rule the app is built around.
  if (list.length === 0) {
    faults.push({ field: 'indicators', message: 'A goal with no numbers is a wish. Add at least one indicator.' });
  }
  list.forEach((indicator, index) => faults.push(...validateIndicator(indicator, index)));

  if (list.length > 0 && !list.some((indicator) => indicator.kind === 'leading')) {
    warnings.push({
      field: 'indicators',
      message: 'Every indicator here is an outcome you can only watch. Add one leading indicator — a behaviour you control directly, such as sessions per week — or you will have nothing to change when you fall behind.',
    });
  }
  if (!trim(goal?.why)) {
    warnings.push({ field: 'why', message: 'No reason recorded. In eight weeks this is the field you will want to reread.' });
  }

  return { faults, warnings, ok: faults.length === 0 };
}
