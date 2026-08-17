/* Drive js/app.js through its real click router.
   Run: node tools/wire.js

   The third suite, and the smallest of the three. `smoke.js` loads the data
   layer and `render.js` loads the views, but neither loads `app.js` — so every
   click handler, and the file's syntax, went unchecked. A stray newline inside
   a string literal once left `app.js` unparseable while both suites reported
   green: a syntax error takes the whole file with it, so nothing wired up at
   all and the app was dead on open.

   The DOM here is a stub with just enough in it to route a click. It cannot
   tell you a button is reachable, or styled, or on the screen — only that
   tapping it does what the handler says. Real taps still need a browser. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.join(__dirname, '..', 'js');
const nodes = new Map();
const listeners = { click: [], change: [] };
let pickValues = [];          // what is ticked in the picker right now

function el(id) {
  return {
    id: id || '', innerHTML: '', value: '', checked: false, dataset: {}, style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    appendChild() {}, remove() {}, click() {}, focus() {}, blur() {},
    setAttribute() {}, removeAttribute() {}, insertAdjacentHTML() {},
    setSelectionRange() {}, scrollIntoView() {}, addEventListener() {},
    getContext: () => ({ clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillRect() {}, scale() {} }),
    contains: () => false, closest: () => null,
    querySelector: (s) => resolve(s), querySelectorAll: () => []
  };
}
function resolve(sel) {
  const k = String(sel);
  if (!nodes.has(k)) nodes.set(k, el(k.replace('#', '')));
  return nodes.get(k);
}

const document = {
  querySelector: resolve,
  getElementById: (id) => resolve('#' + id),
  createElement: () => el(),
  body: el('body'),
  documentElement: { style: {} },
  title: '',
  addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  querySelectorAll: (sel) => {
    // The one selector app.js uses that has to mean something here.
    if (String(sel).indexOf('run_pick') >= 0) return pickValues.map((v) => ({ value: v }));
    return [];
  }
};

const sandbox = {
  console, document,
  localStorage: (() => { const m = new Map(); return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k) }; })(),
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  location: { hash: '', protocol: 'http:' }, history: { replaceState() {} },
  matchMedia: () => ({ matches: false }), scrollTo() {},
  innerWidth: 412, innerHeight: 900, devicePixelRatio: 1,
  Notification: undefined, addEventListener() {}, navigator: { vibrate: () => true },
  Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
  FileReader: function () {}, alert() {}, confirm: () => true, prompt: () => null
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['data.js', 'program.js', 'goals.js', 'run.js', 'photos.js', 'store.js', 'ui.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
}

const S = sandbox.Store;
const A = sandbox.Arise;

/** A click on a control carrying these data attributes, through the real router. */
function click(attrs) {
  const target = {
    dataset: attrs,
    closest(sel) {
      if (sel === '[data-act]') return attrs.act ? target : null;
      if (sel === '[data-nav]') return attrs.nav ? target : null;
      return null;
    }
  };
  const ev = { target, stopPropagation() {}, preventDefault() {}, button: 0 };
  listeners.click.forEach((fn) => fn(ev));
}

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};

console.log('\ndriving the run-start click through app.js');

S.resetAll();
resolve('#run_budget').value = '45';
const UI = sandbox.UI;
UI.resetRunPicks();
A.Run.DEFAULT_PICKS.forEach((id) => click({ act: 'run-pick', id: id }));   // clear the defaults
['vitamins', 'floss', 'brush_teeth', 'skincare'].forEach((id) => click({ act: 'run-pick', id: id }));
const pickValuesNow = UI.runPicks();
click({ act: 'run-start' });

const run = S.run();
ok('a run was started at all', !!run, run);
if (run) {
  const got = run.habits.map((p) => p.habitId).sort();
  ok('and it contains exactly what was ticked',
     got.join(',') === pickValuesNow.slice().sort().join(','), [got, pickValuesNow]);
  ok('the budget from the select was used', run.minutesBudget === 45, run.minutesBudget);
}

