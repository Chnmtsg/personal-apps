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
  querySelectorAll: () => []
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
for (const f of ['data.js', 'program.js', 'photos.js', 'store.js', 'ui.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
}

const S = sandbox.Store;
const A = sandbox.Arise;
const UI = sandbox.UI;

/** Type into one of the set-log fields the way a thumb does. */
function type(id, value) {
  resolve('#' + id).value = String(value);
}

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

S.resetAll();

console.log('\nthe seven-day rail moves the view date');
{
  /* The rail replaced the arrow stepper as the way to reach another day, so
     which date a cell opens is now load-bearing. The first version of the
     handler read `date` — the day already on screen — instead of the cell's own
     `data-date`, which makes every cell a no-op that still looks wired. Nothing
     failed: render.js sees the markup, smoke.js never loads app.js, and this
     file had no test for date navigation at all. */
  const UIr = UI;
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

console.log('\nmarking a whole session through app.js');
{
  const day = A.weekday(S.today());
  S.get().plan[day] = [];
  delete S.get().logs[S.today()];
  S.commit({ type: 'fixture' });
  S.get().exercises.slice(0, 8).forEach((e) => S.addToPlan(day, e.id));

  const plan = S.dayPlan(S.today());
  click({ act: 'workout-done' });
  const log = S.log(S.today());
  ok('the session control logged every exercise',
     plan.every((i) => log.ex[i.id]), Object.keys(log.ex).length + ' of ' + plan.length);
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

console.log('\nlogging a set through the router');
{
  /* The whole point of this file, for the feature this app is now built on.
     smoke.js proves the store stores it and render.js proves the row draws it;
     only this one proves that typing 60 and 8 and pressing Log set arrives. */
  S.resetAll();
  const day = A.weekday(S.today());
  S.get().plan[day] = [];
  delete S.get().logs[S.today()];
  S.commit({ type: 'fixture' });
  const bench = S.addExercise({ name: 'Bench press', category: 'Strength', unit: 'reps', sets: 3, reps: 8 });
  S.addToPlan(day, bench.id, { sets: 3, reps: 8 });
  const item = S.dayPlan(S.today())[0];

  type('w_' + item.id, '60');
  type('r_' + item.id, '8');
  click({ act: 'log-set', id: item.id });
  let sets = ((S.log(S.today()) || { perf: {} }).perf[item.id] || {}).sets || [];
  ok('the typed set reached the store', sets.length === 1, sets);
  ok('with the weight that was typed', sets[0] && sets[0].w === 60, sets[0]);
  ok('and the reps', sets[0] && sets[0].r === 8, sets[0]);

  /* Reps are the one field that cannot be guessed. A set with none is not a
     set, and storing it would put a row on the screen that means nothing. */
  type('r_' + item.id, '0');
  click({ act: 'log-set', id: item.id });
  sets = S.log(S.today()).perf[item.id].sets;
  ok('a set with no reps is refused rather than stored', sets.length === 1, sets);

  /* A blank weight is a bodyweight set, which is a real answer. */
  type('w_' + item.id, '');
  type('r_' + item.id, '10');
  click({ act: 'log-set', id: item.id });
  sets = S.log(S.today()).perf[item.id].sets;
  ok('a blank weight logs a bodyweight set', sets.length === 2 && sets[1].w === null, sets[1]);

  // Correcting one: tap the row, retype, commit — and it replaces, never appends.
  click({ act: 'set-edit', id: item.id, index: '0' });
  ok('tapping a set puts the router into correction mode',
     UI.editSet() && UI.editSet().index === 0, UI.editSet());
  type('w_' + item.id, '62.5');
  type('r_' + item.id, '6');
  click({ act: 'log-set', id: item.id });
  sets = S.log(S.today()).perf[item.id].sets;
  ok('the correction replaced the set rather than adding one', sets.length === 2, sets);
  ok('and it carries the new numbers', sets[0].w === 62.5 && sets[0].r === 6, sets[0]);
  ok('and correction mode is left behind', UI.editSet() === null, UI.editSet());

  click({ act: 'set-edit', id: item.id, index: '1' });
  click({ act: 'set-cancel' });
  ok('cancelling a correction leaves the record alone',
     UI.editSet() === null && S.log(S.today()).perf[item.id].sets.length === 2);

  // Removing one, and the undo that has to come with it.
  let lastAction = null;
  const realToastAction = UI.toastAction;
  UI.toastAction = (msg, action) => { lastAction = action; return realToastAction(msg, action); };
  click({ act: 'set-rm', id: item.id, index: '0' });
  ok('removing a set takes it out', S.log(S.today()).perf[item.id].sets.length === 1);
  ok('and offers an undo', lastAction && lastAction.act === 'undo-last', lastAction);
  click({ act: 'undo-last', id: lastAction.id });
  sets = S.log(S.today()).perf[item.id].sets;
  ok('which puts the same set back in the same place',
     sets.length === 2 && sets[0].w === 62.5, sets);
  UI.toastAction = realToastAction;

  /* Logging the last prescribed set ticks the exercise off. Three were asked
     for; two are logged, so one more finishes it. */
  type('w_' + item.id, '62.5');
  type('r_' + item.id, '6');
  click({ act: 'log-set', id: item.id });
  ok('filling the last prescribed set completes the exercise',
     S.dayStatus(S.today()).exDone === 1, S.dayStatus(S.today()));
}

console.log('\nminutes and kilometres through the router');
{
  const day = A.weekday(S.today());
  const jog = S.addExercise({ name: 'Easy run', category: 'Cardio', unit: 'distance', km: 5 });
  S.get().plan[day] = [];
  delete S.get().logs[S.today()];
  S.commit({ type: 'fixture' });
  S.addToPlan(day, jog.id);
  const item = S.dayPlan(S.today())[0];

  type('km_' + item.id, '5.2');
  type('min_' + item.id, '28');
  click({ act: 'save-amount', id: item.id });
  const perf = (S.log(S.today()) || { perf: {} }).perf[item.id] || {};
  ok('the distance reached the store', perf.km === 5.2, perf);
  ok('and the time with it', perf.min === 28, perf);
  ok('and reaching what was asked completed it', S.dayStatus(S.today()).exDone === 1, S.dayStatus(S.today()));

  type('km_' + item.id, '');
  type('min_' + item.id, '');
  click({ act: 'save-amount', id: item.id });
  ok('clearing both drops the entry rather than storing zeroes',
     !S.log(S.today()).perf[item.id], S.log(S.today()).perf[item.id]);
  ok('and the tick it earned is not taken back', S.dayStatus(S.today()).exDone === 1, S.dayStatus(S.today()));
}

console.log('\nclearing a day takes the sets with the ticks');
{
  const day = A.weekday(S.today());
  const lift = S.addExercise({ name: 'Row', category: 'Strength', unit: 'reps', sets: 3, reps: 8 });
  S.get().plan[day] = [];
  delete S.get().logs[S.today()];
  S.commit({ type: 'fixture' });
  S.addToPlan(day, lift.id);
  const item = S.dayPlan(S.today())[0];
  S.addSet(S.today(), item.id, 50, 8);
  click({ act: 'toggle-ex', id: item.id });

  let lastAction = null;
  const realToastAction = UI.toastAction;
  UI.toastAction = (msg, action) => { lastAction = action; return realToastAction(msg, action); };
  click({ act: 'clear-day' });
  ok('the tap alone clears nothing — it is behind a confirm',
     (S.log(S.today()).perf[item.id] || {}).sets, S.log(S.today()).perf);
  UI.resolveConfirm(true);
  ok('confirming clears the ticks', Object.keys(S.log(S.today()).ex).length === 0);
  ok('and the sets, which would otherwise say a day was lifted and not done',
     Object.keys(S.log(S.today()).perf).length === 0, S.log(S.today()).perf);
  click({ act: 'undo-last', id: lastAction.id });
  ok('and the undo brings both halves back',
     !!S.log(S.today()).ex[item.id] && S.log(S.today()).perf[item.id].sets.length === 1,
     [S.log(S.today()).ex, S.log(S.today()).perf]);
  UI.toastAction = realToastAction;
}

console.log('\nthe rest timer, through the router');
{
  S.resetAll();
  const day = A.weekday(S.today());
  S.get().plan[day] = [];
  delete S.get().logs[S.today()];
  S.commit({ type: 'fixture' });
  const ex = S.addExercise({ name: 'Bench press', category: 'Strength', unit: 'reps', sets: 3, reps: 8 });
  const bare = S.addExercise({ name: 'Unprescribed', category: 'Strength', unit: 'reps', sets: 3, reps: 8 });
  S.addToPlan(day, ex.id, { note: '2 RIR \u00b7 rest 90 s' });
  S.addToPlan(day, bare.id, {});
  const item = S.dayPlan(S.today())[0];
  const bareItem = S.dayPlan(S.today())[1];

  UI.stopRest();
  type('w_' + item.id, '60');
  type('r_' + item.id, '8');

  /* What the LAST paint of the tap actually contained. The rest used to be
     started after the store write, and the write is what repaints — so the
     block existed in view state and was not on screen until something
     unrelated happened to render. Both stub suites were happy; a real browser
     was not. Asserting `UI.rest()` alone cannot see this, which is why this
     watches the paint instead. */
  let lastPaint = '';
  const realRender = UI.render;
  UI.render = () => { realRender(); lastPaint = resolve('#view').innerHTML; };
  click({ act: 'log-set', id: item.id });
  UI.render = realRender;
  ok('the rest is on screen by the end of the tap, not one repaint later',
     lastPaint.indexOf('today-strip is-rest') > 0, lastPaint.slice(-160));

  const r = UI.rest();
  ok('logging a set starts the rest, without a button to press', !!r, r);
  ok('and it takes the interval off that exercise plan note', r && r.seconds === 90, r && r.seconds);
  ok('and names the lift it belongs to', r && r.name === 'Bench press', r && r.name);

  click({ act: 'rest-skip' });
  ok('skipping ends it', !UI.rest(), UI.rest());

  type('w_' + bareItem.id, '20');
  type('r_' + bareItem.id, '10');
  click({ act: 'log-set', id: bareItem.id });
  ok('an exercise with no prescribed rest counts up instead of inventing one',
     UI.rest() && UI.rest().seconds === null, UI.rest());
  click({ act: 'rest-skip' });

  /* The switch is the user's, and off has to mean off — not "starts and hides". */
  S.updateSettings({ restTimer: false });
  type('w_' + item.id, '60');
  type('r_' + item.id, '8');
  click({ act: 'log-set', id: item.id });
  ok('with the timer switched off, logging a set starts nothing', !UI.rest(), UI.rest());
  S.updateSettings({ restTimer: true });

  /* A set that is refused must not start a rest for work that did not happen. */
  type('r_' + item.id, '0');
  click({ act: 'log-set', id: item.id });
  ok('a refused set starts no rest', !UI.rest(), UI.rest());
}

console.log('\nthe tape and the scale, through the router');
{
  S.resetAll();
  const day = S.today();

  const dayBefore = JSON.stringify(S.dayStatus(day));
  click({ act: 'weigh-in' });
  type('bw_kg', '59.4');
  click({ act: 'weigh-save', date: day });
  ok('a weigh-in reaches the store', (S.bodyEntry(day) || {}).kg === 59.4, S.bodyEntry(day));
  ok('and carries the display unit it was typed in', S.bodyEntry(day).u === 'kg');

  /* It is a record, not a task: this is the assertion that would fail the day
     somebody wires body data into the streak. */
  ok('and it changes nothing about the day at all',
     JSON.stringify(S.dayStatus(day)) === dayBefore,
     dayBefore + ' -> ' + JSON.stringify(S.dayStatus(day)));

  type('bw_kg', '');
  click({ act: 'weigh-save', date: day });
  ok('a blank weight is refused rather than stored as zero', S.bodyEntry(day).kg === 59.4, S.bodyEntry(day));

  type('bw_kg', 'heavy');
  click({ act: 'weigh-save', date: day });
  ok('and so is a word', S.bodyEntry(day).kg === 59.4, S.bodyEntry(day));

  // The tape, saved through the same router.
  click({ act: 'tape-open' });
  type('bm_chest', '92');
  type('bm_waist', '75');
  type('bm_arm_l', '30');
  type('bm_arm_r', '31');
  let lastAction = null;
  const realToastAction = UI.toastAction;
  UI.toastAction = (msg, action) => { lastAction = action; return realToastAction(msg, action); };
  click({ act: 'tape-save', date: day });
  ok('the filled fields reach the store',
     S.bodyEntry(day).chest === 92 && S.bodyEntry(day).arm_r === 31, S.bodyEntry(day));
  ok('and the weigh-in from earlier is still there', S.bodyEntry(day).kg === 59.4, S.bodyEntry(day));
  ok('the fields left blank recorded nothing',
     S.bodyEntry(day).neck === undefined && S.bodyEntry(day).calf_l === undefined, S.bodyEntry(day));
  ok('and it offers an undo', lastAction && lastAction.act === 'undo-last', lastAction);
  click({ act: 'undo-last', id: lastAction.id });
  ok('which puts the record back as it was',
     S.bodyEntry(day).chest === undefined && S.bodyEntry(day).kg === 59.4, S.bodyEntry(day));
  UI.toastAction = realToastAction;

  /* Saving an empty tape must not create an entry, or every stray tap would
     leave a measuring session on the record. */
  S.resetAll();
  click({ act: 'tape-open' });
  A.BODY_KEYS.forEach((k) => type('bm_' + k, ''));
  click({ act: 'tape-save', date: S.today() });
  ok('an empty tape records nothing at all', S.bodyDays().length === 0, S.bodyDays());
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
