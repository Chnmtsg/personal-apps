/**
 * The screens, rendered against a stub DOM.
 *
 * Two things are being checked. First, that every screen renders at all — for
 * an empty list, for a goal with no check-ins, for one with a forecast. Second,
 * that no screen ever prints `undefined`, `NaN` or `[object Object]`, which is
 * how a missing number reaches a user in an app with no typechecker.
 *
 * The wizard gets driven for real, because the rule it enforces — no goal
 * without numbers — is the reason this app exists.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { installDom } from '../tools/dom-stub.js';

installDom();

const [
  { default: db },
  store,
  { goalsView },
  { goalView },
  { checkInView },
  { wizardView },
  { dataView },
] = await Promise.all([
  import('../src/core/db.js').then((module) => ({ default: module })),
  import('../src/core/store.js'),
  import('../src/ui/views/goals.js'),
  import('../src/ui/views/goal.js'),
  import('../src/ui/views/checkin.js'),
  import('../src/ui/views/wizard.js'),
  import('../src/ui/views/data.js'),
]);

const NONSENSE = /undefined|NaN|\[object Object\]/;

const readable = (node, where) => {
  const text = node.textContent;
  assert.ok(!NONSENSE.test(text), `${where} printed something meaningless: ${text.match(NONSENSE)?.[0]}`);
  return text;
};

const buttonLabelled = (root, label) =>
  root.querySelectorAll('button').find((node) => node.textContent.includes(label));

const type = (input, value) => { input.value = String(value); input.fire('input'); };

/**
 * A wizard with no half-finished draft in it.
 *
 * The draft deliberately outlives a navigation — walking away from step three
 * and coming back should not lose the work — so a test that wants a clean one
 * has to abandon it the way a user would: back to the first step, then cancel.
 */
function freshWizard() {
  let node = wizardView();
  for (let guard = 0; guard < 6 && !buttonLabelled(node, 'Cancel'); guard += 1) {
    buttonLabelled(node, 'Back').click();
  }
  buttonLabelled(node, 'Cancel')?.click();
  return wizardView();
}

