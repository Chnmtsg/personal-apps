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
for (const f of ['data.js', 'program.js', 'goals.js', 'run.js', 'store.js', 'ui.js']) {
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
const ROUTES = ['today', 'plan', 'read', 'progress', 'rewards', 'more'];

function renderRoute(r) {
  view.innerHTML = '';
  UI.go(r);
  return view.innerHTML;
}

/* ---------- 1. empty state ---------- */
S.load();
console.log('\nfresh install');
ROUTES.forEach((r) => check(r, () => renderRoute(r)));

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

sheet('onboarding', () => UI.openOnboarding());
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

behaves('a healthy account shows no such banner', () => {
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

behaves('the goal cards come before the streak and XP block', () => {
  const html = renderRoute('today');
  const goals = html.indexOf('class="gcard');
  const progress = html.indexOf('Where you are');
  if (goals < 0) return 'no goal cards on Today';
  if (progress < 0) return 'no progress section on Today';
  return goals < progress ? '' : 'the scoreboard still comes first';
});

behaves('the day counter leads, with the segments under it', () => {
  const html = renderRoute('today');
  const day = html.indexOf('class="daynum"');
  const segs = html.indexOf('class="segbar"');
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
  const level = html.indexOf('<h2>Level</h2>');
  if (real < 0) return 'no real ledger on Stats';
  if (level < 0) return 'the level card vanished entirely — it should be demoted, not deleted';
  return real < level ? '' : 'the level card still comes first';
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
  if (html.indexOf('Your rewards') < 0) return 'no custom rewards section';
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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
