/**
 * Export and import — the whole dataset as one JSON file.
 *
 * The data lives in one browser's IndexedDB and nowhere else. Clearing site
 * data, switching phones, or a browser reclaiming storage all lose it, so a
 * file the user holds is the only backup that exists. It is plain, readable
 * JSON on purpose.
 *
 * Import replaces rather than merges: merging two datasets that share ids has
 * no honest answer, and silently keeping the wrong side of a conflict is worse
 * than asking the user to choose a file.
 */

import { makeGoal, makeIndicator, makeCheckIn } from './model.js';

export const FORMAT = 'where-am-i';
export const FORMAT_VERSION = 1;

export function toExport(state, now = new Date()) {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date(now).toISOString(),
    goals: state.goals ?? [],
    indicators: state.indicators ?? [],
    checkIns: state.checkIns ?? [],
  };
}

export function toJSON(state, now = new Date()) {
  return JSON.stringify(toExport(state, now), null, 2);
}

export function filename(now = new Date()) {
  return `where-am-i-${new Date(now).toISOString().slice(0, 10)}.json`;
}

/**
 * Read a file back.
 *
 * Everything is rebuilt through the model factories, so an edited or truncated
 * file cannot introduce a record the app itself would refuse to create. Records
 * that survive that but point at nothing are dropped and counted, because an
 * indicator with no goal is unreachable from every screen.
 */
export function parse(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problems: ['That file is not JSON.'], contents: null };
  }

  if (!raw || typeof raw !== 'object' || raw.format !== FORMAT) {
    return { ok: false, problems: ['That is not a Where Am I export.'], contents: null };
  }
  if (raw.version > FORMAT_VERSION) {
    return {
      ok: false,
      contents: null,
      problems: [`That file was written by a newer version of the app (format ${raw.version}). Update first.`],
    };
  }

  const problems = [];
  const goals = asArray(raw.goals).map((goal) => makeGoal(goal)).filter((goal) => goal.title && goal.targetDate);
  const goalIds = new Set(goals.map((goal) => goal.id));

  const indicators = asArray(raw.indicators)
    .map((indicator) => makeIndicator(indicator, indicator?.goalId))
    .filter((indicator) => {
      const kept = goalIds.has(indicator.goalId) && Number.isFinite(indicator.baseline) && Number.isFinite(indicator.target);
      if (!kept) problems.push(`Skipped indicator "${indicator.name || indicator.id}" — no goal, or no numbers.`);
      return kept;
    });
  const indicatorIds = new Set(indicators.map((indicator) => indicator.id));

  const checkIns = asArray(raw.checkIns)
    .map((checkIn) => makeCheckIn(checkIn))
    .filter((checkIn) => indicatorIds.has(checkIn.indicatorId) && Number.isFinite(checkIn.value));

  const dropped = asArray(raw.checkIns).length - checkIns.length;
  if (dropped > 0) problems.push(`Skipped ${dropped} check-in${dropped === 1 ? '' : 's'} with no indicator or no value.`);

  if (goals.length === 0) return { ok: false, problems: [...problems, 'No usable goals in that file.'], contents: null };

  return { ok: true, problems, contents: { goals, indicators, checkIns } };
}

const asArray = (value) => (Array.isArray(value) ? value : []);
