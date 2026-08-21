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

console.log('\nthe seven-day rail moves the view date');
{
  /* The rail replaced the arrow stepper as the way to reach another day, so
     which date a cell opens is now load-bearing. The first version of the
     handler read `date` — the day already on screen — instead of the cell's own
     `data-date`, which makes every cell a no-op that still looks wired. Nothing
     failed: render.js sees the markup, smoke.js never loads app.js, and this
     file had no test for date navigation at all. */
  const UIr = sandbox.UI;
  UIr.setViewDate(S.today());
  const back = A.addDays(S.today(), -3);
  click({ act: 'date-set', date: back });
  ok('tapping a rail cell opens that day', UIr.viewDate() === back, [UIr.viewDate(), back]);
  click({ act: 'date-set', date: S.today() });
  ok('and tapping today comes back to it', UIr.viewDate() === S.today(), UIr.viewDate());
  click({ act: 'date-prev' });
  ok('the stepper still steps a day back', UIr.viewDate() === A.addDays(S.today(), -1), UIr.viewDate());
  click({ act: 'date-today' });
  ok('and back-to-today still lands on the logical day', UIr.viewDate() === S.today(), UIr.viewDate());
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

  /* Made here, not taken from the seed. This used to read `dayHabits()[0]` and
     skip the whole block when it came back empty — so when the seed stopped
     shipping habits, the two assertions this FILE was written for stopped
     running and the suite still said 0 failed. A guarded `if` around a test is a
     test that can disappear without telling anybody.

     `delete logs[today]` first: `dayHabits` returns the day's own frozen list
     once a log exists, and the log was frozen by the exercise taps above, before
     this habit existed. */
  delete S.get().logs[S.today()];
  const habit = S.addHabit('Wire test habit', '🧪');
  S.commit({ type: 'fixture' });
  ok('the habit fixture really is on today', S.dayHabits(S.today()).some((h) => h.id === habit.id),
     S.dayHabits(S.today()).map((h) => h.name));
  click({ act: 'toggle-hb', id: habit.id });
  ok('tapping a daily habit logs it', !!(S.log(S.today()) || { hb: {} }).hb[habit.id],
     (S.log(S.today()) || {}).hb);
  click({ act: 'toggle-hb', id: habit.id });
  ok('and tapping it again takes it back off', !(S.log(S.today()) || { hb: {} }).hb[habit.id]);
  S.removeHabit(habit.id);

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
  /* The UNDO button carries a token so it can only fire the restore it was made
     for. The stub discards appended toasts, so the token is captured here the
     way the real button receives it — through `toastAction`'s action object. */
  let lastAction = null;
  const realToastAction = UI.toastAction;
  UI.toastAction = (msg, action) => { lastAction = action; return realToastAction(msg, action); };

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
  /* A token from a superseded offer must be refused rather than fire the newest
     restore — which is exactly what a stacked toast used to do. */
  click({ act: 'undo-last', id: 'u-stale' });
  ok('a stale UNDO token is refused',
     Object.keys(S.log(S.today()).ex).length === 0, S.log(S.today()).ex);

  click({ act: 'undo-last', id: lastAction.id });
  const back = plan.filter((i) => S.log(S.today()).ex[i.id]).length;
  ok('UNDO puts the cleared day back', back === 6, back);
  ok('so nothing ticked by hand is lost', back >= 5, back);

  /* The one-shot claim needs work done AFTER the undo, or it proves nothing:
     firing the same restore twice lands on the same six ticks either way, which
     is what the first version of this assertion measured. Untick one by hand and
     a second undo would put it back — so if the untick survives, the slot really
     was emptied. */
  const victim = plan[0];
  click({ act: 'toggle-ex', id: victim.id });
  ok('one exercise unticked by hand after the undo',
     !S.log(S.today()).ex[victim.id]);
  click({ act: 'undo-last', id: lastAction.id });
  ok('and the undo is one-shot: the same token does not fire twice',
     !S.log(S.today()).ex[victim.id], S.log(S.today()).ex[victim.id]);
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

console.log('\nbringing a goal into the run, through app.js');
{
  const UIg = sandbox.UI;
  S.resetAll();
  UIg.resetRunPicks();
  resolve('#run_budget').value = '90';

  const readGoal = S.activeGoals().find((g) => g.name === 'Read');
  /* Its own descending goal. The seed is the owner's practice list now and none
     of them count down, so a test that needs one has to make one. */
  const wakeGoal = S.addGoal({ name: 'Up earlier', unit: 'time', direction: 'down', baseline: 450, target: 360, step: 15 });

  /* A goal that counts down cannot exist in a run at all, so the tap must be a
     no-op rather than half-adding something the engine will reject later. */
  click({ act: 'run-goal-add', id: wakeGoal.id });
  ok('a descending goal cannot be added', UIg.draftCustoms().length === 0, UIg.draftCustoms());

  click({ act: 'run-goal-add', id: readGoal.id });
  /* The stub DOM holds the sheet as a STRING — it never parses it into elements,
     so a pre-filled `value=` attribute cannot be read back through `resolve`
     here. That the markup carries the right values is render.js's assertion;
     what this file can see is that the tap opened the right sheet at all. */
  const goalSheet = resolve('#sheetBody').innerHTML;
  ok('an ascending one opens the sheet for that goal', goalSheet.indexOf('value="Read"') > 0,
     goalSheet.slice(0, 120));
  ok('the tap alone adds nothing', UIg.draftCustoms().length === 0);

  // What a real browser would have handed back from the pre-filled form.
  resolve('#rc_name').value = 'Read';
  resolve('#rc_unit').value = 'min';
  resolve('#rc_domain').value = 'self_care';
  resolve('#rc_start').value = '10';
  resolve('#rc_target').value = '45';
  resolve('#rc_step').value = '5';
  resolve('#rc_friction').value = '2';
  resolve('#rc_at_target').value = '45';
  resolve('#rc_from_goal').value = readGoal.id;
  click({ act: 'run-custom-save' });
  ok('saving puts it on the list', UIg.draftCustoms().length === 1, UIg.draftCustoms());
  ok('still tied to the goal it came from', UIg.draftCustoms()[0].fromGoal === readGoal.id);
  ok('and the goal is NOT paused yet — nothing has started',
     !S.goalById(readGoal.id).archived);

  /* The same goal twice would pause it once and ask for it twice. */
  click({ act: 'run-goal-add', id: readGoal.id });
  click({ act: 'run-custom-save' });
  ok('the same goal cannot go on the list twice', UIg.draftCustoms().length === 1,
     UIg.draftCustoms().map((d) => d.name));

  A.Run.DEFAULT_PICKS.forEach((id) => click({ act: 'run-pick', id: id }));
  ['floss', 'brush_teeth', 'vitamins'].forEach((id) => click({ act: 'run-pick', id: id }));
  click({ act: 'run-start' });

  ok('starting the run takes the goal in as a habit',
     S.run().habits.some((p) => p.fromGoal === readGoal.id),
     S.run().habits.map((p) => (p.custom || {}).name || p.habitId));
  ok('and pauses the goal in the same commit', !!S.goalById(readGoal.id).archived);
  ok('so Today asks for it once', (() => {
    const asGoal = S.goalsForDay(S.today()).filter((e) => e.goal.name === 'Read').length;
    const asRun = A.Run.runDay(S.run(), 1).filter((r) => r.name === 'Read').length;
    return asGoal === 0 && asRun === 1;
  })());
  ok('the run is feasible on all 66 days', A.Run.validate(S.run()).length === 0,
     A.Run.validate(S.run()).map((v) => v.kind));
}

console.log('\nwriting your own habit before the run exists, through app.js');
{
  /* The reported gap: the catalog is fourteen and closed, and "write your own"
     lived only inside the mid-run Add sheet — so the screen where you decide
     what your 66 days are could not reach it. `run-custom-save` has to branch on
     whether a run exists, because before it does there is nothing to add it TO. */
  const UIw = sandbox.UI;
  S.resetAll();
  UIw.resetRunPicks();
  resolve('#run_budget').value = '90';

  resolve('#rc_name').value = 'Sauna';
  resolve('#rc_unit').value = 'min';
  resolve('#rc_domain').value = 'self_care';
  resolve('#rc_start').value = '5';
  resolve('#rc_target').value = '20';
  resolve('#rc_step').value = '5';
  resolve('#rc_friction').value = '2';
  click({ act: 'run-custom-save' });

  ok('with no run, it goes on the list rather than into the store',
     UIw.draftCustoms().length === 1 && !S.run(), [UIw.draftCustoms().length, !!S.run()]);
  ok('and it is the habit that was written', UIw.draftCustoms()[0].name === 'Sauna',
     UIw.draftCustoms()[0]);

  /* Taking it back off before starting. */
  const key = UIw.draftCustoms()[0].key;
  click({ act: 'run-custom-rm', key: key });
  ok('it can be taken back off the list', UIw.draftCustoms().length === 0);

  click({ act: 'run-custom-save' });
  A.Run.DEFAULT_PICKS.forEach((id) => click({ act: 'run-pick', id: id }));   // clear the defaults
  ['floss', 'brush_teeth', 'vitamins'].forEach((id) => click({ act: 'run-pick', id: id }));
  click({ act: 'run-start' });

  const started = S.run();
  ok('starting the run takes the written habit with it',
     !!started && started.habits.some((p) => (p.custom || {}).name === 'Sauna'),
     started && started.habits.map((p) => (p.custom || {}).name || p.habitId));
  ok('on day one, which adding it afterwards could never do',
     !!started && (started.habits.find((p) => (p.custom || {}).name === 'Sauna') || {}).startDay === 1,
     started && (started.habits.find((p) => (p.custom || {}).name === 'Sauna') || {}).startDay);
  ok('and the run it built is feasible on all 66 days',
     A.Run.validate(started).length === 0, A.Run.validate(started).map((v) => v.kind));
  ok('the list is cleared once the run has them', UIw.draftCustoms().length === 0);
}

console.log('\none-tap minute values, through app.js');
{
  S.resetAll();
  const g = S.addGoal({ name: 'Quick log', unit: 'minutes', direction: 'up', baseline: 20, target: 20, step: 5 });
  const k = S.today();
  resolve('#g_val').value = '';
  click({ act: 'goal-quick', v: '15' });
  ok('a chip fills the box', resolve('#g_val').value === '15', resolve('#g_val').value);
  /* A chip that logged straight away would turn a mis-tap into a record. */
  ok('and logs nothing on its own', S.goalEntry(k, g.id) == null, S.goalEntry(k, g.id));

  click({ act: 'goal-save-val', id: g.id, date: k });
  ok('saving is what records it', (S.goalEntry(k, g.id) || {}).value === 15, S.goalEntry(k, g.id));
  ok('and 15 against an ask of 20 is honestly short', S.goalDone(k, g.id) === false);

  resolve('#g_val').value = '';
  click({ act: 'goal-quick', v: '20' });
  click({ act: 'goal-save-val', id: g.id, date: k });
  ok('a fuller day meets it', S.goalDone(k, g.id) === true, S.goalEntry(k, g.id));
  S.removeGoal(g.id);
}

console.log('\nthe bad-day floor and the +10% line, through app.js');
{
  S.resetAll();
  const g = S.addGoal({ name: 'Floor wire', unit: 'minutes', direction: 'up', baseline: 10, target: 60, step: 10, floor: 5 });
  const k = S.today();

  click({ act: 'goal-floor', id: g.id, date: k });
  ok('the minimum logs as the real number', (S.goalEntry(k, g.id) || {}).value === 5,
     S.goalEntry(k, g.id));
  ok('and buys nothing — the goal is still short', S.goalDone(k, g.id) === false);

  /* A goal with no floor must not be loggable through this route at all, or the
     button becomes a way to enter a number nobody chose. */
  const plain = S.addGoal({ name: 'No floor wire', unit: 'minutes', direction: 'up', baseline: 10, target: 60, step: 10 });
  click({ act: 'goal-floor', id: plain.id, date: k });
  ok('a goal without a floor cannot be floored', S.goalEntry(k, plain.id) == null,
     S.goalEntry(k, plain.id));

  /* Logging short still goes through the ordinary path, and must not throw on
     the way to naming the +10% number. */
  resolve('#g_val').value = '20';
  let threw = '';
  try { click({ act: 'goal-save-val', id: g.id, date: k }); } catch (e) { threw = e.message; }
  ok('logging short does not throw while working out ten percent more', !threw, threw);
  ok('and the short value is what was stored', (S.goalEntry(k, g.id) || {}).value === 20,
     S.goalEntry(k, g.id));

  S.removeGoal(g.id);
  S.removeGoal(plain.id);
}

console.log('\nlines worth keeping, through app.js');
{
  S.resetAll();
  const before = S.lines().length;
  click({ act: 'lines-open' });
  ok('the sheet opens', resolve('#sheetBody').innerHTML.indexOf('data-act="line-add"') > 0);

  resolve('#ln_text').value = '   ';
  click({ act: 'line-add' });
  ok('a blank line keeps nothing', S.lines().length === before, S.lines().length);

  resolve('#ln_text').value = 'Systems outlast motivation.';
  resolve('#ln_src').value = 'my own';
  click({ act: 'line-add' });
  ok('a real one is kept', S.lines().length === before + 1 && S.lines()[0].text.indexOf('Systems') === 0,
     S.lines()[0]);

  const id = S.lines()[0].id;
  click({ act: 'line-rm', id: id });
  ok('and can be removed again', !S.lines().some((l) => l.id === id));
}

console.log('\nthe cookie jar, through app.js');
{
  S.resetAll();
  click({ act: 'cookie-jar' });
  ok('the jar opens', resolve('#sheetBody').innerHTML.indexOf('data-act="cookie-add"') > 0);

  resolve('#ck_text').value = '   ';
  click({ act: 'cookie-add' });
  ok('an empty entry is refused rather than stored', S.cookies().length === 0, S.cookies());

  resolve('#ck_text').value = 'Ran the whole rotation on four hours a night and still trained.';
  click({ act: 'cookie-add' });
  ok('a real one goes in', S.cookies().length === 1, S.cookies().map((c) => c.text));
  ok('in the user own words, unchanged',
     S.cookies()[0].text.indexOf('four hours a night') > 0, S.cookies()[0].text);

  const id = S.cookies()[0].id;
  click({ act: 'cookie-rm', id: id });
  ok('and can be taken back out', S.cookies().length === 0);
  S.restoreCookie({ id: id, text: 'x', at: S.today() }, 0);
  ok('the undo path puts one back', S.cookies().length === 1);
}

console.log('\nstripping back to only the practices, through app.js');
{
  S.resetAll();
  const extra = S.addGoal({ name: 'Something else', unit: 'minutes', direction: 'up', baseline: 5, target: 30, step: 5 });
  S.addHabit('Old habit', '🧪');

  click({ act: 'practices-install' });
  ok('the tap alone changes nothing',
     !S.goalById(extra.id).archived && S.get().habits.length === 1,
     [S.goalById(extra.id).archived, S.get().habits.length]);

  UI.resolveConfirm(true);
  ok('confirming pauses what is not a practice', S.goalById(extra.id).archived === true);
  ok('and it is paused, not deleted — the goal still exists', !!S.goalById(extra.id));
  ok('the habits are cleared', S.get().habits.length === 0, S.get().habits.map((h) => h.name));
  ok('and the live goals are exactly the practices',
     S.activeGoals().length === A.SEED_GOALS.length, S.activeGoals().map((g) => g.name));
}

console.log('\nsetting up a practice from a template, through app.js');
{
  S.resetAll();
  const before = S.goals().length;
  const t = A.GOAL_TEMPLATES[0];

  click({ act: 'goal-templates' });
  ok('the sheet lists the templates',
     resolve('#sheetBody').innerHTML.indexOf('data-act="goal-template"') > 0);

  click({ act: 'goal-template', key: t.key });
  ok('picking one creates nothing on its own', S.goals().length === before, S.goals().length);
  ok('it opens the goal form instead',
     resolve('#sheetBody').innerHTML.indexOf('data-act="goal-save"') > 0);

  /* The form, filled the way a person would after correcting the placeholders to
     where they actually are. */
  resolve('#gg_name').value = t.name;
  resolve('#gg_icon').value = t.icon;
  resolve('#gg_unit').value = t.unit;
  resolve('#gg_base').value = '5';
  resolve('#gg_target').value = '40';
  resolve('#gg_step').value = '5';
  resolve('#gg_sched').value = 'daily';
  click({ act: 'goal-save', id: '' });

  const made = S.goals().find((g) => g.name === t.name);
  ok('saving is what creates it', !!made, S.goals().map((g) => g.name));
  ok('with the numbers the user typed, not the template placeholders',
     !!made && made.baseline === 5 && made.target === 40, made && [made.baseline, made.target]);
  ok('an unknown template key does nothing', (() => {
    const n = S.goals().length;
    click({ act: 'goal-template', key: 'nope' });
    return S.goals().length === n;
  })());
}

console.log('\na daily habit becomes a goal, through app.js');
{
  /* The route the user actually takes: tap the control on More, fill the form,
     save. Two things this drives that smoke.js cannot — the editor opening
     pre-filled and carrying the habit id, and `goal-save` branching on it.
     Without the id reaching the button, saving would create the goal and leave
     the habit behind, and Today would ask for the same thing twice. */
  const UIh = sandbox.UI;
  S.resetAll();
  S.get().habits = [];
  S.commit({ type: 'fixture' });
  const hb = S.addHabit('Cold shower', '🚿');
  const goalsBefore = S.activeGoals().length;

  click({ act: 'habit-to-goal', id: hb.id });
  ok('the tap alone converts nothing',
     S.get().habits.some((h) => h.id === hb.id) && S.activeGoals().length === goalsBefore);

  const sheet = resolve('#sheetBody').innerHTML;
  ok('it opens the goal editor pre-filled with the habit', sheet.indexOf('Cold shower') > 0);
  ok('and the save button carries the habit id', sheet.indexOf('data-habit="' + hb.id + '"') > 0,
     (sheet.match(/data-habit="[^"]*"/) || [])[0]);

  /* The form the sheet just rendered, filled the way a person would. */
  resolve('#gg_name').value = 'Cold shower';
  resolve('#gg_icon').value = '🚿';
  resolve('#gg_unit').value = 'seconds';
  resolve('#gg_base').value = '15';
  resolve('#gg_target').value = '120';
  resolve('#gg_step').value = '15';
  resolve('#gg_sched').value = 'daily';
  click({ act: 'goal-save', id: '', habit: hb.id });

  const made = S.activeGoals().find((g) => g.name === 'Cold shower');
  ok('saving creates the goal', !!made, S.activeGoals().map((g) => g.name));
  ok('and takes the habit off the list', !S.get().habits.some((h) => h.id === hb.id),
     S.get().habits.map((h) => h.name));
  ok('so today asks for it exactly once', (() => {
    const k = S.today();
    const asHabit = S.dayHabits(k).filter((h) => h.name === 'Cold shower').length;
    const asGoal = S.goalsForDay(k).filter((e) => e.goal.name === 'Cold shower').length;
    return asHabit === 0 && asGoal === 1;
  })());

  /* Deleting a habit is undoable everywhere else in this app, and a conversion
     deletes one. */
  if (made) {
    S.restoreHabitFromGoal({ id: hb.id, name: 'Cold shower', icon: '🚿' }, 0, made.id);
    ok('and it is undoable', S.get().habits.some((h) => h.id === hb.id) &&
       !S.goals().some((g) => g.id === made.id), S.get().habits.map((h) => h.name));
  }
}

console.log('\ninstalling the built-in programme through app.js');
{
  /* The only route by which a NEW programme reaches an account that already
     installed the old one — `installProgram` is guarded to run once per account,
     so without this tap, editing js/program.js changes nothing for anybody who
     has already opened the app. It is behind a confirm because it replaces the
     weekly plan. */
  S.resetAll();
  const day = A.weekday(S.today());
  S.clearDayPlan(1);
  S.clearDayPlan(2);
  ok('the fixture really has an emptied plan', S.get().plan[1].length === 0);

  click({ act: 'program-install' });
  ok('the tap alone installs nothing', S.get().plan[1].length === 0, S.get().plan[1].length);

  UI.resolveConfirm(true);
  ok('confirming rebuilds the week', S.get().plan[1].length > 0 && S.get().plan[2].length > 0,
     [S.get().plan[1].length, S.get().plan[2].length]);

  /* Two contexts now, and the row carries which one. A handler that ignored
     data-context would install the same week from either row and nothing would
     look wrong until you were on site with a barbell programme. */
  click({ act: 'program-install', context: 'home' });
  UI.resolveConfirm(true);
  ok('the home row installs the home week', S.programContext() === 'home' &&
     S.get().plan[1].some((i) => S.exerciseById(i.exerciseId).name === 'Barbell Bench Press'),
     S.get().plan[1].map((i) => S.exerciseById(i.exerciseId).name));
  click({ act: 'program-install', context: 'site' });
  UI.resolveConfirm(true);
  ok('and the site row installs the site week', S.programContext() === 'site' &&
     S.get().plan[1].some((i) => S.exerciseById(i.exerciseId).name === 'Dumbbell Floor Press'),
     S.programContext());
  ok('and every day of it, rest days included',
     [0, 1, 2, 3, 4, 5, 6].every((d) => S.get().plan[d].length > 0),
     [0, 1, 2, 3, 4, 5, 6].map((d) => S.get().plan[d].length).join(' '));

  /* The half of the promise the confirm sheet makes that is easiest to break:
     a day already logged keeps what it froze. */
  const k = S.today();
  S.ensureLog(k);
  const frozen = JSON.stringify(S.log(k).ex);
  const planned = S.dayPlan(k).length;
  click({ act: 'program-install' });
  UI.resolveConfirm(true);
  ok('a day already logged keeps the exercises it froze',
     JSON.stringify(S.log(k).ex) === frozen && S.dayPlan(k).length === planned,
     [planned, S.dayPlan(k).length]);
  void day;
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
  /* `!!A.Photos` could not fail — photos.js is in the load list above, so a
     missing global would have thrown before any test ran. Assert the thing that
     can actually be wrong: the app degrades rather than throwing on a device
     with no IndexedDB, which is exactly what this sandbox is. */
  ok('the picture store degrades instead of throwing without IndexedDB',
     A.Photos.supported() === false && A.Photos.get('nothing') === null,
     [A.Photos.supported(), A.Photos.get('nothing')]);
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
