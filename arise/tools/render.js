/* Headless render check: runs every view and every sheet against a stub DOM.
   It won't tell you the app looks good — it tells you nothing throws and no
   template silently renders "undefined". Run: node tools/render.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'js');
const mem = new Map();

/* ---------- the smallest DOM that ui.js will accept ---------- */

const nodes = new Map();
function makeEl(id) {
  const el = {
    id: id || '',
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    hidden: false,
    dataset: {},
    style: {},
    files: [],
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    appendChild() {},
    remove() {},
    click() {},
    focus() {},
    blur() {},
    setSelectionRange() {},
    scrollIntoView() {},
    addEventListener() {},
    getContext: () => ({ clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillRect() {}, scale() {} }),
    contains: () => false,
    closest: () => null,
    querySelector: (s) => resolve(s),
    querySelectorAll: () => []
  };
  return el;
}
function resolve(sel) {
  const key = String(sel);
  if (!nodes.has(key)) nodes.set(key, makeEl(key.replace('#', '')));
  return nodes.get(key);
}

const document = {
  querySelector: resolve,
  querySelectorAll: () => [],
  getElementById: (id) => resolve('#' + id),
  createElement: () => makeEl(),
  addEventListener() {},
  body: makeEl('body'),
  documentElement: { style: {} },
  title: ''
};

const sandbox = {
  console,
  document,
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
  },
  setTimeout,
  clearTimeout,
  setInterval: () => 0,
  requestAnimationFrame: () => 0,
  location: { hash: '', protocol: 'http:' },
  history: { replaceState() {} },
  matchMedia: () => ({ matches: false }),
  scrollTo() {},
  innerWidth: 412,
  innerHeight: 900,
  devicePixelRatio: 1,
  Notification: undefined,
  addEventListener() {},
  navigator: {},
  Blob: function () {},
  URL: { createObjectURL: () => '', revokeObjectURL() {} },
  FileReader: function () {},
  alert() {},
  confirm: () => true,
  prompt: () => null
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['data.js', 'program.js', 'goals.js', 'run.js', 'photos.js', 'store.js', 'ui.js']) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
}

const A = sandbox.Arise;
const S = sandbox.Store;
const UI = sandbox.UI;

let pass = 0;
let fail = 0;
function check(name, fn) {
  let html = '';
  try {
    html = fn() || '';
  } catch (err) {
    fail++;
    console.log('  FAIL ' + name + '  → ' + err.message);
    return;
  }
  const bad = /undefined|NaN|\[object Object\]|null<\/|>null</.exec(html);
  if (bad) {
    fail++;
    console.log('  FAIL ' + name + '  → rendered "' + bad[0] + '" near: ' + html.slice(Math.max(0, bad.index - 60), bad.index + 40).replace(/\s+/g, ' '));
    return;
  }
  if (html.length < 40) {
    fail++;
    console.log('  FAIL ' + name + '  → suspiciously empty (' + html.length + ' chars)');
    return;
  }
  pass++;
  console.log('  ok   ' + name + '  (' + html.length + ' chars)');
}

const view = resolve('#view');
const sheetBody = resolve('#sheetBody');
const ROUTES = ['today', 'plan', 'read', 'progress', 'rewards', 'more', 'run'];

function renderRoute(r) {
  view.innerHTML = '';
  UI.go(r);
  return view.innerHTML;
}

/* A screen with a tab is two screens. Plan's second half — the seven training
   days — is behind a segment now, so the route sweep alone would render the
   goals side twice and never the other one, and half of Plan would leave the
   suite with no cover at all. Every variant sweeps with the routes. */
function checkVariants() {
  UI.setPlanTab('week');
  check('plan (training week)', () => renderRoute('plan'));
  UI.setPlanTab('goals');
}

/* ---------- 1. empty state ---------- */
S.load();
console.log('\nfresh install');
ROUTES.forEach((r) => check(r, () => renderRoute(r)));
checkVariants();

/* ---------- 2. a lived-in account ---------- */
console.log('\npopulated account');
const t = S.today();
const ex0 = S.get().exercises[0].id;
for (let d = 0; d <= 6; d++) if (!S.get().plan[d].length) S.addToPlan(d, ex0);
/* Straight onto the object, not through `updateGoal` — that refuses to move a
   `startDate` so the app cannot drop lived days out of a goal. Here nothing has
   been logged yet, so this is a fixture rather than an edit. */
S.get().goals.forEach((g) => { g.startDate = A.addDays(t, -30); });
S.commit({ type: 'fixture' });

for (let i = 30; i >= 0; i--) {
  const k = A.addDays(t, -i);
  if (i % 11 === 0 && i !== 0) continue; // leave gaps so "missed" renders
  S.ensureLog(k);
  S.completeAll(k);
  S.dayHabits(k).forEach((h) => S.toggleHabit(k, h.id));
  S.goalsForDay(k).forEach((e) => {
    if (e.goal.gate === 'summary') S.setReading(k, { book: 'Deep Work', minutes: 30, summary: 'What I took from today: attention is trainable.' });
    else S.hitGoalTarget(k, e.goal.id);
  });
  S.setJournal(k, { text: 'Felt good.', mood: 3 });
}
S.claimReward('m3');
ROUTES.forEach((r) => check(r, () => renderRoute(r)));
checkVariants();

console.log('\npast + future days');
UI.setViewDate(A.addDays(t, -3));
check('today (backfill view)', () => renderRoute('today'));
UI.setViewDate(A.addDays(t, 1));
check('today (future, read-only)', () => renderRoute('today'));
UI.setViewDate(t);

console.log('\nsheets');
const g0 = S.activeGoals()[0];
const readGoal = S.activeGoals().find((x) => x.gate === 'summary');
const sheet = (name, fn) =>
  check(name, () => {
    sheetBody.innerHTML = '';
    fn();
    return sheetBody.innerHTML;
  });

sheet('goal editor (new)', () => UI.openGoalEditor(null));
sheet('goal editor (existing)', () => UI.openGoalEditor(g0.id));
sheet('goal detail', () => UI.openGoalDetail(g0.id));
sheet('goal re-baseline', () => UI.openGoalRestart(g0.id));
sheet('goal value log', () => UI.openGoalLog(g0.id, t));
sheet('reading', () => UI.openReading(t));
sheet('exercise picker', () => UI.openPicker(1));
sheet('plan item editor', () => UI.openPlanEditor(1, S.get().plan[1][0].id));
sheet('exercise editor', () => UI.openExerciseEditor(null));
sheet('copy day', () => UI.openCopyDay(2));

sheet('exercise how-to', () => {
  const item = S.dayPlan(t)[0] || S.get().plan[1][0];
  UI.openExerciseHow(item.exerciseId, item);
});
sheet('exercise how-to (no notes)', () => {
  const bare = S.addExercise({ name: 'Undocumented lift', category: 'Other', unit: 'reps', sets: 3, reps: 10 });
  UI.openExerciseHow(bare.id, null);
  S.removeExercise(bare.id);
});
sheet('confirm', () => UI.openConfirm({ title: 'Delete goal?', body: 'Its logged history goes with it.', confirmLabel: 'Delete goal', danger: true }));
sheet('text prompt', () => UI.openTextPrompt({ title: 'New daily habit', label: 'Habit', placeholder: 'e.g. Meditate 10 min', confirmLabel: 'Add habit' }));

/* ---------- confirm / prompt callbacks ---------- */
console.log('\nconfirm & prompt sheets resolve correctly');
function behaves(name, fn) {
  try {
    const why = fn();
    if (why) { fail++; console.log('  FAIL ' + name + '  → ' + why); return; }
  } catch (err) { fail++; console.log('  FAIL ' + name + '  → ' + err.message); return; }
  pass++;
  console.log('  ok   ' + name);
}

behaves('confirming runs onConfirm, not onCancel', () => {
  let yes = 0, no = 0;
  UI.openConfirm({ title: 'T', body: 'B', onConfirm: () => yes++, onCancel: () => no++ });
  UI.resolveConfirm(true);
  return yes === 1 && no === 0 ? '' : `onConfirm=${yes} onCancel=${no}`;
});
behaves('cancelling runs onCancel, not onConfirm', () => {
  let yes = 0, no = 0;
  UI.openConfirm({ title: 'T', body: 'B', onConfirm: () => yes++, onCancel: () => no++ });
  UI.resolveConfirm(false);
  return no === 1 && yes === 0 ? '' : `onConfirm=${yes} onCancel=${no}`;
});
behaves('a dismissed confirm cannot fire later', () => {
  let yes = 0;
  UI.openConfirm({ title: 'T', body: 'B', onConfirm: () => yes++ });
  UI.closeSheet(); // Escape / X / backdrop
  UI.resolveConfirm(true); // a stale click must do nothing
  return yes === 0 ? '' : 'stale callback fired';
});
behaves('resolving twice only fires once', () => {
  let yes = 0;
  UI.openConfirm({ title: 'T', body: 'B', onConfirm: () => yes++ });
  UI.resolveConfirm(true);
  UI.resolveConfirm(true);
  return yes === 1 ? '' : `fired ${yes} times`;
});
behaves('an empty text prompt is refused and keeps its sheet', () => {
  let saved = null;
  UI.openTextPrompt({ title: 'T', onSave: (v) => (saved = v) });
  resolve('#tp_value').value = '   ';
  const ok = UI.resolveTextPrompt();
  return ok === false && saved === null ? '' : `returned ${ok}, saved ${saved}`;
});
behaves('a filled text prompt saves trimmed text', () => {
  let saved = null;
  UI.openTextPrompt({ title: 'T', onSave: (v) => (saved = v) });
  resolve('#tp_value').value = '  Meditate 10 min  ';
  UI.resolveTextPrompt();
  return saved === 'Meditate 10 min' ? '' : `saved ${JSON.stringify(saved)}`;
});

console.log('\nevery unit renders in the goal editor');
Object.keys(A.UNITS).forEach((u) => {
  const g = S.addGoal({ name: 'Unit ' + u, unit: u, direction: 'up', baseline: 1, target: 10, step: 1 });
  sheet('editor · ' + u, () => UI.openGoalEditor(g.id));
  sheet('detail · ' + u, () => UI.openGoalDetail(g.id));
  S.removeGoal(g.id);
});