console.log('\nexpanding a long workout through app.js');
{
  const day = A.weekday(S.today());
  S.get().plan[day] = [];
  S.commit({ type: 'fixture' });
  S.get().exercises.slice(0, 8).forEach((e) => S.addToPlan(day, e.id));
  const was = UI.workoutOpen();
  click({ act: 'workout-more' });
  ok('the show-all tap reached the view state', UI.workoutOpen() !== was, UI.workoutOpen());
  click({ act: 'workout-more' });
  ok('and tapping it again folds the list back up', UI.workoutOpen() === was, UI.workoutOpen());

  /* The tick on the folded heading. Folding the section used to take the only
     way of finishing a workout with it, so this is the tap that got it back. */
  const plan = S.dayPlan(S.today());
  click({ act: 'workout-done' });
  const log = S.log(S.today());
  ok('ticking the heading logged the whole workout',
     plan.every((i) => log.ex[i.id]), Object.keys(log.ex).length + ' of ' + plan.length);
  const habitsAfter = Object.keys(log.hb || {}).length;
  ok('and it left the daily habits alone', habitsAfter === 0, habitsAfter);
  click({ act: 'workout-done' });
  ok('tapping it again is the undo',
     plan.every((i) => !S.log(S.today()).ex[i.id]), S.log(S.today()).ex);

  // The exercise library on More folds the same way, through its own handler.
  const lib = UI.libOpen();
  click({ act: 'lib-open' });
  ok('the library fold tap reached the view state', UI.libOpen() !== lib, UI.libOpen());
  click({ act: 'lib-open' });
  ok('and it folds back up', UI.libOpen() === lib, UI.libOpen());
}

console.log('\nmuscle statistics through app.js');
{
  click({ act: 'muscle-window', days: '30' });
  ok('the window tap reached the view state', UI.muscleWindow() === 30, UI.muscleWindow());
  click({ act: 'muscle-window', days: '999' });
  ok('and a window the app does not offer is refused', UI.muscleWindow() === 30, UI.muscleWindow());
  click({ act: 'muscle-window', days: '7' });
  ok('a real one is accepted', UI.muscleWindow() === 7, UI.muscleWindow());

  /* The chips are toggled in the DOM rather than through a re-render, because
     the editor is a form the user is part-way through. The stub's classList is
     a no-op, so this asserts the aria state, which is what the form reads. */
  const chip = { act: 'ex-muscle', muscle: 'legs' };
  const node = {
    dataset: chip, _p: 'false',
    getAttribute: () => node._p,
    setAttribute: (k, v) => { node._p = v; },
    classList: { toggle() {} },
    closest: (sel) => (sel === '[data-act]' ? node : null)
  };
  listeners.click.forEach((fn) => fn({ target: node, stopPropagation() {}, preventDefault() {}, button: 0 }));
  ok('tapping a muscle chip turns it on', node._p === 'true', node._p);
  listeners.click.forEach((fn) => fn({ target: node, stopPropagation() {}, preventDefault() {}, button: 0 }));
  ok('and tapping it again turns it off', node._p === 'false', node._p);
}

/* The picture handlers. The stub has no real file input, so a tap opens a
   picker that never fires — which is the point: it must not throw on the way
   there, and `app.js` is the only file these two live in. */
/* Every data-act the views emit must have a handler. `toggle-ex` and `toggle-hb`
   were deleted by accident along with the onboarding cases that sat above them
   in the same switch, and all three suites stayed green: render.js checks
   markup, smoke.js calls the store directly, and wire.js had no test for those
   two taps. Ticking an exercise or a daily habit — the whole point of the app —
   silently did nothing for a commit, on the screen it is opened for.

   So: the two taps by name, and the general form of the bug underneath them. */
