/**
 * The storage layer, against a real IndexedDB implementation in Node.
 *
 * fake-indexeddb runs the same transaction and cursor semantics as a browser,
 * so cascades and derived fields are tested here rather than trusted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import * as db from '../src/core/db.js';
import * as store from '../src/core/store.js';
import { validateGoalDraft, makeGoal, makeIndicator } from '../src/core/model.js';
import { toExport, parse } from '../src/core/exchange.js';

const goalDraft = {
  title: 'Run a half marathon',
  why: 'To stop negotiating with myself at 7am.',
  startDate: '2026-01-01',
  targetDate: '2026-06-01',
};

const indicatorDrafts = [
  { name: 'Longest run', unit: 'km', kind: 'lagging', baseline: 5, target: 21 },
  { name: 'Sessions', unit: 'per week', kind: 'leading', baseline: 1, target: 4, weight: 2 },
];

async function fresh() {
  db.close();
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(db.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = resolve;
  });
  await store.load();
}

test('a goal with no indicators is refused, and nothing is written', async () => {
  await fresh();
  const result = await store.createGoal(goalDraft, []);

  assert.equal(result.ok, false);
  assert.ok(result.faults.some((fault) => fault.field === 'indicators'));
  assert.equal(store.goals().length, 0);
  assert.equal((await db.getAll('goals')).length, 0, 'a refused goal must not reach disk');
});

test('a goal and its indicators are written together', async () => {
  await fresh();
  const { ok, goal } = await store.createGoal(goalDraft, indicatorDrafts);

  assert.equal(ok, true);
  assert.equal(store.indicatorsOf(goal.id).length, 2);

  db.close();
  await store.load();
  assert.equal(store.goals().length, 1, 'it survives a reload');
  assert.equal(store.indicatorsOf(goal.id).length, 2);
});

test('only-lagging goals are warned about, not blocked', async () => {
  await fresh();
  const lagging = [{ name: 'Weight', unit: 'kg', kind: 'lagging', baseline: 92, target: 84 }];
  const result = await store.createGoal(goalDraft, lagging);

  assert.equal(result.ok, true, 'the user gets to overrule this one');
  assert.ok(result.warnings.some((warning) => warning.message.includes('leading indicator')));
});

test('a check-in updates the indicator it belongs to', async () => {
  await fresh();
  const { goal } = await store.createGoal(goalDraft, indicatorDrafts);
  const [longestRun] = store.indicatorsOf(goal.id);
  assert.equal(longestRun.current, 5, 'current starts at the baseline, not at zero');

  await store.recordCheckIns([{ indicatorId: longestRun.id, value: 12, date: '2026-02-01' }]);
  assert.equal(store.indicator(longestRun.id).current, 12);

  // An older reading arriving late must not overwrite a newer one.
  await store.recordCheckIns([{ indicatorId: longestRun.id, value: 8, date: '2026-01-15' }]);
  assert.equal(store.indicator(longestRun.id).current, 12);
});

test('blank values are skipped rather than stored as zero', async () => {
  await fresh();
  const { goal } = await store.createGoal(goalDraft, indicatorDrafts);
  const [first, second] = store.indicatorsOf(goal.id);

  const written = await store.recordCheckIns([
    { indicatorId: first.id, value: 9, date: '2026-02-01' },
    { indicatorId: second.id, value: '', date: '2026-02-01' },
  ]);

  assert.equal(written.length, 1);
  assert.equal(store.indicator(second.id).current, second.baseline);
});

test('deleting a check-in puts the number back', async () => {
  await fresh();
  const { goal } = await store.createGoal(goalDraft, indicatorDrafts);
  const [longestRun] = store.indicatorsOf(goal.id);

  const [recorded] = await store.recordCheckIns([{ indicatorId: longestRun.id, value: 18, date: '2026-03-01' }]);
  assert.equal(store.indicator(longestRun.id).current, 18);

  await store.deleteCheckIn(recorded.id);
  assert.equal(store.indicator(longestRun.id).current, 5, 'back to the baseline it came from');
  assert.equal((await db.getAll('checkIns')).length, 0);
});

test('deleting a goal takes its indicators and check-ins with it', async () => {
  await fresh();
  const { goal } = await store.createGoal(goalDraft, indicatorDrafts);
  const [first] = store.indicatorsOf(goal.id);
  await store.recordCheckIns([{ indicatorId: first.id, value: 11, date: '2026-02-02' }]);

  await store.deleteGoal(goal.id);

  assert.deepEqual(await db.getAll('goals'), []);
  assert.deepEqual(await db.getAll('indicators'), []);
  assert.deepEqual(await db.getAll('checkIns'), [], 'no orphan check-ins left on disk');
});

test('subscribers hear about every write', async () => {
  await fresh();
  let beats = 0;
  const unsubscribe = store.subscribe(() => { beats += 1; });

  await store.createGoal(goalDraft, indicatorDrafts);
  const [first] = store.indicatorsOf(store.goals()[0].id);
  await store.recordCheckIns([{ indicatorId: first.id, value: 7, date: '2026-02-03' }]);
  unsubscribe();
  await store.deleteGoal(store.goals()[0].id);

  assert.equal(beats, 2, 'two writes heard, and nothing after unsubscribing');
});

test('export round-trips through import', async () => {
  await fresh();
  const { goal } = await store.createGoal(goalDraft, indicatorDrafts);
  const [first] = store.indicatorsOf(goal.id);
  await store.recordCheckIns([{ indicatorId: first.id, value: 14, date: '2026-02-04', note: 'hilly' }]);

  const text = JSON.stringify(toExport(store.state()));
  await store.deleteGoal(goal.id);
  assert.equal(store.goals().length, 0);

  const read = parse(text);
  assert.equal(read.ok, true);
  await store.replaceAll(read.contents);

  assert.equal(store.goals().length, 1);
  assert.equal(store.goals()[0].title, goalDraft.title);
  assert.equal(store.indicatorsOf(goal.id).length, 2);
  assert.equal(store.checkInsOf(first.id)[0].note, 'hilly');
  assert.equal(store.indicator(first.id).current, 14);
});

test('import replaces rather than merges', async () => {
  await fresh();
  await store.createGoal(goalDraft, indicatorDrafts);
  const text = JSON.stringify(toExport(store.state()));

  await store.createGoal({ ...goalDraft, title: 'Something else' }, indicatorDrafts);
  assert.equal(store.goals().length, 2);

  await store.replaceAll(parse(text).contents);
  assert.equal(store.goals().length, 1, 'the file is the truth after an import');
});

test('a corrupt or foreign file is refused with a reason', () => {
  assert.equal(parse('not json').ok, false);
  assert.equal(parse('{"format":"some-other-app"}').ok, false);
  assert.match(parse(`{"format":"where-am-i","version":99}`).problems[0], /newer version/);

  const orphaned = JSON.stringify({
    format: 'where-am-i',
    version: 1,
    goals: [makeGoal(goalDraft)],
    indicators: [makeIndicator({ name: 'Ghost', unit: 'x', baseline: 0, target: 1 }, 'goal_missing')],
    checkIns: [],
  });
  const read = parse(orphaned);
  assert.equal(read.ok, true);
  assert.equal(read.contents.indicators.length, 0, 'an indicator with no goal is unreachable, so it is dropped');
  assert.match(read.problems[0], /Skipped indicator/);
});

test('validation refuses a deadline that is not after the start', () => {
  const verdict = validateGoalDraft(
    makeGoal({ ...goalDraft, targetDate: '2025-12-01' }),
    [makeIndicator(indicatorDrafts[0], 'goal_1')],
  );
  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.field === 'targetDate'));
});

test('an indicator without a measured baseline is refused', () => {
  const verdict = validateGoalDraft(
    makeGoal(goalDraft),
    [makeIndicator({ name: 'Vibes', unit: 'good', target: 10 }, 'goal_1')],
  );
  assert.equal(verdict.ok, false);
  assert.match(verdict.faults.find((f) => f.field.endsWith('baseline')).message, /do not assume zero/);
});