/* ---------- every programmed day renders ---------- */
console.log('\nevery day of the built-in program');
S.resetAll();
[1, 2, 3, 4, 5, 6, 0].forEach((d) => {
  // Walk the view date forward to each weekday so Today renders that day's work.
  let k = t;
  for (let i = 0; i < 7 && A.weekday(k) !== d; i++) k = A.addDays(k, 1);
  UI.setViewDate(k);
  check(A.DAY_NAMES[d], () => renderRoute('today'));
});
UI.setViewDate(t);

console.log('\nno goals at all');
S.get().goals.slice().forEach((g) => S.removeGoal(g.id));
ROUTES.forEach((r) => check('empty goals · ' + r, () => renderRoute(r)));

/* ---------- the view and the store must agree on which day it is ---------- */
console.log('\nthe logical day, not the calendar date');

/* A 24h grace window puts S.today() exactly one calendar day behind A.key() —
   the same split a real user sees between midnight and the 04:00 rollover, but
   reproducible without running the suite at 1am. */
S.updateSettings({ dayBoundaryHour: 24 });
const logical = S.today();
UI.setViewDate(logical);

behaves('the grace window really does split logical from calendar', () =>
  logical !== A.key() ? '' : `both resolved to ${logical}`
);

behaves('the week strip rings the logical day, not the calendar date', () => {
  const html = renderRoute('today');
  const re = /<div class="dot ([^"]*)">/g;
  const dots = [];
  let m;
  while ((m = re.exec(html))) dots.push(m[1].split(' '));
  if (dots.length !== 7) return `found ${dots.length} day dots, expected 7`;
  const ringed = dots.findIndex((cls) => cls.indexOf('today') >= 0);
  const expected = A.daysBetween(A.weekStart(logical), logical);
  return ringed === expected ? '' : `ringed dot ${ringed}, expected ${expected} for ${logical}`;
});

behaves('mood buttons carry the day they were rendered for', () => {
  const html = renderRoute('read');
  const buttons = html.match(/<button[^>]*data-act="mood"[^>]*>/g) || [];
  if (buttons.length !== 5) return `found ${buttons.length} mood buttons, expected 5`;
  const wrong = buttons.filter((b) => b.indexOf(`data-date="${logical}"`) < 0).length;
  return wrong ? `${wrong} of 5 do not carry data-date="${logical}"` : '';
});

S.updateSettings({ dayBoundaryHour: 4 });
UI.setViewDate(S.today());

/* ---------- user text cannot become markup ---------- */
console.log('\nuser-controlled icons are escaped, not injected');

/* Icons are user text: the editors cap them at 4 characters, but importJson()
   accepts arbitrary JSON, so a hand-edited backup is a real injection path.
   The app renders no <img> of its own, which makes it a clean sentinel. */
S.resetAll();
const XSS = '<img src=x onerror="alert(1)">';
const hostileGoal = S.activeGoals()[0];
const hostileEx = S.get().exercises[0];
S.updateGoal(hostileGoal.id, { icon: XSS });
S.updateExercise(hostileEx.id, { icon: XSS });
S.addHabit('Hostile habit', XSS);
for (let d = 0; d <= 6; d++) S.addToPlan(d, hostileEx.id);
S.updateSettings({ requireHabits: true });
UI.setViewDate(S.today());

behaves('no view renders a raw tag from a goal, exercise or habit icon', () => {
  const dirty = ROUTES.filter((r) => renderRoute(r).indexOf('<img') >= 0);
  return dirty.length ? `raw markup reached: ${dirty.join(', ')}` : '';
});

behaves('the exercise picker escapes icons too', () => {
  sheetBody.innerHTML = '';
  UI.openPicker(1);
  return sheetBody.innerHTML.indexOf('<img') >= 0 ? 'raw markup reached the picker' : '';
});

behaves('the escaped icon is still rendered, just inert', () => {
  const html = renderRoute('more');
  return html.indexOf('&lt;img') >= 0 ? '' : 'the icon vanished instead of being escaped';
});

/* ---------- the storage-error banner ---------- */
console.log('\nunreadable data offers both routes out');

S.resetAll();
UI.setViewDate(S.today());
S.get().meta.storageError = 'unreadable';

behaves('Today carries the restore and download routes', () => {
  const html = renderRoute('today');
  const restore = html.indexOf('data-act="import"') >= 0;
  const rescue = html.indexOf('data-act="download-unreadable"') >= 0;
  if (!restore || !rescue) return `restore=${restore} download=${rescue}`;
  return html.indexOf('banner warn stack') >= 0 ? '' : 'not rendered as the stacked warn banner';
});

behaves('an unwritable device is told to export, not to restore', () => {
  S.get().meta.storageError = 'unwritable';
  const html = renderRoute('today');
  if (html.indexOf('data-act="download-unreadable"') >= 0) return 'showed the unreadable banner instead';
  return html.indexOf('Changes are not being saved') >= 0 ? '' : 'no unwritable banner rendered';
});

/* A leg day of eight exercises pushed the habits, the streak and the journal
   two screens down, on the tab the user opens to do the day's work. */
console.log('\na long workout does not take over Today');
S.resetAll();
UI.setViewDate(S.today());
const wkDay = A.weekday(S.today());
S.get().plan[wkDay] = [];
S.commit({ type: 'fixture' });
S.get().exercises.slice(0, 8).forEach((e) => S.addToPlan(wkDay, e.id));
const planned = S.dayPlan(S.today()).length;

behaves('the fixture really is a long day', () => (planned >= 6 ? '' : planned + ' exercises'));