console.log('\nevery tap the views emit is actually handled');
{
  const day = A.weekday(S.today());
  S.get().plan[day] = [];
  delete S.get().logs[S.today()];
  S.commit({ type: 'fixture' });
  S.get().exercises.slice(0, 3).forEach((e) => S.addToPlan(day, e.id));

  const first = S.dayPlan(S.today())[0];
  click({ act: 'toggle-ex', id: first.id });
  ok('tapping an exercise logs it', !!(S.log(S.today()) || { ex: {} }).ex[first.id],
     (S.log(S.today()) || {}).ex);
  click({ act: 'toggle-ex', id: first.id });
  ok('and tapping it again takes it back off', !(S.log(S.today()) || { ex: {} }).ex[first.id]);

  const habit = S.dayHabits(S.today())[0];
  if (habit) {
    click({ act: 'toggle-hb', id: habit.id });
    ok('tapping a daily habit logs it', !!(S.log(S.today()) || { hb: {} }).hb[habit.id],
       (S.log(S.today()) || {}).hb);
    click({ act: 'toggle-hb', id: habit.id });
    ok('and tapping it again takes it back off', !(S.log(S.today()) || { hb: {} }).hb[habit.id]);
  }

  /* Read the emitted names out of ui.js and the handled ones out of app.js
     rather than listing either by hand, so a new control is covered the day it
     is written instead of the day someone remembers to add it here. */
  const uiSrc = fs.readFileSync(path.join(DIR, 'ui.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
  const emitted = Array.from(new Set((uiSrc.match(/data-act="([a-z-]+)"/g) || [])
    .map((m) => m.slice(10, -1))));
  const handled = new Set((appSrc.match(/case '([a-z-]+)'/g) || []).map((m) => m.slice(6, -1)));
  const orphans = emitted.filter((a) => !handled.has(a));
  ok('no control in the views is wired to a handler that does not exist',
     orphans.length === 0, orphans);
}

console.log('\nundo for the actions that destroy something');
{
  const day = A.weekday(S.today());
  S.get().plan[day] = [];
  delete S.get().logs[S.today()];
  S.commit({ type: 'fixture' });
  S.get().exercises.slice(0, 6).forEach((e) => S.addToPlan(day, e.id));
  const plan = S.dayPlan(S.today());

  /* The exact shape of the bug the UI review found: five ticked one at a time,
     then the heading tapped twice. The second tap deletes all six, and without
     an undo the five done by hand are simply gone. */
  plan.slice(0, 5).forEach((i) => click({ act: 'toggle-ex', id: i.id }));
  const byHand = plan.slice(0, 5).filter((i) => S.log(S.today()).ex[i.id]).length;
  ok('five exercises ticked individually', byHand === 5, byHand);

  click({ act: 'workout-done' });                    // completes the sixth too
  ok('the heading tick completes the rest',
     plan.every((i) => S.log(S.today()).ex[i.id]), Object.keys(S.log(S.today()).ex).length);

  click({ act: 'workout-done' });                    // this is what used to erase them
  ok('tapping it again clears the whole day', Object.keys(S.log(S.today()).ex).length === 0);

  /* UNDO restores the state immediately before the LAST tap — all six — rather
     than the five that were ticked by hand. That is what "undo the last action"
     means, and it is the right semantics: the point is that the clear is
     recoverable, not that the app second-guesses which ticks the user valued. */
  click({ act: 'undo-last' });
  const back = plan.filter((i) => S.log(S.today()).ex[i.id]).length;
  ok('UNDO puts the cleared day back', back === 6, back);
  ok('so nothing ticked by hand is lost', back >= 5, back);

  click({ act: 'undo-last' });
  ok('and the undo is one-shot, so a stale toast cannot fire it twice',
     plan.filter((i) => S.log(S.today()).ex[i.id]).length === 6,
     plan.filter((i) => S.log(S.today()).ex[i.id]).length);
}

console.log('\nediting a run in progress through app.js');
{
  S.endRun();
  resolve('#run_budget').value = '90';
  UI.resetRunPicks();
  A.Run.DEFAULT_PICKS.forEach((id) => click({ act: 'run-pick', id: id }));   // clear the defaults
  ['walk', 'stretch', 'vitamins', 'floss'].forEach((id) => click({ act: 'run-pick', id: id }));
  click({ act: 'run-start' });
  const before = S.run().habits.length;

  click({ act: 'run-add-open' });          // opens the sheet; must not throw
  click({ act: 'run-add', id: 'language' });
  ok('the add tap reached the store', S.run().habits.length === before + 1,
     S.run().habits.map((p) => p.habitId));
  ok('and what came back is still feasible', A.Run.validate(S.run()).length === 0,
     A.Run.validate(S.run()).map((v) => v.kind));

  /* A habit the user writes. The stub returns empty inputs, so the save must
     refuse rather than store a nameless habit with NaN numbers. */
  click({ act: 'run-custom-open' });
  const beforeCustom = S.run().habits.length;
  click({ act: 'run-custom-save' });
  ok('an empty custom-habit form is refused', S.run().habits.length === beforeCustom,
     S.run().habits.map((p) => p.habitId));
  /* Cheap on purpose. This run is already near its 90-minute budget, and a
     25-minute habit is genuinely refused for `no_room` — which is the engine
     being right, not the test failing. The claim here is that the handler
     stores a valid definition, so the habit has to be one that fits. */
  const made = S.runAddCustomHabit({ name: 'Sauna', unit: 'min', start: 5, target: 10, step: 1, friction: 2, min: 0.1 });
  ok('and a filled-in one is accepted', !!made && !made.refused, made);
  ok('the run is still feasible with it in', A.Run.validate(S.run()).length === 0,
     A.Run.validate(S.run()).map((v) => v.kind));
  click({ act: 'run-remove', id: made.habitId });
  UI.resolveConfirm(true);
  ok('and a custom habit removes through the same route',
     S.run().habits.every((p) => p.habitId !== made.habitId));

  // Removal is behind a confirm, so the tap alone must not remove anything.
  click({ act: 'run-remove', id: 'language' });
  ok('the tap alone does not remove it', S.run().habits.length === before + 1);
  UI.resolveConfirm(true);
  ok('confirming does', S.run().habits.length === before, S.run().habits.map((p) => p.habitId));
}

console.log('\nexercise picture handlers through app.js');
{
  const ex = S.get().exercises[0];
  let threw = '';
  try {
    click({ act: 'ex-photo-pick', id: ex.id });
    click({ act: 'ex-photo-rm', id: ex.id });
  } catch (err) {
    threw = err.message;
  }
  ok('picking and removing a picture route without throwing', !threw, threw);
  ok('and the picture store is reachable from the app', !!A.Photos, typeof A.Photos);
}

console.log('\nand again with a selection the budget cannot hold');
S.endRun();
resolve('#run_budget').value = '30';
UI.resetRunPicks();
A.Run.DEFAULT_PICKS.forEach((id) => click({ act: 'run-pick', id: id }));
['course', 'write', 'language', 'mobility', 'sunlight'].forEach((id) => click({ act: 'run-pick', id: id }));
click({ act: 'run-start' });
const heavy = S.run();
ok('a run still starts', !!heavy);
ok('and what came back is feasible', heavy && A.Run.validate(heavy).length === 0,
   heavy && A.Run.validate(heavy).map((v) => v.kind));

console.log('\nticking a run habit through the router');
S.endRun();
resolve('#run_budget').value = '90';
UI.resetRunPicks();
A.Run.DEFAULT_PICKS.forEach((id) => click({ act: 'run-pick', id: id }));
['vitamins', 'floss', 'walk'].forEach((id) => click({ act: 'run-pick', id: id }));
click({ act: 'run-start' });
const first = S.run().habits[0].habitId;
click({ act: 'run-tick', id: first });
const rec = S.run().log[S.runToday()];
ok('the tick reached the store', !!rec && rec[first] && rec[first].done === true, rec);


console.log('');
console.log('checklist habits through the router');
S.endRun();
resolve('#run_budget').value = '90';
UI.resetRunPicks();
A.Run.DEFAULT_PICKS.forEach((id) => click({ act: 'run-pick', id: id }));
['vitamins', 'skincare', 'walk'].forEach((id) => click({ act: 'run-pick', id: id }));
click({ act: 'run-start' });
click({ act: 'run-item', id: 'vitamins', item: 'Vitamin D3' });
const vit = S.run().log[S.runToday()].vitamins;
ok('ticking one item reaches the store', vit && vit.did === 1 && vit.done === false, vit);
A.Run.itemsFor(S.run().habits.find((p) => p.habitId === 'vitamins'))
  .forEach((n) => { if (n !== 'Vitamin D3') click({ act: 'run-item', id: 'vitamins', item: n }); });
ok('and ticking the rest marks the habit done',
   S.run().log[S.runToday()].vitamins.done === true, S.run().log[S.runToday()].vitamins);

resolve('#run_items').value = ['Multivitamin', 'Zinc', '', 'Zinc'].join(String.fromCharCode(10));
click({ act: 'run-save-items', id: 'vitamins' });
ok('saving an edited checklist reaches the store, deduped',
   A.Run.itemsFor(S.run().habits.find((p) => p.habitId === 'vitamins')).join(',') === 'Multivitamin,Zinc',
   A.Run.itemsFor(S.run().habits.find((p) => p.habitId === 'vitamins')));


console.log('');
console.log('everything starts on day one, and steps are editable first');
S.endRun();
UI.resetRunPicks();
resolve('#run_budget').value = '90';
A.Run.DEFAULT_PICKS.forEach((id) => click({ act: 'run-pick', id: id }));
['vitamins', 'skincare', 'skincare_pm', 'floss'].forEach((id) => click({ act: 'run-pick', id: id }));

resolve('#run_items').value = ['Multivitamin', 'Vitamin D3', 'Zinc'].join(String.fromCharCode(10));
click({ act: 'run-edit-items', id: 'vitamins' });
click({ act: 'run-save-items', id: 'vitamins' });
ok('a checklist can be edited before the run exists',
   (UI.draftItems().vitamins || []).join(',') === 'Multivitamin,Vitamin D3,Zinc', UI.draftItems().vitamins);

click({ act: 'run-start' });
const started = S.run();
const days = started.habits.map((p) => p.startDay);
ok('every chosen habit starts on day one', days.every((d) => d === 1), days);
ok('and day one actually asks for all of them',
   A.Run.runDay(started, 1).length === started.habits.length,
   [A.Run.runDay(started, 1).length, started.habits.length]);
ok('the run is still feasible', A.Run.validate(started).length === 0,
   A.Run.validate(started).map((v) => v.kind));
ok('the edited checklist came with it',
   A.Run.itemsFor(started.habits.find((p) => p.habitId === 'vitamins')).join(',') === 'Multivitamin,Vitamin D3,Zinc',
   A.Run.itemsFor(started.habits.find((p) => p.habitId === 'vitamins')));

S.endRun();
UI.resetRunPicks();
click({ act: 'run-together' });
['vitamins', 'floss', 'walk'].forEach((id) => click({ act: 'run-pick', id: id }));
click({ act: 'run-start' });
const spread = S.run().habits.map((p) => p.startDay);
ok('turning it off eases them in again instead',
   spread.some((d) => d > 1) && A.Run.validate(S.run()).length === 0, spread);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