async function settle(condition, why) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting: ${why}`);
}

async function fresh() {
  db.close();
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(db.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = resolve;
    request.onblocked = resolve;
  });
  await store.load();
}

const GOAL = {
  title: 'Run a half marathon',
  why: 'To stop negotiating with myself at 7am.',
  startDate: '2026-01-01',
  targetDate: '2026-06-01',
};

const INDICATORS = [
  { name: 'Longest run', unit: 'km', kind: 'lagging', baseline: 5, target: 21 },
  { name: 'Sessions', unit: 'per week', kind: 'leading', baseline: 1, target: 4, weight: 2 },
];

async function seeded({ withCheckIns = true } = {}) {
  await fresh();
  const { goal } = await store.createGoal(GOAL, INDICATORS);
  const [run, sessions] = store.indicatorsOf(goal.id);
  if (withCheckIns) {
    for (const [index, value] of [8, 11, 14, 16].entries()) {
      await store.recordCheckIns([{ indicatorId: run.id, value, date: `2026-02-0${index + 1}` }]);
    }
    await store.recordCheckIns([{ indicatorId: sessions.id, value: 3, date: '2026-02-04', note: 'two easy, one long' }]);
  }
  return { goal, run, sessions };
}

// ------------------------------------------------------------------ screens

test('the empty list explains the rule instead of showing nothing', async () => {
  await fresh();
  const text = readable(goalsView(), 'empty list');
  assert.match(text, /numbers/i);
  assert.match(text, /Add the first goal/);
});

test('the goal list shows progress and pace as two separate numbers', async () => {
  const { goal } = await seeded();
  const text = readable(goalsView(), 'goal list');

  assert.match(text, /Run a half marathon/);
  assert.match(text, /\d+% done vs \d+% of the time/, 'the comparison behind the chip is spelled out');
  assert.match(text, /ahead|on track|behind|at risk/);
  assert.match(text, /indicators/);
  assert.ok(!/No leading indicator/.test(text), 'this goal has one, so it must not be flagged');
});

test('a goal with only outcome indicators is flagged in the list', async () => {
  await fresh();
  await store.createGoal(GOAL, [{ name: 'Weight', unit: 'kg', kind: 'lagging', baseline: 92, target: 84 }]);
  assert.match(readable(goalsView(), 'lagging-only list'), /No leading indicator/);
});

test('goal detail answers all three questions', async () => {
  const { goal } = await seeded();
  const text = readable(goalView({ id: goal.id }), 'goal detail');

  assert.match(text, /Progress/);
  assert.match(text, /Expected by now/);
  assert.match(text, /Pace/);
  assert.match(text, /At this rate: |Target reached|no date to give|too slowly/, 'a projection, or an honest refusal');
  assert.match(text, /To stop negotiating/, 'the why is kept where it can be reread');
  assert.match(text, /Longest run/);
});

test('goal detail survives a goal with nothing recorded yet', async () => {
  const { goal } = await seeded({ withCheckIns: false });
  const text = readable(goalView({ id: goal.id }), 'goal detail, no check-ins');
  assert.match(text, /Nothing recorded yet/);
  assert.match(text, /Not enough check-ins to project from/);
});

test('goal detail refuses to invent a date when the trend runs backwards', async () => {
  const { goal, run } = await seeded({ withCheckIns: false });
  for (const [index, value] of [16, 12, 9, 6].entries()) {
    await store.recordCheckIns([{ indicatorId: run.id, value, date: `2026-02-0${index + 1}` }]);
  }
  const text = readable(goalView({ id: goal.id }), 'backwards trend');
  assert.match(text, /No movement towards the target/);
});

test('a missing goal says so rather than throwing', async () => {
  await fresh();
  assert.match(readable(goalView({ id: 'goal_nope' }), 'missing goal'), /not here any more/);
});

test('the check-in screen offers one box per indicator', async () => {
  const { goal } = await seeded();
  const node = checkInView({ id: goal.id });
  const text = readable(node, 'check-in');

  const numbers = node.querySelectorAll('input').filter((input) => input.attributes.type === 'number');
  assert.equal(numbers.length, 2, 'one numeric box per indicator, on one screen');
  assert.equal(numbers[0].attributes.inputmode, 'decimal', 'a phone should show the number pad');
  assert.match(text, /two easy, one long/, 'the recent history is there to correct mistakes from');
});

test('the data screen counts what is stored and explains the maths', async () => {
  await seeded();
  const text = readable(dataView(), 'data');
  assert.match(text, /1 goals · 2 indicators · 5 check-ins/);
  assert.match(text, /replaces what is here rather than merging/);
});

// ------------------------------------------------------------------- wizard

test('the wizard will not save a goal with no numbers', async () => {
  await fresh();
  const node = freshWizard();

  type(node.querySelector('input'), 'Learn to swim');
  buttonLabelled(node, 'Next').click();          // why
  buttonLabelled(node, 'Next').click();          // when
  buttonLabelled(node, 'Next').click();          // numbers
  buttonLabelled(node, 'Save goal').click();

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(store.goals().length, 0, 'a goal without numbers is not a goal');
  assert.match(readable(node, 'wizard faults'), /needs a name|needs a unit|needs today's number/);
});

test('the wizard blocks a title-less goal at the first step', async () => {
  await fresh();
  const node = freshWizard();
  buttonLabelled(node, 'Next').click();
  assert.match(readable(node, 'wizard step one'), /A goal needs a title/);
});

test('the wizard saves a goal once it carries numbers, and asks twice about outcome-only ones', async () => {
  await fresh();
  const node = freshWizard();

  type(node.querySelector('input'), 'Lose the last stone');
  buttonLabelled(node, 'Next').click();
  buttonLabelled(node, 'Next').click();
  buttonLabelled(node, 'Next').click();

  const text = node.querySelectorAll('input').filter((input) => input.attributes.type !== 'number');
  type(text[0], 'Weight');
  type(text[1], 'kg');
  const numbers = node.querySelectorAll('input').filter((input) => input.attributes.type === 'number');
  type(numbers[0], 92);
  type(numbers[1], 84);

  // Everything here is an outcome, so the first Save asks rather than saves.
  buttonLabelled(node, 'Save goal').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(store.goals().length, 0, 'the warning has to be seen first');
  assert.match(readable(node, 'wizard warning'), /leading indicator/);

  buttonLabelled(node, 'Save anyway').click();
  await settle(() => store.goals().length === 1, 'the goal to be saved after the warning');

  const saved = store.goals()[0];
  assert.equal(saved.title, 'Lose the last stone');
  const [weight] = store.indicatorsOf(saved.id);
  assert.equal(weight.direction, 'down', 'a target below the baseline is a falling target');
  assert.equal(weight.current, 92, 'current starts at the measured baseline');
});