behaves('the workout starts folded, so a leg day costs one row', () => {
  const html = renderRoute('today');
  if (html.indexOf('class="section-fold') < 0) return 'the heading is not a disclosure';
  if (html.indexOf('aria-expanded="false"') < 0) return 'it does not open folded';
  const rows = (html.match(/class="item tight/g) || []).length;
  return rows === 0 ? '' : rows + ' rows rendered while folded';
});

/* Folding may hide the list. It may not hide the fact that there is one. */
behaves('and the folded heading still says how much of it is left', () => {
  const html = renderRoute('today');
  return html.indexOf('0 of ' + planned + ' done') > 0
    ? '' : 'the heading does not carry the count';
});

/* The wrapper survives the fold even though its contents do not, so the
   heading's `aria-controls` always resolves to something real. */
behaves('the folded heading still points at an element that exists', () => {
  const html = renderRoute('today');
  if (html.indexOf('id="workoutBody"') < 0) return 'no body element to control';
  return html.indexOf('aria-controls="workoutBody"') > 0 ? '' : 'the heading controls nothing';
});

/* Folding the section took the only way of finishing a workout with it. The
   tick sits outside the fold so a finished workout is always one tap away. */
behaves('a folded workout can still be ticked off', () => {
  const html = renderRoute('today');
  if (html.indexOf('data-act="workout-done"') < 0) return 'no tick on the folded heading';
  if (html.indexOf('aria-expanded="false"') < 0) return 'the fixture is not folded';
  // The tick must not be inside the button it sits beside — nested buttons do
  // not survive a real browser, whatever the stub DOM says about them.
  const head = html.slice(html.indexOf('class="section-fold'), html.indexOf('id="workoutBody"'));
  const main = head.indexOf('data-act="workout-more"');
  const tick = head.indexOf('data-act="workout-done"');
  return head.slice(main, tick).indexOf('</button>') > 0 ? '' : 'the tick is nested inside the fold toggle';
});

behaves('ticking the heading marks the whole workout, and says so', () => {
  S.toggleWorkout(S.today());
  const html = renderRoute('today');
  if (S.dayPlan(S.today()).some((i) => !S.log(S.today()).ex[i.id])) return 'not every exercise was ticked';
  if (html.indexOf('All ' + planned + ' done') < 0) return 'the heading does not say it is finished';
  return html.indexOf('section-fold is-open is-done') >= 0 || html.indexOf('is-done') > 0
    ? '' : 'the heading is not drawn as done';
});

/* The tap is its own undo: the heading is the only place a whole workout can be
   marked from, so a mis-tap there must not need the day cleared to correct. */
behaves('and ticking it again takes the whole workout back off', () => {
  S.toggleWorkout(S.today());
  const done = S.dayPlan(S.today()).filter((i) => S.log(S.today()).ex[i.id]).length;
  return done === 0 ? '' : done + ' exercises still ticked';
});

/* It says "workout". It must not quietly answer for the daily habits too, which
   is what `completeAll` next door does. */
behaves('the workout tick does not reach into the daily habits', () => {
  const before = JSON.stringify((S.log(S.today()) || {}).hb || {});
  S.toggleWorkout(S.today());
  const after = JSON.stringify((S.log(S.today()) || {}).hb || {});
  S.toggleWorkout(S.today());
  return before === after ? '' : 'it ticked habits as well: ' + after;
});

/* Emptying `state.plan` is not enough once the day has been opened: `ensureLog`
   freezes that day's exercise list, and `dayPlan` answers from the frozen copy.
   That is the invariant working — a day you have started is never re-cast — so
   the fixture has to drop the log as well as the weekly plan. */
function restDayFixture() {
  const keep = S.get().plan[wkDay];
  const log = S.get().logs[S.today()];
  delete S.get().logs[S.today()];
  S.get().plan[wkDay] = [];
  S.commit({ type: 'fixture' });
  return () => {
    S.get().plan[wkDay] = keep;
    if (log) S.get().logs[S.today()] = log;
    S.commit({ type: 'fixture' });
  };
}

behaves('a rest day is not offered a workout tick at all', () => {
  const restore = restDayFixture();
  const html = renderRoute('today');
  restore();
  return html.indexOf('data-act="workout-done"') < 0 ? '' : 'it offers to complete nothing';
});

behaves('opening it shows every exercise, not a capped few', () => {
  UI.toggleWorkoutOpen();
  const html = renderRoute('today');
  const rows = (html.match(/class="item tight/g) || []).length;
  if (rows !== planned) return rows + ' rows for ' + planned + ' exercises';
  if (html.indexOf('aria-expanded="true"') < 0) return 'it does not report itself as open';
  return html.indexOf('data-act="workout-done"') > 0 ? '' : 'the tick vanished once it was opened';
});

behaves('and changing the day folds it again', () => {
  UI.toggleWorkoutOpen();
  UI.setViewDate(A.addDays(S.today(), -1));
  if (UI.workoutOpen()) return 'it stayed open across a date change';
  UI.setViewDate(S.today());
  return '';
});

/* Muscle groups: what an exercise works, as opposed to what kind it is. */
console.log('\nmuscles trained');

behaves('the exercise editor offers every muscle group as a chip', () => {
  sheetBody.innerHTML = '';
  UI.openExerciseEditor(S.get().exercises[0].id);
  const html = sheetBody.innerHTML;
  const missing = A.MUSCLES.filter((m) => html.indexOf('data-muscle="' + m.id + '"') < 0);
  if (missing.length) return 'not offered: ' + missing.map((m) => m.id).join(', ');
  // A seeded exercise arrives already tagged, so at least one must be on.
  return /aria-pressed="true"/.test(html) ? '' : 'a tagged exercise shows nothing selected';
});

behaves('Stats breaks the work down by muscle, over a window you can change', () => {
  const html = renderRoute('progress');
  if (html.indexOf('Muscles trained') < 0) return 'no muscle section';
  const windows = (html.match(/data-act="muscle-window"/g) || []).length;
  if (windows !== 3) return windows + ' windows offered';
  return html.indexOf('aria-pressed="true"') > 0 ? '' : 'no window is selected';
});

behaves('and the window actually changes what is counted', () => {
  UI.setMuscleWindow(90);
  if (UI.muscleWindow() !== 90) return 'the window did not change';
  const wide = renderRoute('progress');
  UI.setMuscleWindow(7);
  const narrow = renderRoute('progress');
  if (wide === narrow) return 'week and 3 months render identically';
  return UI.muscleWindow() === 7 ? '' : 'it did not go back';
});

behaves('a window with nothing in it says so rather than rendering an empty card', () => {
  const before = S.get().logs;
  S.get().logs = {};
  S.commit({ type: 'fixture' });
  const html = renderRoute('progress');
  S.get().logs = before;
  S.commit({ type: 'fixture' });
  return html.indexOf('Nothing logged in this window') > 0 ? '' : 'no empty state for the muscle card';
});

/* Exercise pictures. The base64 below is deliberately short and checked to hold
   none of "undefined", "NaN" or "[object Object]" — the harness scans rendered
   HTML for those, and a data URL is a long enough random-looking string to trip
   it by accident. */
console.log('\nexercise pictures');
const SHOT = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAg=';

behaves('a picture cache is available even with no database behind it', () => {
  if (!A.Photos) return 'the module did not load';
  if (A.Photos.supported()) return 'the sandbox unexpectedly has IndexedDB';
  return A.Photos.get('nothing') === null ? '' : 'get invented a picture';
});

behaves('the how-to sheet offers to add one when there is none', () => {
  const ex = S.get().exercises[0];
  sheetBody.innerHTML = '';
  UI.openExerciseHow(ex.id, null);
  const html = sheetBody.innerHTML;
  if (html.indexOf('data-act="ex-photo-pick"') < 0) return 'no way to add a picture';
  if (html.indexOf('<img') >= 0) return 'it rendered an image element with no image';
  // It must say where the picture goes, because "add a picture" to an app that
  // makes no network calls is a promise worth being explicit about.
  return html.indexOf('never uploaded') > 0 ? '' : 'it does not say the picture stays on the device';
});

/* `put` writes the memory cache synchronously and the database after, so this
   seeds a picture in a sandbox that has no database at all. */
behaves('and shows the picture once there is one', () => {
  const ex = S.get().exercises[0];
  A.Photos.put(ex.id, SHOT);
  sheetBody.innerHTML = '';
  UI.openExerciseHow(ex.id, null);
  const html = sheetBody.innerHTML;
  if (html.indexOf('src="' + SHOT + '"') < 0) return 'the picture is not in the img src';
  if (html.indexOf('data-act="ex-photo-rm"') < 0) return 'no way to remove it';
  // A picture is not a caption: the alt text has to name the exercise.
  return html.indexOf('alt="How to do ' + ex.name + '"') > 0 ? '' : 'no useful alt text';
});

behaves('a picture belongs to its own exercise and no other', () => {
  const other = S.get().exercises[1];
  sheetBody.innerHTML = '';
  UI.openExerciseHow(other.id, null);
  return sheetBody.innerHTML.indexOf('<img') < 0 ? '' : 'the picture leaked onto another exercise';
});

behaves('removing it puts the empty state back', () => {
  const ex = S.get().exercises[0];
  A.Photos.remove(ex.id);
  sheetBody.innerHTML = '';
  UI.openExerciseHow(ex.id, null);
  return sheetBody.innerHTML.indexOf('<img') < 0 ? '' : 'the picture survived removal';
});

/* The pictures live outside `arise.state.v1`, so the backup is the only thing
   carrying them across an origin move — the move that backup exists for. */
behaves('pictures are collected for the backup, and restored from one', () => {
  const ex = S.get().exercises[0];
  A.Photos.put(ex.id, SHOT);
  const backup = A.Photos.all();
  if (backup[ex.id] !== SHOT) return 'the backup does not hold the picture';
  A.Photos.remove(ex.id);
  if (A.Photos.get(ex.id)) return 'remove did not clear it';
  /* `restore` returns a Promise, which is always truthy — the old assertion here
     could not fail. It fills the cache synchronously now, so the thing worth
     checking is observable straight away: the picture is back. */
  A.Photos.restore(backup);
  return A.Photos.get(ex.id) === SHOT ? '' : 'restore did not put the picture back';
});

behaves('and a backup with no pictures in it removes none', () => {
  const ex = S.get().exercises[0];
  A.Photos.put(ex.id, SHOT);
  A.Photos.restore(undefined);
  A.Photos.restore({});
  const kept = A.Photos.get(ex.id) === SHOT;
  A.Photos.remove(ex.id);
  return kept ? '' : 'an empty restore wiped an existing picture';
});

/* Fifty-nine exercises pushed Reminders, Profile and the export route off the
   bottom of More. */
behaves('the exercise library folds too, and says how many it holds', () => {
  const html = renderRoute('more');
  const total = S.get().exercises.length;
  if (html.indexOf('data-act="lib-open"') < 0) return 'the library heading is not a disclosure';
  if (html.indexOf(total + ' exercises') < 0) return 'it does not say how many there are';
  return html.indexOf('data-act="lib-edit"') < 0 ? '' : 'the rows rendered while folded';
});

behaves('and opening it lists every one of them', () => {
  UI.toggleLibOpen();
  const html = renderRoute('more');
  const rows = (html.match(/data-act="lib-edit"/g) || []).length;
  UI.toggleLibOpen();
  return rows === S.get().exercises.length ? '' : rows + ' rows for ' + S.get().exercises.length;
});

/* Folding the workout took its only completion control with it. Adding a new
   exercise must stay reachable the same way. */
behaves('a new exercise can be added without opening the library', () => {
  const html = renderRoute('more');
  return html.indexOf('data-act="lib-add"') > 0 ? '' : 'no way to add one while folded';
});

behaves('a rest day says so on the heading rather than opening onto nothing', () => {
  const restore = restDayFixture();
  const html = renderRoute('today');
  restore();
  return html.indexOf('Rest day') > 0 ? '' : 'a day with no exercises gives no summary';
});

/* The row lost a line, so the dose has to still be on it — a workout row that
   does not say how much is not a workout row. */
behaves('the tightened row still carries the dose', () => {
  S.get().exercises.slice(0, 3).forEach((e) => S.addToPlan(wkDay, e.id));
  UI.toggleWorkoutOpen();
  const html = renderRoute('today');
  const first = S.dayPlan(S.today())[0];
  const ex = S.exerciseById(first.exerciseId);
  if (html.indexOf('class="dose"') < 0) return 'no dose column at all';
  if (html.indexOf(ex.name) < 0) return 'the exercise name went with it';
  UI.toggleWorkoutOpen();
  return '';
});

behaves('a healthy account shows no such banner', () => {
  S.resetAll();
  UI.setViewDate(S.today());
  S.get().meta.storageError = null;
  const html = renderRoute('today');
  if (html.indexOf('data-act="download-unreadable"') >= 0) return 'unreadable banner rendered without an error';
  return html.indexOf('Changes are not being saved') < 0 ? '' : 'unwritable banner rendered without an error';
});

/* ---------- the goal editor offers no control that does nothing ---------- */
console.log('\nthe goal editor hides fields that do not apply');

function editorHtml(patch) {
  const g = S.addGoal(Object.assign({ name: 'Field test', unit: 'minutes', direction: 'up', baseline: 1, target: 10, step: 1 }, patch));
  sheetBody.innerHTML = '';
  UI.openGoalEditor(g.id);
  const html = sheetBody.innerHTML;
  S.removeGoal(g.id);
  return html;
}

behaves('the weekday picker is hidden while a goal runs every day', () => {
  const html = editorHtml({ schedule: { type: 'daily' } });
  return /id="gg_days"[^>]*hidden/.test(html) ? '' : 'weekday checkboxes offered on a daily goal';
});

behaves('and is shown once chosen weekdays are selected', () => {
  const html = editorHtml({ schedule: { type: 'weekdays', days: [1, 2, 3] } });
  return /id="gg_days"[^>]*hidden/.test(html) ? 'still hidden when the schedule needs it' : '';
});

behaves('a time-based exercise is not asked for reps', () => {
  const ex = S.addExercise({ name: 'Long Walk', category: 'Cardio', unit: 'time', minutes: 30 });
  sheetBody.innerHTML = '';
  UI.openExerciseEditor(ex.id);
  const html = sheetBody.innerHTML;
  S.removeExercise(ex.id);
  if (html.indexOf('<span>Minutes</span>') < 0) return 'the first field is not labelled Minutes';
  return html.indexOf('class="field" hidden><span>Reps</span>') > 0 ? '' : 'the Reps field is still offered';
});

behaves('and a sets-and-reps exercise still is', () => {
  const ex = S.addExercise({ name: 'Some Press', category: 'Strength', unit: 'reps', sets: 3, reps: 10 });
  sheetBody.innerHTML = '';
  UI.openExerciseEditor(ex.id);
  const html = sheetBody.innerHTML;
  S.removeExercise(ex.id);
  if (html.indexOf('<span>Sets</span>') < 0) return 'the first field is not labelled Sets';
  return html.indexOf('<span>Reps</span>') > 0 && html.indexOf('class="field" hidden><span>Reps</span>') < 0
    ? ''
    : 'the Reps field is hidden when it applies';
});

behaves('direction is shown as derived, not as a choice', () => {
  const g = S.addGoal({ name: 'Derived', unit: 'minutes', direction: 'up', baseline: 5, target: 30, step: 5 });
  sheetBody.innerHTML = '';
  UI.openGoalEditor(g.id);
  const html = sheetBody.innerHTML;
  S.removeGoal(g.id);
  if (html.indexOf('<select id="gg_dir"') >= 0) return 'still an editable select';
  return html.indexOf('id="gg_dir" readonly') > 0 ? '' : 'no read-only direction field';
});

behaves('the miss threshold is hidden while step-back is off', () => {
  const html = editorHtml({ regress: false });
  return /class="field" hidden>/.test(html) ? '' : 'miss threshold editable with step-back off';
});

behaves('and is shown while step-back is on', () => {
  const html = editorHtml({ regress: { misses: 3 } });
  return /class="field" hidden>/.test(html) ? 'hidden while step-back is on' : '';
});

/* ---------- the goal editor offers no control that does nothing ---------- */
console.log('\nthe goal editor hides fields that do not apply');

function editorHtml(patch) {
  const g = S.addGoal(Object.assign({ name: 'Field test', unit: 'minutes', direction: 'up', baseline: 1, target: 10, step: 1 }, patch));
  sheetBody.innerHTML = '';
  UI.openGoalEditor(g.id);
  const html = sheetBody.innerHTML;
  S.removeGoal(g.id);
  return html;
}

behaves('the weekday picker is hidden while a goal runs every day', () => {
  const html = editorHtml({ schedule: { type: 'daily' } });
  return /id="gg_days"[^>]*hidden/.test(html) ? '' : 'weekday checkboxes offered on a daily goal';
});

behaves('and is shown once chosen weekdays are selected', () => {
  const html = editorHtml({ schedule: { type: 'weekdays', days: [1, 2, 3] } });
  return /id="gg_days"[^>]*hidden/.test(html) ? 'still hidden when the schedule needs it' : '';
});

behaves('a time-based exercise is not asked for reps', () => {
  const ex = S.addExercise({ name: 'Long Walk', category: 'Cardio', unit: 'time', minutes: 30 });
  sheetBody.innerHTML = '';
  UI.openExerciseEditor(ex.id);
  const html = sheetBody.innerHTML;
  S.removeExercise(ex.id);
  if (html.indexOf('<span>Minutes</span>') < 0) return 'the first field is not labelled Minutes';
  return html.indexOf('class="field" hidden><span>Reps</span>') > 0 ? '' : 'the Reps field is still offered';
});

behaves('and a sets-and-reps exercise still is', () => {
  const ex = S.addExercise({ name: 'Some Press', category: 'Strength', unit: 'reps', sets: 3, reps: 10 });
  sheetBody.innerHTML = '';
  UI.openExerciseEditor(ex.id);
  const html = sheetBody.innerHTML;
  S.removeExercise(ex.id);
  if (html.indexOf('<span>Sets</span>') < 0) return 'the first field is not labelled Sets';
  return html.indexOf('<span>Reps</span>') > 0 && html.indexOf('class="field" hidden><span>Reps</span>') < 0
    ? ''
    : 'the Reps field is hidden when it applies';
});

behaves('direction is shown as derived, not as a choice', () => {
  const g = S.addGoal({ name: 'Derived', unit: 'minutes', direction: 'up', baseline: 5, target: 30, step: 5 });
  sheetBody.innerHTML = '';
  UI.openGoalEditor(g.id);
  const html = sheetBody.innerHTML;
  S.removeGoal(g.id);
  if (html.indexOf('<select id="gg_dir"') >= 0) return 'still an editable select';
  return html.indexOf('id="gg_dir" readonly') > 0 ? '' : 'no read-only direction field';
});

behaves('the miss threshold is hidden while step-back is off', () => {
  const html = editorHtml({ regress: false });
  return /class="field" hidden>/.test(html) ? '' : 'miss threshold editable with step-back off';
});

behaves('and is shown while step-back is on', () => {
  const html = editorHtml({ regress: { misses: 3 } });
  return /class="field" hidden>/.test(html) ? 'hidden while step-back is on' : '';
});

/* ---------- the how-to sheet, back to written cues ---------- */
console.log('\nthe how-to sheet');

behaves('the cues are the sheet, with no demonstration left behind', () => {
  const ex = S.get().exercises.find((e) => e.how);
  if (!ex) return 'no exercise in the library carries cues';
  sheetBody.innerHTML = '';
  UI.openExerciseHow(ex.id, null);
  const html = sheetBody.innerHTML;
  if (html.indexOf('demo-svg') >= 0 || html.indexOf('animateTransform') >= 0) return 'a demonstration is still rendered';
  return html.indexOf('<ol class="how-list">') > 0 ? '' : 'the cues are missing';
});

behaves('an exercise with no cues says so rather than inventing any', () => {
  const bare = S.addExercise({ name: 'Nameless Movement', category: 'Other', unit: 'reps', sets: 3, reps: 10 });
  sheetBody.innerHTML = '';
  UI.openExerciseHow(bare.id, null);
  const html = sheetBody.innerHTML;
  S.removeExercise(bare.id);
  if (html.indexOf('how-list') >= 0) return 'invented cues that do not exist';
  return html.indexOf('No written cues') > 0 ? '' : 'no empty state';
});

/* ---------- Today asks before it scores ---------- */
console.log('\nToday leads with the day, not the scoreboard');

S.resetAll();
UI.setViewDate(S.today());

/* This used to assert the scoreboard came AFTER the goal cards. Artboard 1c
   removes it from Today altogether — the streak and days kept are in the header,
   and the totals are the first thing on Stats — so the assertion is now that it
   is not on this screen at all. Stronger, and the same principle.

   Note what it checks: `hero-stats` is the markup, not the prose. The first
   version of this looked for the words "Where you are", which the comment
   explaining the removal happened to contain, so it passed on a sentence
   describing the thing being gone. */
behaves('Today carries no scoreboard at all — the day is the whole screen', () => {
  const html = renderRoute('today');
  if (html.indexOf('class="gcard') < 0) return 'no goal cards on Today';
  if (html.indexOf('class="hero-stats"') >= 0) return 'the three-figure scoreboard is back on Today';
  const rails = (html.match(/class="week-strip/g) || []).length;
  return rails === 1 ? '' : `${rails} week strips on Today — the rail is meant to be the only one`;
});

behaves('the day counter leads, with the segments under it', () => {
  const html = renderRoute('today');
  const day = html.indexOf('class="daynum"');
  const segs = html.indexOf('class="segbar');   // `segbar ledger` since the redesign
  const cards = html.indexOf('class="gcard');
  if (day < 0) return 'no day counter';
  if (segs < 0) return 'no To-do/Done/Skipped segments';
  return day < segs && segs < cards ? '' : `order day=${day} segs=${segs} cards=${cards}`;
});

behaves('the segments count each bucket and only one is selected', () => {
  const html = renderRoute('today');
  const on = (html.match(/class="seg on"/g) || []).length;
  const all = (html.match(/class="seg /g) || []).length;
  if (all !== 3) return `found ${all} segments, expected 3`;
  return on === 1 ? '' : `${on} segments marked selected`;
});

behaves('a target reads as words, not maths', () => {
  const g = S.addGoal({ name: 'Fewer smokes', unit: 'count', direction: 'down', baseline: 20, target: 0, step: 2 });
  const html = renderRoute('today');
  S.removeGoal(g.id);
  if (html.indexOf('≤') >= 0) return 'still rendering ≤';
  return html.indexOf('at most') > 0 ? '' : 'no "at most" phrasing found';
});

behaves('a missed day is marked, not just coloured', () => {
  // Backdate the account so the week strip has a genuinely missed day in it.
  S.get().createdAt = A.addDays(S.today(), -20);
  S.commit({ type: 'test' });
  const html = renderRoute('today');
  const strip = html.slice(html.indexOf('week-strip'), html.indexOf('week-strip') + 900);
  return strip.indexOf('✕') > 0 ? '' : 'missed days carry no mark';
});

/* ---------- a view that throws must not become a white screen ---------- */
console.log('\na failed render degrades to something usable');

behaves('a throwing view is replaced by a recovery panel, not a blank page', () => {
  // Break a store call Today genuinely depends on, so the failure is real.
  // (This used to break S.progress, which Today stopped calling once XP was
  // demoted off the screen — a test coupled to an implementation detail.)
  const realProgress = S.goalsForDay;
  S.goalsForDay = () => {
    throw new Error('synthetic view failure');
  };
  // The app is supposed to log this one, so silence the sandbox rather than let
  // an expected stack trace bury the results.
  const realConsole = sandbox.console;
  sandbox.console = { log: () => {}, warn: () => {}, error: () => {} };
  let html = '';
  try {
    UI.go('today');
    html = view.innerHTML;
  } finally {
    S.goalsForDay = realProgress;
    sandbox.console = realConsole;
  }
  if (html.indexOf('recovery') < 0) return `no recovery panel (got ${html.length} chars)`;
  if (html.indexOf('synthetic view failure') < 0) return 'the panel hides what went wrong';
  return html.indexOf('data-act="export"') > 0 ? '' : 'the panel offers no way to save the data';
});

behaves('and the app recovers on the next render', () => {
  UI.go('today');
  const html = view.innerHTML;
  if (html.indexOf('recovery') >= 0) return 'still stuck on the recovery panel';
  return html.indexOf('class="daynum"') > 0 ? '' : 'Today did not come back';
});

behaves('a focused control does not break the re-render', () => {
  /* The stub DOM has no activeElement, so the focus-restore path would otherwise
     never run here. Supplying one proves the path is safe; it cannot prove the
     refocus works, because this stub's querySelectorAll returns nothing. That
     half needs a real browser. */
  sandbox.document.activeElement = { dataset: { act: 'goal-hit', id: 'gl_x', date: S.today() } };
  try {
    UI.go('today');
    return view.innerHTML.indexOf('class="daynum"') > 0 ? '' : 'the view did not render';
  } finally {
    delete sandbox.document.activeElement;
  }
});

behaves('the recovery panel escapes whatever the error said', () => {
  const html = UI.recoveryPanel(new Error('<img src=x onerror=alert(1)>'));
  return html.indexOf('<img') < 0 ? '' : 'raw markup from an error message';
});

behaves('a ladder with thousands of rungs does not build them all', () => {
  const huge = S.addGoal({ name: 'Runaway', unit: 'count', direction: 'up', baseline: 0, target: 10000, step: 0.25 });
  sheetBody.innerHTML = '';
  UI.openGoalDetail(huge.id);
  const html = sheetBody.innerHTML;
  const rungs = (html.match(/class="rung/g) || []).length;
  S.removeGoal(huge.id);
  if (rungs > 80) return `rendered ${rungs} rungs`;
  return html.indexOf('more</span>') > 0 ? '' : 'truncated without saying so';
});

/* ---------- the app's own currency stays below the real numbers ---------- */
console.log('\nfacts outrank points');

S.resetAll();
UI.setViewDate(S.today());

behaves('Today carries no XP, level or rank', () => {
  const html = renderRoute('today');
  const bad = ['total XP', 'XP</span>', 'Level ', 'Lv '].filter((s) => html.indexOf(s) >= 0);
  return bad.length ? `still showing: ${bad.join(', ')}` : '';
});

behaves('and shows days kept instead', () => {
  const html = renderRoute('today');
  return html.indexOf('days kept') > 0 ? '' : 'no real total on Today';
});

behaves('Stats leads with what actually happened, not the level', () => {
  const html = renderRoute('progress');
  const real = html.indexOf("What you've actually done");
  /* Artboard 2c drops the level from a headed card to an unheaded grey row at
     the very bottom, so this looks for the row rather than for a heading that no
     longer exists. Demoted, not deleted, is still the whole assertion. */
  const level = html.indexOf('class="lvlrow"');
  if (real < 0) return 'no real ledger on Stats';
  if (level < 0) return 'the level vanished entirely — it should be demoted, not deleted';
  return real < level ? '' : 'the level still comes first';
});

/* The rule the artboard states in one line: the level is an instrument, not the
   argument. It loses the accent colour, and it is the LAST thing on the screen.
   Both halves are checkable, and both were decisions rather than styling. */
behaves('the level is the last thing on Stats, and carries no accent', () => {
  const html = renderRoute('progress');
  const level = html.indexOf('class="lvlrow"');
  if (level < 0) return 'no level row';
  const after = html.slice(level);
  if (/class="(ledgercard|statrow|heat|label)/.test(after.replace('class="lvlrow"', ''))) {
    return 'something real is drawn below the level row';
  }
  return /class="lvlrow[\s\S]{0,600}(var\(--accent|var\(--gold)/.test(html)
    ? 'the level row is painted in an accent' : '';
});

behaves('a clock goal reports days, never a sum of times', () => {
  const g = S.addGoal({ name: 'Rise', unit: 'time', direction: 'down', baseline: 450, target: 360, step: 15 });
  S.hitGoalTarget(S.today(), g.id);
  const html = renderRoute('progress');
  S.removeGoal(g.id);
  // 450 + 450 would show up as a minutes-like total; days must be what appears.
  return html.indexOf('1 day') > 0 ? '' : 'a clock goal did not report days kept';
});

/* ---------- rewards you promise yourself ---------- */
console.log('\nyour own rewards');

S.resetAll();
UI.setViewDate(S.today());

behaves('the empty state invites you to promise yourself something', () => {
  const html = renderRoute('rewards');
  // "Your own rewards" since 2d — the section label, and the sentence under it.
  if (html.indexOf('Your own rewards') < 0) return 'no custom rewards section';
  if (html.indexOf('Promise yourself something real') < 0) return 'the empty state says nothing';
  return html.indexOf('data-act="reward-new"') > 0 ? '' : 'no way to add one';
});

behaves('a reward shows what it needs and how close it is', () => {
  const r = S.addCustomReward({ name: 'New sneakers', icon: '👟', source: 'overall', days: 14 });
  const html = renderRoute('rewards');
  S.removeCustomReward(r.id);
  if (html.indexOf('New sneakers') < 0) return 'the reward is not listed';
  if (html.indexOf('14 days') < 0 && html.indexOf('/ 14') < 0) return 'the target is not shown';
  return html.indexOf('to go') > 0 ? '' : 'no distance-to-go shown';
});

behaves('an earned reward offers to be collected', () => {
  const r = S.addCustomReward({ name: 'Coffee', source: 'overall', days: 1 });
  S.get().bestStreak = 5; // history() reports the high-water mark
  const html = renderRoute('rewards');
  const ok = html.indexOf('data-act="reward-claim"') > 0;
  S.removeCustomReward(r.id);
  return ok ? '' : 'an earned reward has no collect button';
});

behaves('a reward tied to a deleted goal says so rather than breaking', () => {
  const g = S.addGoal({ name: 'Temp goal', unit: 'count', direction: 'up', baseline: 1, target: 5, step: 1 });
  const r = S.addCustomReward({ name: 'Prize', source: 'goal', goalId: g.id, days: 7 });
  S.removeGoal(g.id);
  const html = renderRoute('rewards');
  S.removeCustomReward(r.id);
  return html.indexOf('deleted goal') > 0 ? '' : 'a dangling goal link is not explained';
});

behaves('the editor hides the goal picker unless a goal is tracked', () => {
  sheetBody.innerHTML = '';
  UI.openRewardEditor(null);
  const html = sheetBody.innerHTML;
  if (html.indexOf('id="rw_name"') < 0) return 'no reward editor';
  return html.indexOf('class="field" hidden><span>Which goal</span>') > 0 ? '' : 'the goal picker is offered for an overall reward';
});

behaves('and shows it for a goal-tracked reward', () => {
  const g = S.addGoal({ name: 'Gym', unit: 'count', direction: 'up', baseline: 1, target: 5, step: 1 });
  const r = S.addCustomReward({ name: 'Shoes', source: 'goal', goalId: g.id, days: 14 });
  sheetBody.innerHTML = '';
  UI.openRewardEditor(r.id);
  const html = sheetBody.innerHTML;
  S.removeCustomReward(r.id);
  S.removeGoal(g.id);
  return html.indexOf('class="field" hidden><span>Which goal</span>') < 0 ? '' : 'the goal picker is hidden when it applies';
});

behaves('a hostile reward name cannot inject markup', () => {
  const r = S.addCustomReward({ name: '<img src=x onerror=alert(1)>', source: 'overall', days: 3 });
  const html = renderRoute('rewards');
  S.removeCustomReward(r.id);
  return html.indexOf('<img') < 0 ? '' : 'raw markup from a reward name';
});

/* A sheet this file renders directly is not thereby reachable. `openGoalLog`
   was rendered on every run of this suite while nothing in the app produced a
   `goal-log` action at all, so the value log — and with it skipping a day —
   could not be opened. Assert the route, not just the markup. */
behaves('the goal sheet can reach the value log', () => {
  const gv = S.addGoal({ name: 'Reachable', unit: 'minutes', direction: 'up', baseline: 5, target: 30, step: 5 });
  sheetBody.innerHTML = '';
  UI.openGoalDetail(gv.id, S.today());
  const html = sheetBody.innerHTML;
  S.removeGoal(gv.id);
  return html.indexOf('data-act="goal-log"') >= 0 ? '' : 'no route in: the value log and skipping are unreachable';
});

behaves('a gated goal routes to its summary instead', () => {
  const gg = S.activeGoals().find((x) => x.gate === 'summary');
  if (!gg) return 'no gated goal to check';
  sheetBody.innerHTML = '';
  UI.openGoalDetail(gg.id, S.today());
  const html = sheetBody.innerHTML;
  if (html.indexOf('data-act="open-read"') < 0) return 'a gated goal offers no route to the summary it waits on';
  return html.indexOf('data-act="goal-log"') < 0 ? '' : 'a gated goal offers a value log that cannot complete it';
});

/* The conversion sheet is a goal editor with one extra promise printed on it,
   and the promise is the load-bearing part: the habit GOES. A form that made
   that change without saying so would be the app deleting something the user
   did not ask it to. */
behaves('the habit-to-goal sheet says the habit will be moved, not copied', () => {
  const h = S.addHabit('Cold shower', '🚿');
  sheetBody.innerHTML = '';
  UI.openGoalEditor(null, { name: h.name, icon: h.icon, fromHabit: h.id });
  const html = sheetBody.innerHTML;
  S.removeHabit(h.id);
  if (html.indexOf('data-habit="' + h.id + '"') < 0) return 'the save button does not carry the habit';
  if (html.indexOf('takes it off the habit list') < 0) return 'it does not say the habit is removed';
  return html.indexOf('Make it a goal') > 0 ? '' : 'the button still reads as a plain new goal';
});

behaves('a plain new goal carries no habit and no such promise', () => {
  sheetBody.innerHTML = '';
  UI.openGoalEditor(null);
  const html = sheetBody.innerHTML;
  if (html.indexOf('takes it off the habit list') >= 0) return 'it promises to remove a habit that does not exist';
  return html.indexOf('data-habit=""') > 0 ? '' : 'the save button should carry an empty habit id';
});

behaves('a future day keeps the goal sheet read-only', () => {
  const gv = S.addGoal({ name: 'Later', unit: 'minutes', direction: 'up', baseline: 5, target: 30, step: 5 });
  sheetBody.innerHTML = '';
  UI.openGoalDetail(gv.id, A.addDays(S.today(), 3));
  const html = sheetBody.innerHTML;
  S.removeGoal(gv.id);
  return html.indexOf('data-act="goal-log"') < 0 ? '' : 'a future day offers a way to log it';
});

/* ---------- the day, reachable with one thumb ----------
   The swipe and press-and-hold gestures live in js/app.js, which neither suite
   loads — they have to be driven by hand in a browser. What can be checked here
   is everything they share with a tap: the states a card renders in, and the
   strip that carries the day's next ask down to where a thumb is. */
console.log('\nreach');

S.resetAll();
UI.setViewDate(S.today());

behaves('Today pins what is left to a strip above the tab bar', () => {
  const html = renderRoute('today');
  if (html.indexOf('class="today-strip"') < 0) return 'no day strip';
  if (html.indexOf('left today') < 0) return 'the strip does not say what is left';
  return /today-strip[\s\S]*data-act="(goal-hit|open-read)"/.test(html) ? '' : 'the strip offers no way to act on it';
});

behaves('a kept day says so rather than asking for more', () => {
  const k = S.today();
  S.goalsForDay(k).forEach((e) => {
    if (e.goal.gate === 'summary') S.setReading(k, { book: 'Deep Work', minutes: 25, summary: 'Attention is trainable.' });
    else S.hitGoalTarget(k, e.goal.id);
  });
  const html = renderRoute('today');
  if (html.indexOf('Day kept.') < 0) return 'a finished day still asks for something';
  return html.indexOf('Keep it</button>') < 0 ? '' : 'it still offers a goal to keep';
});

behaves('a day being reviewed carries no strip — it is not today’s work', () => {
  UI.setViewDate(A.addDays(S.today(), -2));
  const html = renderRoute('today');
  UI.setViewDate(S.today());
  return html.indexOf('class="today-strip"') < 0 ? '' : 'a past day offers today’s action';
});

behaves('a goal logged short of its ask is neither done nor untouched', () => {
  const g = S.addGoal({ name: 'Walk', unit: 'minutes', direction: 'up', baseline: 10, target: 60, step: 10 });
  S.setGoalValue(S.today(), g.id, 3);
  const html = renderRoute('today');
  S.removeGoal(g.id);
  if (/class="gcard[^"]*is-done/.test(html)) return 'short of the ask, and rendered as kept';
  return /class="gcard[^"]*is-part/.test(html) ? '' : 'a partial log renders as if nothing happened';
});

behaves('a card names the goal it is for, so a gesture knows what it hit', () => {
  // The day above was kept outright, so the cards are all under "Done".
  UI.setTodayFilter('done');
  const html = renderRoute('today');
  UI.setTodayFilter('todo');
  if (html.indexOf('class="gcard') < 0) return 'no cards to check';
  return /<article class="gcard[^>]*data-goal="[^"]+"/.test(html) ? '' : 'no goal id on the card';
});

behaves('Rewards is reachable from More, now that it has no tab', () => {
  const html = renderRoute('more');
  return html.indexOf('data-nav="rewards"') > 0 ? '' : 'Rewards left the tab bar with no way back to it';
});

/* The tab bar lives in index.html, which neither suite loads. A tab pointing at
   a route the app does not have would show up nowhere but on a phone. */
behaves('every tab in the shell is a route the app has', () => {
  const shell = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const tabs = (shell.match(/data-nav="[a-z]+"\s+data-icon/g) || []).map((s) => s.match(/data-nav="([a-z]+)"/)[1]);
  if (tabs.length !== 5) return `the shell has ${tabs.length} tabs, not five`;
  const unknown = tabs.filter((t) => ROUTES.indexOf(t) < 0);
  return unknown.length ? `tabs with no route: ${unknown.join(', ')}` : '';
});

/* ---------- the 66-day run ---------- */
console.log('\nthe 66-day run');

const RunE = A.Run;


/* A class the view sets is only half of a visual state. `.pick:has(:checked)`
   survived the markup changing from a label-and-checkbox to a button carrying
   `.on`, so a chosen habit had the class, had `aria-pressed="true"`, passed the
   test above — and looked identical to an unchosen one. Assert the stylesheet
   knows about every state class the run UI emits. */
behaves('every state class the run UI emits is actually styled', () => {
  // Comments stripped first: this file explains the bug it is guarding against,
  // and a scan that reads prose reports the thing it is describing.
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const needed = ['.pick.on', '.runrow.is-done', '.runrow.is-part', '.runitem.on',
                  '.lat.kept', '.lat.part', '.lat.missed', '.lat.unopened', '.lat.today',
                  '.lat.ahead', '.latphase.is-now', '.row.ahead',
                  '.item.tight', '.item.tight .dose', '.section-fold.is-open',
                  '.section-fold.is-done .fold-tick', '.fold-main', '.block-head', '.fold-bar', '.item.tight .exsub', '.item.tight .name', '.card.flush.runlist-card', '.item.habit-row', '.how-photo img', '.how-photo-add',
                  '.chip-pick.on', '.segbar.tight',
                  /* the card system the six screens are drawn in */
                  '.label', '.screenhead', '.headpill', '.dayhead.ember', '.dayhead-track > .kept',
                  '.week-strip.rail .wd.on', '.segbar.countline .seg.on', '.gcard-plate',
                  '.gcard.is-gated', '.gcard-tick.is-write', '.gcard.is-done', '.gcard.is-part',
                  '.paycard', '.linkrow', '.segbar.tabs .seg.on', '.goalcard', '.goalcard-bar > i', '.footnote', '.gatecard.is-done', '.minifield', '.readprompt', '.archive[open] > summary .ico', '.ledgercard', '.statcard', '.lvlrow-bar > i', '.myreward.is-ready', '.btn.gold', '.promptrow', '.reward .claimed-mark', '.dest', '.dest > span.is-ready', '.label.split', '.mode-card.on'];
  const missing = needed.filter((sel) => css.indexOf(sel) < 0);
  if (missing.length) return 'no rule for: ' + missing.join(', ');
  return css.indexOf(':has(:checked)') < 0 ? '' : 'a dead :has(:checked) rule is still in the sheet';
});

/* The one layout rule this suite can meaningfully guard, because it shipped.
   `html, body { height: 100% }` plus border-box sizing locks the body to the
   viewport, so its `padding-bottom` reserves nothing at the end of a scroll and
   the last control on any long screen sits under the fixed tab bar. The run's
   Start button lost 34px that way and could not be tapped on a phone.

   The stub DOM has no geometry, so nothing here can measure it — this asserts
   the rule that caused it instead. Real layout still needs a real browser at a
   real phone height; a tall window does not scroll and hides this entirely. */
behaves('the page can grow past the viewport, so a fixed bar cannot eat the end of it', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /html\s*,\s*body\s*\{([^}]*)\}/.exec(css);
  if (!rule) return 'no html, body rule at all — has the reset moved?';
  if (/(^|[^-])height\s*:\s*100%/.test(rule[1])) {
    return 'html, body is locked to height:100%; the bottom padding reserves nothing';
  }
  if (!/min-height\s*:\s*100%/.test(rule[1])) return 'html, body no longer fills the viewport';
  // And the padding that clears the tab bar has to still be there to be reserved.
  return /padding-bottom:\s*calc\(var\(--tab-h\)/.test(css)
    ? '' : 'nothing reserves room for the fixed tab bar';
});

behaves('a chosen habit is marked in the markup, not only in colour', () => {
  S.resetAll();
  UI.resetRunPicks();
  const html = renderRoute('run');
  const i = html.indexOf('data-id="' + A.Run.DEFAULT_PICKS[0] + '"');
  if (i < 0) return 'the default pick is not offered';
  const card = html.slice(Math.max(0, i - 200), i + 200);
  if (card.indexOf('pick-mark') < 0) return 'no mark element at all';
  // An unsupported colour function fails silently; a tick does not.
  return /pick-mark[^>]*>✓/.test(html) ? '' : 'nothing is ticked even though six are chosen';
});

behaves('the start screen offers the whole catalog, grouped', () => {
  S.resetAll();
  const html = renderRoute('run');
  // The pick buttons are the only data-id carriers on this screen.
  const offered = (html.match(/data-id="([a-z_]+)"/g) || [])
    .map((m) => m.slice(9, -1));
  const missing = A.Run.HABITS.map((h) => h.id).filter((id) => offered.indexOf(id) < 0);
  if (missing.length) return 'not offered: ' + missing.join(', ');
  return ['Fitness', 'Self-care', 'Development'].every((d) => html.indexOf('>' + d + '<') > 0)
    ? '' : 'the three domains are not headed separately';
});

/* The gap this screen was built to close. Every one of these was in the catalog
   and unreachable: not in the default run, and offered by the recommender only
   after a fortnight at 80% — around day 33 of 66. */
behaves('the self-care habits added for tooth, face and vitamins are pickable', () => {
  const html = renderRoute('run');
  const want = ['vitamins', 'floss', 'brush_teeth', 'skincare'];
  const absent = want.filter((id) => html.indexOf('data-id="' + id + '"') < 0);
  if (absent.length) return 'still unreachable: ' + absent.join(', ');
  return html.indexOf('Take vitamins') > 0 && html.indexOf('Morning skincare') > 0
    ? '' : 'they are offered by id but not by name';
});

behaves('the default selection is what pressing Start without thinking gives', () => {
  const html = renderRoute('run');
  const on = (html.match(/class="pick on"[\s\S]{0,90}?data-id="[a-z_]+"/g) || [])
    .map((m) => m.slice(m.lastIndexOf('data-id="') + 9, -1));
  const want = A.Run.DEFAULT_PICKS.slice().sort().join(',');
  return on.slice().sort().join(',') === want ? '' : 'on: ' + on.join(',') + ', want ' + want;
});

behaves('an anchor says it is every day rather than showing a ramp to itself', () => {
  const html = renderRoute('run');
  const i = html.indexOf('data-id="vitamins"');
  const card = html.slice(i, i + 400);
  if (card.indexOf('every day') < 0) return 'no anchor wording';
  return card.indexOf('→') < 0 ? '' : 'an anchor drawn as a ramp from 1 to 1';
});

/* A short selection is a real one once the user is choosing. A run of two fails
   `validate` for min_habits, and `repair` cannot fix it — its loop only removes. */
behaves('too few picks is filled to the floor rather than shipping a broken run', () => {
  const run = A.Run.buildRun(S.today(), 45, ['vitamins', 'floss']);
  if (A.Run.validate(run).length) return 'invalid: ' + A.Run.validate(run).map((v) => v.kind).join(',');
  if (run.habits.length < A.Run.MIN_HABITS) return 'still under the floor';
  return run.habits.some((p) => p.habitId === 'vitamins') ? '' : 'it dropped what the user actually chose';
});

behaves('picks nobody can honour still produce a run somebody can do', () => {
  const run = A.Run.buildRun(S.today(), 45, ['moon_bathing', 'astral_projection']);
  return A.Run.validate(run).length === 0 && run.habits.length >= A.Run.MIN_HABITS
    ? '' : 'an all-unknown selection did not fall back to something valid';
});

behaves('and the four self-care habits together are a run that validates', () => {
  const run = A.Run.buildRun(S.today(), 45, ['vitamins', 'floss', 'brush_teeth', 'skincare']);
  if (A.Run.validate(run).length) return A.Run.validate(run).map((v) => v.kind).join(',');
  return run.habits.length === 4 ? '' : 'it did not keep all four';
});

/* `buildRun` repairs rather than refusing, so a selection that does not fit
   comes back smaller. A start screen that quietly returned four of seven would
   be the app deciding for the user without saying so — app.js names what went,
   and this is the arithmetic it names it from. */
behaves('a selection too heavy for the budget comes back smaller, knowably', () => {
  const picks = ['course', 'write', 'language', 'mobility', 'sunlight'];
  const run = A.Run.buildRun(S.today(), 30, picks);
  const got = run.habits.map((p) => p.habitId);
  const dropped = picks.filter((id) => got.indexOf(id) < 0);
  if (!dropped.length) return 'five heavy habits fitted a 30 minute budget, which cannot be right';
  return A.Run.validate(run).length === 0 ? '' : 'and what came back is still infeasible';
});


/* The selection used to live in the checkboxes themselves. `render()` replaces
   the whole of `#view` on every store commit, so anything written to a goal, a
   habit or the journal while somebody was choosing wiped their picks back to
   the defaults — silently, and only noticeable once the run started with the
   wrong habits in it. */
behaves('a selection survives a re-render, and a store write is a re-render', () => {
  S.resetAll();
  UI.resetRunPicks();
  /* Two habits that are NOT defaults, so toggling turns them ON. `vitamins` and
     `floss` used to sit here and became defaults when the catalog was trimmed,
     which quietly inverted what this test was doing. */
  UI.toggleRunPick('skincare');
  UI.toggleRunPick('sunlight');
  UI.toggleRunPick('walk');                       // one of the defaults, off
  const chosen = UI.runPicks().slice().sort().join(',');

  S.setJournal(S.today(), { text: 'something else entirely' });   // commits
  renderRoute('run');
  if (UI.runPicks().slice().sort().join(',') !== chosen) return 'the picks changed under a commit';

  const html = renderRoute('run');
  if (html.indexOf('data-id="skincare"') < 0) return 'skincare is not offered at all';
  const on = (html.match(/class="pick on"[\s\S]{0,90}?data-id="[a-z_]+"/g) || [])
    .map((m) => m.slice(m.lastIndexOf('data-id="') + 9, -1));
  if (on.indexOf('skincare') < 0 || on.indexOf('sunlight') < 0) return 'chosen habits are not drawn as chosen';
  return on.indexOf('walk') < 0 ? '' : 'a de-selected habit is still drawn as chosen';
});

behaves('and starting the run uses exactly that selection', () => {
  const chosen = UI.runPicks();
  // Budget high enough that `repair` has no reason to trim: the claim under
  // test is that the picks reach the run, not what a tight budget does to them.
  S.startRun(chosen, 150);
  const got = S.run().habits.map((p) => p.habitId).sort().join(',');
  return got === chosen.slice().sort().join(',') ? '' : 'started with ' + got;
});

behaves('the button says how many are chosen, so the count is never a surprise', () => {
  S.resetAll();
  UI.resetRunPicks();
  const html = renderRoute('run');
  return html.indexOf(A.Run.DEFAULT_PICKS.length + ' chosen') > 0
    ? '' : 'the start button does not say how many';
});

behaves('with no run, the screen says what it costs before what it gives', () => {
  S.resetAll();
  UI.resetRunPicks();
  const html = renderRoute('run');
  if (html.indexOf('run-start') < 0) return 'no way to start one';
  if (html.indexOf('id="run_budget"') < 0) return 'no way to say how many minutes';
  // The catalog is the choice: no questions in front of it.
  if (html.indexOf('run-answer') >= 0) return 'the intake came back';
  return html.indexOf('separate from your goals') > 0 ? '' : 'it does not say the goals are untouched';
});

behaves('a running run lists what today asks', () => {
  S.startRun(['walk', 'stretch', 'language'], 90);
  const html = renderRoute('run');
  if (html.indexOf('class="daynum"') < 0) return 'no day counter';
  if (html.indexOf('DAY <b>1</b>') < 0) return 'not on day 1';
  return html.indexOf('data-act="run-tick"') > 0 || html.indexOf('on purpose') > 0
    ? '' : 'neither a habit to tick nor an explanation of why there is none';
});

/* A render must not change data. Calling the store's check-in from `renderRun`
   was a write during a render and a hang besides: `commit` re-renders, the
   render checked in again, and softening does not change the logs — so
   `needsIntervention` never clears and the loop never ends. It hung on the Run
   screen for exactly the user it was built to help. */
behaves('rendering the run changes nothing in the store', () => {
  const run = S.run();
  run.startDate = A.addDays(S.today(), -29);
  for (let d = 1; d < 30; d++) run.log[d] = RunE.recordDay(run, d, []);   // missed everything
  S.commit({ type: 'fixture' });
  if (!RunE.diagnose(S.run(), S.runToday()).needsIntervention) return 'the fixture is not struggling';

  const before = JSON.stringify(S.get());
  renderRoute('run');
  renderRoute('run');
  return JSON.stringify(S.get()) === before ? '' : 'the render wrote to the store';
});

behaves('and the patch it reports is one the check-in already made', () => {
  const out = S.runCheckIn();
  if (!out || !out.patched) return 'the check-in did not step in for a struggling run';
  const html = renderRoute('run');
  if (html.indexOf('eased off') < 0) return 'the screen does not say it eased off';
  // Once a day: a second call is a no-op, so a re-render cannot re-patch.
  return S.runCheckIn() === null ? '' : 'the check-in ran twice in one day';
});

behaves('a struggling run is offered nothing extra while it is being eased', () => {
  const html = renderRoute('run');
  return html.indexOf('What you could take on') < 0 ? '' : 'it offered more work to someone slipping';
});

behaves('a run that is being kept is offered something, with its reasons', () => {
  S.resetAll();
  S.startRun(['walk', 'stretch', 'language'], 90);
  const run = S.run();
  run.startDate = A.addDays(S.today(), -29);
  for (let d = 1; d < 30; d++) {
    run.log[d] = RunE.recordDay(run, d, run.habits.map((p) => p.habitId));
  }
  S.commit({ type: 'fixture' });
  const html = renderRoute('run');
  if (html.indexOf('What you could take on') < 0) return 'nothing offered to a 100% user';
  if (html.indexOf('data-act="run-accept"') < 0) return 'no way to accept it';
  return html.indexOf('<li>') > 0 ? '' : 'a suggestion with no reasons is one you have to take on faith';
});

behaves('a finished run stops asking for anything', () => {
  S.run().startDate = A.addDays(S.today(), -80);
  S.commit({ type: 'fixture' });
  const html = renderRoute('run');
  if (html.indexOf('run is over') < 0) return 'it does not say the run is over';
  return html.indexOf('data-act="run-tick"') < 0 ? '' : 'it still asks for habits after day 66';
});

/* The run screen showed today and what was still coming, and nothing about what
   had happened — sixty-five days of record with no way to look at them. */
behaves('a running run draws all 66 of its days', () => {
  S.resetAll();
  S.startRun(['walk', 'stretch', 'language'], 90, true);
  const run = S.run();
  run.startDate = A.addDays(S.today(), -9);          // day 10
  const ids = run.habits.map((p) => p.habitId);
  run.log[1] = RunE.recordDay(run, 1, ids);          // kept
  run.log[2] = RunE.recordDay(run, 2, ids.slice(0, 1));  // part
  run.log[3] = RunE.recordDay(run, 3, []);           // opened, nothing done
  // day 4 deliberately left with no record at all
  S.commit({ type: 'fixture' });

  const html = renderRoute('run');
  const cells = html.match(/class="lat [a-z]+"/g) || [];
  if (cells.length !== RunE.RUN_DAYS) return cells.length + ' cells, want ' + RunE.RUN_DAYS;
  return html.indexOf('The whole run') > 0 ? '' : 'the section is not headed';
});

/* The invariant, drawn. A day the user never opened the app on is a day we know
   nothing about, and the run must not retroactively decide they failed it —
   `computeDayStatus` already refuses to, and a picture that disagreed with the
   streak would be the more believable of the two. */
behaves('a day nobody opened is not painted as a missed one', () => {
  const html = renderRoute('run');
  const at = (d) => (html.match(new RegExp('class="lat ([a-z]+)" title="Day ' + d + ' ')) || [])[1];
  if (at(1) !== 'kept') return 'day 1 drawn as ' + at(1);
  if (at(2) !== 'part') return 'day 2 drawn as ' + at(2);
  if (at(3) !== 'missed') return 'day 3 drawn as ' + at(3);
  if (at(4) !== 'unopened') return 'day 4 drawn as ' + at(4) + ', not unopened';
  if (at(10) !== 'today') return 'day 10 drawn as ' + at(10);
  return at(11) === 'ahead' ? '' : 'day 11 drawn as ' + at(11);
});

/* Six shades of one palette is a chart that stops meaning anything on a phone
   in daylight, and the guidelines forbid meaning carried by colour alone. */
behaves('and the same counts are stated in words, not only in colour', () => {
  const html = renderRoute('run');
  const want = ['1 kept', '1 part of it', '1 missed', 'not opened', 'to come'];
  const absent = want.filter((s) => html.indexOf(s) < 0);
  return absent.length ? 'the tally never says: ' + absent.join(', ') : '';
});

behaves('the phases are named with their days, and the current one marked', () => {
  const html = renderRoute('run');
  const missing = RunE.PHASES.filter((p) => html.indexOf('day ' + p.first + '–' + p.last) < 0);
  if (missing.length) return 'no range for: ' + missing.map((p) => p.name).join(', ');
  if (html.indexOf('latphase is-now') < 0) return 'no phase is marked as the current one';
  return (html.match(/latphase is-now/g) || []).length === 1 ? '' : 'more than one phase is "now"';
});

/* "Read arrived on day 8" is the half of the schedule that explains the lattice
   above it, and it was the half the old "Still to come" list left out. */
behaves('the ladder says when each habit joined, past ones included', () => {
  const html = renderRoute('run');
  if (html.indexOf('What is in it') < 0) return 'no ladder';
  if (html.indexOf('started day 1') < 0) return 'it does not say when a habit already running began';
  return html.indexOf('Still to come') < 0 ? '' : 'the future half is still listed twice';
});

/* Rule 1 of project.md: a goal runs from where the user actually is. A fresh
   install seeds five and renders them as instructions, and until this banner
   nothing said they were defaults. */
behaves('a fresh install is told the seeded numbers are not its own', () => {
  S.resetAll();
  const html = renderRoute('today');
  if (html.indexOf('starting numbers, not yours') < 0) return 'nothing says the numbers are defaults';
  if (html.indexOf('data-nav="plan"') < 0) return 'it does not offer the screen that fixes it';
  return html.indexOf('data-act="starting-ack"') > 0 ? '' : 'it cannot be dismissed';
});

behaves('and dismissing it is remembered, without a new flag', () => {
  S.acknowledgeStart();
  const html = renderRoute('today');
  if (html.indexOf('starting numbers, not yours') >= 0) return 'it came back after being dismissed';
  return S.get().meta.onboarded === true ? '' : 'it did not reuse the inert onboarded flag';
});

/* It must never bury the storage-failure banners, which are the only route back
   to data the app could not read. */
behaves('it stays out of the way when something is actually wrong', () => {
  S.resetAll();
  S.get().meta.storageError = 'unreadable';
  S.commit({ type: 'fixture' });
  const html = renderRoute('today');
  S.get().meta.storageError = null;
  S.commit({ type: 'fixture' });
  if (html.indexOf('data-act="download-unreadable"') < 0) return 'the recovery banner is gone';
  return html.indexOf('starting numbers, not yours') < 0
    ? '' : 'it crowds the banner offering the user their data back';
});

behaves('and "Re-baseline" is not the word the user is given', () => {
  S.resetAll();
  sheetBody.innerHTML = '';
  UI.openGoalDetail(S.activeGoals()[0].id);
  const html = sheetBody.innerHTML;
  if (/Re-baseline/.test(html)) return 'the goal detail still says Re-baseline';
  return html.indexOf('Move the starting point') > 0 ? '' : 'no plain-language control at all';
});

/* Every XP figure goes through one formatter, which exists because a card
   showed "12,480" beside "1240 / 2200". It was being called in one place of
   seven.

   This checks the RENDERED page rather than the source. The first version of it
   scanned ui.js for `${…} XP` without `fmtXp` and passed happily when a raw
   figure was put back, because the expression it needed to catch —
   `${prog.into}` — contains no "xp" for the pattern to find. A guard that
   cannot fail is worse than none, so this looks at what the user actually sees:
   any number printed next to "XP" that is four digits or more must carry a
   thousands separator. */
behaves('no XP figure is printed unformatted beside a formatted one', () => {
  /* Build enough XP that four-digit figures actually render — the first version
     of this passed because the state it happened to run against had under a
     thousand, which is a guard proving nothing. */
  S.resetAll();
  for (let i = 1; i <= 60; i++) {
    const k = A.addDays(S.today(), -i);
    S.ensureLog(k);
    S.completeAll(k);
  }
  S.commit({ type: 'fixture' });
  if (S.progress().xp < 1000) return 'the fixture only reaches ' + S.progress().xp + ' XP, so this proves nothing';

  const seen = [];
  ['progress', 'rewards', 'today'].forEach((route) => {
    const html = renderRoute(route);
    (html.match(/([\d,]+)\s*XP/g) || []).forEach((m) => seen.push([route, m.trim()]));
  });
  if (!seen.length) return 'no XP figure rendered at all — the fixture proves nothing';
  const bare = seen.filter(([, m]) => /^\d{4,}/.test(m));
  return bare.length ? 'unformatted: ' + bare.map((x) => x.join(' → ')).join(', ') : '';
});

/* The run's habit lists were bare rows against the viewport while every other
   list in the app lives in a card. */
behaves('the run lists its habits in a card, like every other list', () => {
  S.resetAll();
  S.startRun(['walk', 'stretch', 'vitamins', 'floss'], 90, true);
  const html = renderRoute('run');
  if (html.indexOf('runlist-card') < 0) return 'the ladder is still a bare list';
  sheetBody.innerHTML = '';
  UI.openRunAdd();
  return sheetBody.innerHTML.indexOf('runlist-card') > 0 ? '' : 'the add sheet is still a bare list';
});

/* Two features used to be called "the run": the fixed-length countdown and the
   66-day habit run. Both printed a day count out of 66 and both had an "End the
   run" that meant different, irreversible things — one archives a countdown,
   the other erases 66 days of habit record. The countdown was renamed. */
behaves('the countdown and the 66-day run are not both called "the run"', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  // Strip comments: this file explains the collision it is guarding against.
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const src = strip(ui) + strip(app);
  const bad = [];
  // The countdown must not describe itself as a run anywhere the user can read.
  [/Start a run/, /Start the run<\/button>/, /'End the run'/, /Finished runs/,
   /No run in progress/, /End this run early/].forEach((re) => {
    if (re.test(src)) bad.push(String(re));
  });
  if (bad.length) return 'the countdown still calls itself a run: ' + bad.join(', ');
  // And the destructive confirm on the 66-day run must name which run it means.
  return /End the 66-day run\?/.test(src) ? '' : 'the end confirm does not say which run it means';
});

behaves('and More offers them as two clearly different things', () => {
  const html = renderRoute('more');
  if (html.indexOf('>Countdown<') < 0) return 'no countdown section';
  if (html.indexOf('The 66-day run') < 0) return 'no 66-day run entry';
  return html.indexOf('>The run<') < 0 ? '' : 'something is still headed just "The run"';
});

/* Editing a run in progress. Adding is offered from the section that lists what
   is in it; removing is refused at the floor rather than offered and denied. */
behaves('the run says what is in it, and offers to add to it', () => {
  S.resetAll();
  S.startRun(['walk', 'stretch', 'vitamins', 'floss'], 90, true);
  const html = renderRoute('run');
  if (html.indexOf('data-act="run-add-open"') < 0) return 'no way to add a habit';
  const removes = (html.match(/data-act="run-remove"/g) || []).length;
  return removes === 4 ? '' : removes + ' remove controls for 4 habits';
});

behaves('the add sheet lists only habits not already in the run', () => {
  sheetBody.innerHTML = '';
  UI.openRunAdd();
  const html = sheetBody.innerHTML;
  const inRun = S.run().habits.map((p) => p.habitId);
  const offered = (html.match(/data-act="run-add" data-id="([a-z_]+)"/g) || [])
    .map((m) => m.slice(m.lastIndexOf('"', m.length - 2) + 1, -1));
  const dupes = offered.filter((id) => inRun.indexOf(id) >= 0);
  if (dupes.length) return 'offered something already in the run: ' + dupes.join(', ');
  return offered.length ? '' : 'nothing offered at all';
});

/* A control that is going to say no is better not drawn. */
behaves('at the habit floor, no removal is offered and the screen says why', () => {
  S.resetAll();
  S.startRun(['walk', 'stretch', 'vitamins'], 90, true);
  const html = renderRoute('run');
  if ((html.match(/data-act="run-remove"/g) || []).length) return 'it offers a removal it would refuse';
  return html.indexOf('at least ' + A.Run.MIN_HABITS + ' habits') > 0
    ? '' : 'it does not say why removal is unavailable';
});

behaves('a habit that has not joined yet says how long that is', () => {
  S.resetAll();
  S.startRun(['walk', 'stretch', 'language'], 90, false);   // eased in, so some start later
  const html = renderRoute('run');
  const later = S.run().habits.filter((p) => p.startDay > 1);
  if (!later.length) return 'the fixture has nothing starting later';
  const away = later[0].startDay - S.runToday();
  if (html.indexOf('starts day ' + later[0].startDay) < 0) return 'no start day for a habit still to come';
  return html.indexOf('in ' + away + (away === 1 ? ' day' : ' days')) > 0
    ? '' : 'it does not say how far off that is';
});

behaves('a finished run can still be looked back on', () => {
  S.run().startDate = A.addDays(S.today(), -80);
  S.commit({ type: 'fixture' });
  const html = renderRoute('run');
  if (html.indexOf('The whole run') < 0) return 'the lattice is gone the moment it is worth reading';
  if (html.indexOf('class="lat today"') >= 0) return 'a finished run still has a today';
  return html.indexOf('class="lat ahead"') < 0 ? '' : 'a finished run still has days ahead of it';
});

behaves('a run naming a habit this build lost says so, and shows the rest', () => {
  S.resetAll();
  S.startRun(['walk', 'stretch', 'language'], 90);
  S.run().habits.push({ habitId: 'moon_bathing', startDay: 1, scale: 1, frozenDay: null });
  S.commit({ type: 'fixture' });
  const html = renderRoute('run');
  if (html.indexOf('does not have') < 0) return 'it hides the fact that something is missing';
  return html.indexOf('Nothing has been deleted') > 0 ? '' : 'it does not say the data is safe';
});

behaves('Today carries the run only while one is running', () => {
  S.resetAll();
  const without = renderRoute('today');
  if (without.indexOf('The run ·') >= 0) return 'a run section with no run';
  S.startRun(['walk', 'stretch', 'language'], 90);
  const withRun = renderRoute('today');
  if (withRun.indexOf('The run ·') < 0) return 'no run section with a run';
  return withRun.indexOf('data-nav="run"') > 0 ? '' : 'no way through to the whole run';
});

behaves('More offers the run beside Rewards', () => {
  const html = renderRoute('more');
  return html.indexOf('data-nav="run"') > 0 ? '' : 'the run is unreachable from More';
});

behaves('the value sheet says what today asked, not what the run asks now', () => {
  S.resetAll();
  S.startRun(['walk', 'stretch', 'language'], 90);
  const id = S.run().habits[0].habitId;
  S.toggleRunHabit(id);                       // freezes today's ask into the record
  const frozen = S.run().log[1][id].asked;
  S.run().habits[0].scale = 0.25;             // the run now asks for less
  S.commit({ type: 'fixture' });
  sheetBody.innerHTML = '';
  UI.openRunValue(id);
  const html = sheetBody.innerHTML;
  if (html.indexOf('run-save-value') < 0) return 'no way to save a measurement';
  return html.indexOf(String(frozen)) > 0 ? '' : 'the sheet shows a number today never asked for';
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
