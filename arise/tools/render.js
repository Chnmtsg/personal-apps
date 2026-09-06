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
for (const f of ['data.js', 'program.js', 'photos.js', 'store.js', 'ui.js']) {
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
const ROUTES = ['today', 'plan', 'progress', 'rewards', 'more'];

function renderRoute(r) {
  view.innerHTML = '';
  UI.go(r);
  return view.innerHTML;
}

/* ---------- 1. empty state ---------- */
S.load();
console.log('\nfresh install');
ROUTES.forEach((r) => check(r, () => renderRoute(r)));

/* ---------- 2. a lived-in account ----------

   The fixture has to carry LOGGED SETS, not only ticks. Every number this app
   draws now comes out of `log.perf`, so a fixture that only completed days
   would sweep every screen while leaving the whole subject of the app
   untouched — which is exactly the gap the emoji purge shipped through once. */
console.log('\npopulated account');
const t = S.today();
const ex0 = S.get().exercises[0].id;
for (let d = 0; d <= 6; d++) if (!S.get().plan[d].length) S.addToPlan(d, ex0);

for (let i = 30; i >= 0; i--) {
  const k = A.addDays(t, -i);
  if (i % 11 === 0 && i !== 0) continue; // leave gaps so "missed" renders
  S.ensureLog(k);
  S.dayPlan(k).forEach((item) => {
    const ex = S.exerciseById(item.exerciseId);
    const shape = A.logShape(ex);
    if (shape === 'reps') {
      const sets = Math.max(1, Number(item.sets) || 3);
      for (let n = 0; n < sets; n++) {
        // Climbing a little over the month, so a chart has a shape to draw.
        S.addSet(k, item.id, 40 + Math.round((30 - i) / 6) * 2.5, Number(item.reps) || 8);
      }
    } else if (shape === 'time') {
      S.setAmount(k, item.id, { min: Number(item.minutes) || 10 });
    } else {
      S.setAmount(k, item.id, { km: Number(item.km) || 3, min: 22 });
    }
  });
  S.completeAll(k);
}
S.addCustomReward({ name: 'New shoes', days: 14 });
ROUTES.forEach((r) => check(r, () => renderRoute(r)));

console.log('\npast + future days');
UI.setViewDate(A.addDays(t, -3));
check('today (backfill view)', () => renderRoute('today'));
UI.setViewDate(A.addDays(t, 1));
check('today (future, read-only)', () => renderRoute('today'));
UI.setViewDate(t);

console.log('\nsheets');
const sheet = (name, fn) =>
  check(name, () => {
    sheetBody.innerHTML = '';
    fn();
    return sheetBody.innerHTML;
  });

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
sheet('text prompt', () => UI.openTextPrompt({ title: 'Note on this exercise', label: 'Note', placeholder: 'e.g. left shoulder tight', confirmLabel: 'Save note' }));
sheet('reward editor (new)', () => UI.openRewardEditor(null));
sheet('reward editor (existing)', () => UI.openRewardEditor(S.customRewards()[0].id));

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

/* And every day of the OTHER context. The sweep above only ever saw the site
   week, because that is what a fresh install lays down — so the six home
   sessions, which are the half with the cables and machines in them, had never
   been rendered by anything. */
S.reinstallProgram('home');
[1, 2, 3, 4, 5, 6, 0].forEach((d) => {
  let k = t;
  for (let i = 0; i < 7 && A.weekday(k) !== d; i++) k = A.addDays(k, 1);
  UI.setViewDate(k);
  check('home · ' + A.DAY_NAMES[d], () => renderRoute('today'));
});
UI.setViewDate(t);
S.resetAll();

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

console.log('\nuser-controlled icons are escaped, not injected');

/* Icons are user text: the editors cap them at 4 characters, but importJson()
   accepts arbitrary JSON, so a hand-edited backup is a real injection path.
   The app renders no <img> of its own, which makes it a clean sentinel. */
S.resetAll();
const XSS = '<img src=x onerror="alert(1)">';
const hostileEx = S.get().exercises[0];
S.updateExercise(hostileEx.id, { icon: XSS, name: XSS });
S.addCustomReward({ name: XSS, icon: XSS, days: 7 });
for (let d = 0; d <= 6; d++) S.addToPlan(d, hostileEx.id);
S.setPerfNote(S.today(), S.dayPlan(S.today())[0].id, XSS);
UI.setViewDate(S.today());

behaves('no view renders a raw tag from an exercise, a note or a reward', () => {
  const dirty = ROUTES.filter((r) => renderRoute(r).indexOf('<img') >= 0);
  return dirty.length ? `raw markup reached: ${dirty.join(', ')}` : '';
});

behaves('the exercise picker escapes icons too', () => {
  sheetBody.innerHTML = '';
  UI.openPicker(1);
  return sheetBody.innerHTML.indexOf('<img') >= 0 ? 'raw markup reached the picker' : '';
});

behaves('the escaped icon is still rendered, just inert', () => {
  /* The sentinel used to be the habit row on More, which no longer draws a
     glyph at all — every habit was getting the same stock tick, which carried
     nothing and disagreed with how Today draws the same habit. The exercise
     library still renders a user-chosen icon, so it is the surface that can
     still prove "escaped, not swallowed". It lives behind a fold. */
  const wasOpen = UI.libOpen();
  if (!wasOpen) UI.toggleLibOpen();
  const html = renderRoute('more');
  if (!wasOpen) UI.toggleLibOpen();
  return html.indexOf('&lt;img') >= 0 ? '' : 'the icon vanished instead of being escaped';
});

/* The emoji purge was designed, documented and half-finished once already:
   `exGlyph` suppressed every seed exercise glyph while its twin `goalGlyph` was
   written and never called from anywhere, so the rule held on one screen and not
   the other. This is the guard against it drifting back.

   Pictographs and dingbats only. The monochrome marks the app uses as chrome —
   the tick, the cross, the arrows, the chevrons — are deliberately outside this
   range: they take `currentColor` and read as text rather than as pictures. */
const PICTO = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2712}\u{2718}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

behaves('no view types an emoji where the icon table exists', () => {
  S.resetAll();
  UI.setViewDate(S.today());
  const dirty = ROUTES.filter((r) => PICTO.test(renderRoute(r)));
  return dirty.length ? 'emoji still rendered on: ' + dirty.join(', ') : '';
});

/* The purge's weakest point, and it took a rename to find: `exGlyph` decided
   "the user chose this" with a lookup keyed by NAME, so renaming a seeded
   exercise made its own glyph — which nobody chose — pass the test and render.
   The route sweep above cannot catch it, because it renders seed names. */
behaves('renaming a seeded exercise does not put its glyph back on screen', () => {
  S.resetAll();
  const seeded = S.get().exercises.find((e) => e.icon && A.SEED_EXERCISES.some((x) => x.name === e.name));
  if (!seeded) return 'no seeded exercise carries a glyph to check';
  S.updateExercise(seeded.id, { name: seeded.name + ' renamed' });
  const day = A.weekday(S.today());
  S.get().plan[day] = [];
  S.commit({ type: 'fixture' });
  S.addToPlan(day, seeded.id);
  UI.setViewDate(S.today());
  const html = renderRoute('today');
  return PICTO.test(html) ? 'a seed glyph came back after a rename' : '';
});

behaves('while a glyph the user actually typed still survives a rename', () => {
  const mine = S.addExercise({ name: 'Mine', category: 'Other', unit: 'reps', sets: 3, reps: 10, icon: 'ZZ' });
  const day = A.weekday(S.today());
  S.get().plan[day] = [];
  S.commit({ type: 'fixture' });
  S.addToPlan(day, mine.id);
  const html = renderRoute('today');
  S.removeExercise(mine.id);
  /* The rule is "a glyph the user chose wins" — the fix must not turn into
     "no exercise may ever show a glyph". */
  return html.indexOf('ZZ') > 0 ? '' : 'a chosen glyph was suppressed along with the stock ones';
});

behaves('and neither do the editor sheets', () => {
  const item = S.get().plan[1][0] || S.get().plan[A.weekday(S.today())][0];
  const checks = [
    ['exercise editor', () => UI.openExerciseEditor(S.get().exercises[0].id)],
    ['reward editor', () => UI.openRewardEditor(null)],
    ['exercise picker', () => UI.openPicker(1)],
    ['plan item editor', () => UI.openPlanEditor(1, item.id)],
    ['how-to', () => UI.openExerciseHow(item.exerciseId, item)]
  ];
  const bad = checks
    .filter(([, open]) => {
      sheetBody.innerHTML = '';
      open();
      return PICTO.test(sheetBody.innerHTML);
    })
    .map(([name]) => name);
  return bad.length ? 'emoji in: ' + bad.join(', ') : '';
});

/* A form field that appears to do something and does nothing is worse than no
   field. The goal editor offered an Icon input whose value rendered nowhere on
   Today or Plan, because both draw the mark from the goal's AREA. */
behaves('the editor offers no icon field, and saving still keeps the stored one', () => {
  const e = S.addExercise({ name: 'Icon test', category: 'Other', unit: 'reps', sets: 3, reps: 10, icon: 'X' });
  sheetBody.innerHTML = '';
  UI.openExerciseEditor(e.id);
  const html = sheetBody.innerHTML;
  const kept = S.exerciseById(e.id).icon;
  S.removeExercise(e.id);
  if (html.indexOf('id="e_icon"') >= 0) return 'the exercise editor still offers an inert icon field';
  /* Stored, not deleted: removing a stored field is the one thing this project's
     migration rules forbid. */
  return kept === 'X' ? '' : 'the stored icon was thrown away with the field';
});

/* Token discipline, asserted rather than reviewed. Each of these drifted once
   into the literals the scale and the spacing system were introduced to end, and
   a review found them rather than a test. */
behaves('every icon beside a label is sized in em, not pixels', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  /* The only rules allowed pixels are fixed boxes a graphic sits inside, never
     an icon that has to track the text beside it. */
  const BOXES = /(-plate|\.medal)\s+\.ico/;
  /* `.ico` as a whole class, not as a prefix: `.icon-btn` contains those four
     characters and its 44px is the TOUCH TARGET, which must stay literal. */
  const bad = (css.match(/[^{}]*\.ico(?![\w-])[^{}]*\{[^}]*\}/g) || [])
    .filter((r) => /width:\s*\d+px/.test(r) && !BOXES.test(r))
    .map((r) => r.split('{')[0].trim());
  return bad.length ? 'pixel-sized icons: ' + bad.join(' · ') : '';
});

behaves('and no text size is off the scale', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  /* The four glyph BOXES are iconography and are exempt by name. */
  const GLYPH = /\.empty \.big|\.item \.emoji|\.plan-main \.emoji|\.myreward-icon/;
  const bad = (css.match(/[^{}]*\{[^}]*font-size:\s*\d+px[^}]*\}/g) || [])
    .filter((r) => !GLYPH.test(r.split('{')[0]))
    .map((r) => r.split('{')[0].trim());
  return bad.length ? 'off-scale text: ' + bad.join(' · ') : '';
});

behaves('and the view layer carries no literal size or padding', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8');
  const bad = (src.match(/style="[^"]*(?:font-size|padding):\s*\d+px[^"]*"/g) || []);
  return bad.length ? 'literals in js/ui.js: ' + bad.slice(0, 3).join(' · ') : '';
});

behaves('and a control strip wraps rather than scrolling out of reach', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /\.cat-tabs\s*\{([^}]*)\}/.exec(css);
  if (!rule) return 'the category filter rule is gone';
  if (/overflow-x:\s*auto/.test(rule[1])) return 'the category filter still scrolls sideways';
  return /flex-wrap:\s*wrap/.test(rule[1]) ? '' : 'it neither wraps nor scrolls';
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

/* Emptying `state.plan` is not enough once the day has been opened: `ensureLog`
   freezes that day's exercise list, and `dayPlan` answers from the frozen copy.
   That is the invariant working — a day you have started is never re-cast — so
   the fixture has to drop the log as well as the weekly plan. */
const wkDay = A.weekday(S.today());
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

behaves('a rest day says so on the heading rather than opening onto nothing', () => {
  const restore = restDayFixture();
  const html = renderRoute('today');
  restore();
  return html.indexOf('Rest day') > 0 ? '' : 'a day with no exercises gives no summary';
});

/* The row lost a line, so the dose has to still be on it — a workout row that
   does not say how much is not a workout row. */
behaves('an exercise row states what was asked as well as what it is', () => {
  S.get().exercises.slice(0, 3).forEach((e) => S.addToPlan(wkDay, e.id));
  const html = renderRoute('today');
  const first = S.dayPlan(S.today())[0];
  const ex = S.exerciseById(first.exerciseId);
  if (html.indexOf('class="exercise-dose"') < 0) return 'no prescription column at all';
  if (html.indexOf(ex.name) < 0) return 'the exercise name went with it';
  return html.indexOf(A.targetPhrase(first, ex)) > 0 ? '' : 'the prescription is not the plan item\'s own';
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
behaves('Today carries no scoreboard at all — the session is the whole screen', () => {
  const html = renderRoute('today');
  if (html.indexOf('class="exercise ') < 0) return 'no exercise cards on Today';
  if (html.indexOf('class="hero-stats"') >= 0) return 'the three-figure scoreboard is back on Today';
  const rails = (html.match(/class="week-strip/g) || []).length;
  return rails === 1 ? '' : `${rails} week strips on Today — the rail is meant to be the only one`;
});

behaves('the day counter leads, with the session under it', () => {
  const html = renderRoute('today');
  const day = html.indexOf('class="daynum"');
  const rail = html.indexOf('class="week-strip');
  const cards = html.indexOf('class="exercise ');
  if (day < 0) return 'no day counter';
  if (rail < 0) return 'no seven-day rail';
  return day < rail && rail < cards ? '' : `order day=${day} rail=${rail} cards=${cards}`;
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
  const realDayVolume = S.dayVolume;
  S.dayVolume = () => {
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
    S.dayVolume = realDayVolume;
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

console.log('\nfacts outrank points');

S.resetAll();
UI.setViewDate(S.today());

behaves('Today carries no XP, level or rank', () => {
  const html = renderRoute('today');
  const bad = ['total XP', 'XP</span>', 'Level ', 'Lv '].filter((s) => html.indexOf(s) >= 0);
  return bad.length ? `still showing: ${bad.join(', ')}` : '';
});

behaves('and shows sessions kept instead', () => {
  const html = renderRoute('today');
  return /\d+ sessions? kept/.test(html) ? '' : 'no real total on Today';
});

/* Caught in a real browser rather than by either suite: the ledger read
   "1 sessions kept" and "1 days trained". A count and its noun are one string
   and have to agree. */
behaves('a count of one is not printed with a plural noun', () => {
  S.resetAll();
  UI.setViewDate(S.today());
  const d = A.weekday(S.today());
  const ex = S.get().exercises.find((e) => e.unit === 'reps');
  S.get().plan[d] = [];
  delete S.get().logs[S.today()];
  S.commit({ type: 'fixture' });
  S.addToPlan(d, ex.id);
  const item = S.dayPlan(S.today())[0];
  S.addSet(S.today(), item.id, 40, 8);
  S.completeAll(S.today());
  const pages = ['today', 'progress'].map(renderRoute).join(' ');
  if (pages.indexOf('kept') < 0) return 'the fixture rendered no ledger line at all';
  /* Tags stripped first. The count and its noun are often in two elements —
     '<b>1</b><span>days trained</span>' — so a match against the raw markup
     cannot see the pair, which is how the first version of this passed both of
     the bugs it was written for. What the READER sees is one string.

     And (^|[^0-9.]) rather than a word boundary, so "21 sessions" is not read
     as a one, and because a backslash-b written through a code generator has a
     way of arriving as a literal backspace. */
  const text = pages.replace(/<[^>]+>/g, ' ').replace(/[\s ]+/g, ' ');
  const bad = (text.match(/(?:^|[^0-9.])1 (?:sessions|days|lifts|sets|reps|exercises) [a-z]+/g) || []);
  return bad.length ? 'plural after a one: ' + bad.map((x) => x.trim()).join(', ') : '';
});

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
behaves('a deload week says so on Today, above everything else', () => {
  S.resetAll();
  UI.setViewDate(S.today());
  const off = renderRoute('today');
  if (off.indexOf('class="deload"') >= 0) return 'it announces a deload with the cycle switched off';
  /* Anchor the cycle so that this week IS the deload week, then look. */
  S.updateSettings({ deloadEveryWeeks: 4 });
  S.get().createdAt = A.addDays(A.weekStart(S.today()), -21);
  S.commit({ type: 'fixture' });
  const on = renderRoute('today');
  const isDeload = S.deloadWeek(S.today()).isDeload;
  S.updateSettings({ deloadEveryWeeks: 0 });
  if (!isDeload) return 'the fixture did not land on a deload week';
  if (on.indexOf('class="deload"') < 0) return 'the deload week is not announced';
  /* Order matters: on a deload week "never miss twice" must not be the first
     thing read, or the recovery instruction gets trained straight through. */
  const d = on.indexOf('class="deload"');
  const m = on.indexOf('class="misstwice"');
  return m < 0 || d < m ? '' : 'the miss-twice line comes before the deload notice';
});

behaves('the training week states a stopping rule, because the book gives none', () => {
  const html = renderRoute('plan');
  if (html.indexOf('sharp pain') < 0) return 'no stopping rule anywhere on the training screen';
  return html.indexOf('performance falling while effort rises') > 0
    ? '' : 'the overtraining signs are not stated';
});

behaves('Plan offers every context, and marks the one that is installed', () => {
  S.resetAll();
  const html = renderRoute('plan');
  const rows = (html.match(/data-act="program-install"/g) || []).length;
  if (rows !== A.PROGRAM_CONTEXTS.length) {
    return `${rows} install rows for ${A.PROGRAM_CONTEXTS.length} contexts`;
  }
  /* Each row has to carry WHICH context, or both install the same week and
     nothing looks wrong until you are on site running a barbell programme. */
  const missing = A.PROGRAM_CONTEXTS.filter((c) => html.indexOf('data-context="' + c.id + '"') < 0);
  if (missing.length) return 'rows with no context id: ' + missing.map((c) => c.id).join(', ');
  return html.indexOf('installed') > 0 ? '' : 'nothing says which one is on';
});

/* Plan had two subjects behind a segment. It has one now, so the training week
   must be the screen itself rather than a tab somebody has to find. */
behaves('Plan opens straight onto the training week', () => {
  const html = renderRoute('plan');
  if (html.indexOf('data-act="plan-tab"') >= 0) return 'Plan still carries a tab with one destination';
  const days = (html.match(/class="card flush plan-day/g) || []).length;
  return days === 7 ? '' : `${days} weekday cards, expected 7`;
});

console.log('\nreach');

S.resetAll();
UI.setViewDate(S.today());

behaves('Today pins what is left to a strip above the tab bar', () => {
  const html = renderRoute('today');
  if (html.indexOf('class="today-strip"') < 0) return 'no day strip';
  if (html.indexOf('left today') < 0) return 'the strip does not say what is left';
  return /today-strip[\s\S]*data-act="ex-focus"/.test(html) ? '' : 'the strip offers no way to act on it';
});

behaves('a kept day says so rather than asking for more', () => {
  const k = S.today();
  S.completeAll(k);
  const html = renderRoute('today');
  if (html.indexOf('Session done.') < 0) return 'a finished session still asks for something';
  return html.indexOf('data-act="ex-focus"') < 0 ? '' : 'it still offers an exercise to log';
});

behaves('a day being reviewed carries no strip — it is not today’s work', () => {
  UI.setViewDate(A.addDays(S.today(), -2));
  const html = renderRoute('today');
  UI.setViewDate(S.today());
  return html.indexOf('class="today-strip"') < 0 ? '' : 'a past day offers today’s action';
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
  if (tabs.length !== 4) return `the shell has ${tabs.length} tabs, not four`;
  const unknown = tabs.filter((t) => ROUTES.indexOf(t) < 0);
  return unknown.length ? `tabs with no route: ${unknown.join(', ')}` : '';
});

/* ---------- the 66-day run ---------- */
behaves('every state class the views emit is actually styled', () => {
  // Comments stripped first: this file explains the bug it is guarding against,
  // and a scan that reads prose reports the thing it is describing.
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const needed = [/* the set log — the block the app is now for */
                  '.exercise', '.exercise-head', '.exercise-tick', '.exercise-plate',
                  '.exercise-name', '.exercise-dose', '.exercise.is-done', '.exercise.locked',
                  '.setlist', '.setrow', '.setrow-n', '.setrow-main', '.setrow.is-editing',
                  '.setentry', '.setfield', '.setentry-x', '.setentry-go', '.setentry-cancel',
                  '.setmeta', '.setmeta-vol', '.setnote', '.setnote-add',
                  /* the shared chrome */
                  '.item', '.item.done', '.section-fold.is-open',
                  '.fold-main', '.block-head', '.how-photo img', '.how-photo-add',
                  '.chip-pick.on', '.segbar.tight',
                  /* the card system the screens are drawn in */
                  '.label', '.screenhead', '.headpill', '.dayhead-foot',
                  '.week-strip.rail .wd.on', '.footnote',
                  '.ledgercard', '.statcard', '.myreward.is-ready', '.btn.gold', '.promptrow',
                  '.linkrow', '.label.split',
                  '.misstwice', '.deload', '.cyclebar.is-deload',
                  '.spark', '.spark-svg', '.spark-name', '.spark-val',
                  /* the rest between sets */
                  '.today-strip.is-rest', '.rest-track', '.rest-track > i',
                  '.today-strip.is-rest.is-ready',
                  /* the tape and the scale */
                  '.bodyhead', '.bodyrate', '.bodychart', '.bodychart-foot',
                  '.tapeval', '.field.minifield'];
  const missing = needed.filter((sel) => css.indexOf(sel) < 0);
  if (missing.length) return 'no rule for: ' + missing.join(', ');
  return css.indexOf(':has(:checked)') < 0 ? '' : 'a dead :has(:checked) rule is still in the sheet';
});

/* ---------- the set log ----------

   The subject of the app, and the half neither of the other two suites can
   see: smoke.js proves the numbers are stored correctly and wire.js proves a
   tap reaches the store, but only this one can say the row actually draws what
   was written down. */
console.log('\nthe set log');

/* A clean weekday with one known lift on it, so every assertion below reads
   one row rather than whichever exercise the programme happened to put first. */
S.resetAll();
UI.setViewDate(S.today());
const logDay = A.weekday(S.today());
S.get().plan[logDay] = [];
delete S.get().logs[S.today()];
S.commit({ type: 'fixture' });
const benchEx = S.get().exercises.find((e) => e.unit === 'reps' && e.sets >= 3) || S.get().exercises[0];
const bwEx = S.addExercise({ name: 'Chin-ups', category: 'Strength', unit: 'reps', sets: 3, reps: 6 });
/* On every weekday, because a log freezes its day's exercise list the first
   time the day is opened — so "what did this lift weigh last time" needs the
   lift on yesterday's plan before yesterday is touched. That is the
   frozen-history invariant, not a quirk of the fixture. */
for (let d = 0; d <= 6; d++) {
  S.get().plan[d] = [];
  S.commit({ type: 'fixture' });
  S.addToPlan(d, benchEx.id, { sets: 3, reps: 8 });
  S.addToPlan(d, bwEx.id);
}
const benchItem = S.dayPlan(S.today())[0];

behaves('an exercise with nothing logged still offers the two boxes', () => {
  const html = renderRoute('today');
  if (html.indexOf('id="w_' + benchItem.id + '"') < 0) return 'no weight field';
  if (html.indexOf('id="r_' + benchItem.id + '"') < 0) return 'no reps field';
  if (html.indexOf('class="setlist"') >= 0) return 'an empty set list was drawn';
  return html.indexOf('data-act="log-set"') > 0 ? '' : 'nothing commits the set';
});

behaves('a logged set is drawn with its weight, its reps and its number', () => {
  S.addSet(S.today(), benchItem.id, 60, 8);
  const html = renderRoute('today');
  if (html.indexOf('class="setlist"') < 0) return 'no set list';
  if (html.indexOf('60 kg') < 0) return 'the weight is not on the row';
  return /setrow-main[^>]*>60 kg . 8</.test(html.replace(/\u00d7/g, '.')) ? '' : 'the row does not read as weight x reps';
});

behaves('and the volume it moved is stated, once', () => {
  const html = renderRoute('today');
  const hits = (html.match(/480 kg moved/g) || []).length;
  return hits === 1 ? '' : `${hits} volume lines for one 60 x 8 set`;
});

behaves('a bodyweight set is drawn as reps, never as 0 kg', () => {
  const item = S.dayPlan(S.today()).find((i) => i.exerciseId === bwEx.id);
  if (!item) return 'the bodyweight lift is not on the day';
  S.addSet(S.today(), item.id, null, 6);
  const html = renderRoute('today');
  // Not /0 kg/ — that matches inside "60 kg", which is how the first version of
  // this passed a bug and then failed a fix.
  if (/(^|[^\d.])0 kg/.test(html)) return 'a bodyweight set rendered as a zero-kilo one';
  return html.indexOf('6 reps') > 0 ? '' : 'the bodyweight set did not render at all';
});

behaves('the row says what the same lift weighed last time', () => {
  const y = A.addDays(S.today(), -1);
  S.ensureLog(y);
  const yItem = S.dayPlan(y).find((i) => i.exerciseId === benchEx.id);
  if (!yItem) return 'the fixture put the lift on one day only';
  S.addSet(y, yItem.id, 57.5, 8);
  UI.setViewDate(S.today());
  const html = renderRoute('today');
  return html.indexOf('Last time') > 0 && html.indexOf('57.5 kg') > 0
    ? '' : 'the previous session is not reported on the row';
});

behaves('and the boxes are pre-filled from it rather than left empty', () => {
  const fresh = A.addDays(S.today(), 0);
  const sug = S.suggestSet(fresh, benchItem.id);
  if (!sug) return 'no suggestion at all';
  return sug.weight != null && sug.reps > 0 ? '' : `nothing to prefill: ${JSON.stringify(sug)}`;
});

behaves('tapping a set puts it in the boxes to be corrected, not deleted', () => {
  UI.setEditSet(benchItem.id, 0);
  const html = renderRoute('today');
  UI.setEditSet(null);
  if (html.indexOf('setrow is-editing') < 0) return 'the row being corrected is not marked';
  if (html.indexOf('>Update<') < 0) return 'the button still says Log set';
  return html.indexOf('data-act="set-cancel"') > 0 ? '' : 'there is no way out of the correction';
});

behaves('a time exercise is asked for minutes, never for weight and reps', () => {
  const mob = S.get().exercises.find((e) => e.unit === 'time');
  if (!mob) return 'no time-based exercise in the library';
  S.get().plan[logDay] = [];
  delete S.get().logs[S.today()];
  S.commit({ type: 'fixture' });
  S.addToPlan(logDay, mob.id);
  const item = S.dayPlan(S.today())[0];
  const html = renderRoute('today');
  if (html.indexOf('id="min_' + item.id + '"') < 0) return 'no minutes field';
  if (html.indexOf('id="w_' + item.id + '"') >= 0) return 'a time exercise was asked for a weight';
  return html.indexOf('data-act="save-amount"') > 0 ? '' : 'nothing commits the amount';
});

behaves('and a distance exercise is asked for kilometres as well', () => {
  const run = S.get().exercises.find((e) => e.unit === 'distance');
  if (!run) return 'no distance exercise in the library';
  S.get().plan[logDay] = [];
  delete S.get().logs[S.today()];
  S.commit({ type: 'fixture' });
  S.addToPlan(logDay, run.id);
  const item = S.dayPlan(S.today())[0];
  const html = renderRoute('today');
  if (html.indexOf('id="km_' + item.id + '"') < 0) return 'no distance field';
  return html.indexOf('id="min_' + item.id + '"') > 0 ? '' : 'no time to go with the distance';
});

behaves('a future day is shown its prescription and offered no boxes', () => {
  UI.setViewDate(A.addDays(S.today(), 1));
  const html = renderRoute('today');
  UI.setViewDate(S.today());
  if (html.indexOf('class="setentry"') >= 0) return 'a future day can be logged into';
  return html.indexOf('exercise-dose') > 0 ? '' : 'and it does not even say what is planned';
});

behaves('switching to pounds re-reads the record rather than re-valuing it', () => {
  S.resetAll();
  UI.setViewDate(S.today());
  const d = A.weekday(S.today());
  S.get().plan[d] = [];
  delete S.get().logs[S.today()];
  S.commit({ type: 'fixture' });
  const ex = S.get().exercises.find((e) => e.unit === 'reps');
  S.addToPlan(d, ex.id);
  const item = S.dayPlan(S.today())[0];
  S.addSet(S.today(), item.id, 100, 5);
  S.updateSettings({ weightUnit: 'lb' });
  const html = renderRoute('today');
  S.updateSettings({ weightUnit: 'kg' });
  if (html.indexOf('100 kg') >= 0) return 'the kilo figure is still on screen in pound mode';
  /* 100 kg is 220.5 lb. The stored number never moved — only the reading did. */
  return html.indexOf('220.5 lb') > 0 ? '' : 'the set did not convert for display';
});

behaves('Stats charts the top set per session, one series and no legend box', () => {
  S.resetAll();
  UI.setViewDate(S.today());
  const d = A.weekday(S.today());
  const ex = S.get().exercises.find((e) => e.unit === 'reps');
  for (let i = 21; i >= 0; i -= 7) {
    const k = A.addDays(S.today(), -i);
    if (A.weekday(k) !== d) continue;
    S.ensureLog(k);
    const item = S.dayPlan(k).find((x) => x.exerciseId === ex.id) || S.dayPlan(k)[0];
    if (!item) continue;
    S.addSet(k, item.id, 50 + (21 - i), 8);
    S.addSet(k, item.id, 50 + (21 - i), 8);
  }
  const html = renderRoute('progress');
  if (html.indexOf('class="spark"') < 0) return 'no per-exercise chart at all';
  if (html.indexOf('var(--chart-did)') < 0) return 'the columns are not drawn in the validated mark colour';
  /* One series carries its identity in the label above it. A legend box for a
     single series is ink with no job — see the dataviz rules. */
  return html.indexOf('chart-key') < 0 ? '' : 'a legend box was drawn for a single series';
});

/* ---------- the rest between sets ---------- */
console.log('\nthe rest between sets');

S.resetAll();
UI.setViewDate(S.today());
const restDay = A.weekday(S.today());
S.get().plan[restDay] = [];
delete S.get().logs[S.today()];
S.commit({ type: 'fixture' });
const restEx = S.addExercise({ name: 'Bench press', category: 'Strength', unit: 'reps', sets: 3, reps: 8 });
const bareEx = S.addExercise({ name: 'Unprescribed lift', category: 'Strength', unit: 'reps', sets: 3, reps: 8 });
S.addToPlan(restDay, restEx.id, { note: '2 RIR \u00b7 rest 90 s' });
S.addToPlan(restDay, bareEx.id, { note: 'no interval here' });
const restItem = S.dayPlan(S.today())[0];
const bareItem = S.dayPlan(S.today())[1];

behaves('no rest means no rest block — the strip carries the next lift', () => {
  UI.stopRest();
  const html = renderRoute('today');
  if (html.indexOf('is-rest') >= 0) return 'a rest block with no rest running';
  return html.indexOf('data-act="ex-focus"') > 0 ? '' : 'and the ordinary strip went missing too';
});

behaves('a running rest takes the strip, in ember, with the interval from the plan', () => {
  UI.startRest(S.today(), restItem.id);
  const html = renderRoute('today');
  if (html.indexOf('today-strip is-rest') < 0) return 'the rest does not own the strip';
  if (html.indexOf('1:30') < 0) return 'the countdown does not start at the prescribed 90 s';
  if (html.indexOf('rest 90 s') < 0) return 'it does not say where the interval came from';
  return html.indexOf('data-act="rest-skip"') > 0 ? '' : 'there is no way out of it';
});

behaves('and it is a timer, not a live region that reads every second aloud', () => {
  const html = renderRoute('today');
  if (html.indexOf('role="timer"') < 0) return 'no timer role';
  return html.indexOf('aria-live="off"') > 0 ? '' : 'the countdown would be announced every second';
});

behaves('an exercise the plan gives no rest for counts up rather than inventing one', () => {
  UI.startRest(S.today(), bareItem.id);
  const html = renderRoute('today');
  if (html.indexOf('is-rest') < 0) return 'no rest block at all';
  if (html.indexOf('rest-track') >= 0) return 'a progress bar with nothing to be a fraction of';
  if (html.indexOf('0:00') < 0) return 'it is not counting from zero';
  return html.indexOf('Since your last set') > 0 ? '' : 'it does not say it is counting up';
});

behaves('a finished rest says so in words, not only in colour', () => {
  const r = UI.startRest(S.today(), restItem.id);
  r.startedAt = Date.now() - 95000;              // 95 s into a 90 s rest
  const html = renderRoute('today');
  if (html.indexOf('is-ready') < 0) return 'the ready state is not marked';
  if (html.indexOf('Ready') < 0) return 'nothing says it is over except the colour';
  /* Past the interval it keeps counting, so "how long have I been standing
     here" is still answerable rather than frozen at zero. */
  if (html.indexOf('+0:05') < 0) return 'it stops counting instead of running over';
  return html.indexOf('>Done<') > 0 ? '' : 'the button still says Skip';
});

behaves('paintRest reports the crossing exactly once', () => {
  const r = UI.startRest(S.today(), restItem.id);
  r.startedAt = Date.now() - 95000;
  renderRoute('today');
  const first = UI.paintRest();
  const second = UI.paintRest();
  if (!first) return 'the crossing was never reported';
  return second ? 'it would buzz on every tick after it ran out' : '';
});

behaves('and it survives being called with nothing on screen', () => {
  const r = UI.startRest(S.today(), restItem.id);
  r.startedAt = Date.now() - 5000;
  renderRoute('plan');                            // the rest keeps running elsewhere
  UI.paintRest();
  return '';
});

behaves('changing the day being viewed ends the rest', () => {
  UI.startRest(S.today(), restItem.id);
  UI.setViewDate(A.addDays(S.today(), -1));
  const gone = !UI.rest();
  UI.setViewDate(S.today());
  return gone ? '' : 'a rest kept running against a day nobody is on';
});

behaves('a rest is never written to the record', () => {
  const before = S.exportJson();
  UI.startRest(S.today(), restItem.id);
  renderRoute('today');
  UI.paintRest();
  const same = S.exportJson() === before;
  UI.stopRest();
  return same ? '' : 'the timer reached the stored state';
});

/* ---------- the tape and the scale ---------- */
console.log('\nthe tape and the scale');

S.resetAll();
UI.setViewDate(S.today());

behaves('with nothing measured, Stats invites the first reading rather than drawing zero', () => {
  const html = renderRoute('progress');
  /* Scoped to the body blocks on purpose. "0 kg total moved" higher up the
     screen is a real total of zero — you have lifted nothing — which is a
     different claim from a MEASUREMENT of zero, and only the second is a lie. */
  const from = html.indexOf('Body weight');
  const body = from < 0 ? '' : html.slice(from);
  if (!body) return 'no body section at all';
  if (/(^|[^0-9.])0 (kg|cm)/.test(body)) return 'a zero was drawn for something never measured';
  if (body.indexOf('data-act="weigh-in"') < 0) return 'no route to the first weigh-in';
  return body.indexOf('data-act="tape-open"') > 0 ? '' : 'no route to the first measurements';
});

behaves('a run of weigh-ins is reported as a weekly average, never as one morning', () => {
  for (let w = 3; w >= 0; w--) {
    [0, 2, 4].forEach((off, i) => {
      const k = A.addDays(A.weekStart(A.addDays(S.today(), -w * 7)), off);
      S.setBody(k, { kg: 59 + (3 - w) * 0.5 + (i === 1 ? 0.9 : 0), u: 'kg' });
    });
  }
  const html = renderRoute('progress');
  if (html.indexOf('average of 3 readings') < 0) return 'it does not say what the number is an average of';
  if (html.indexOf('a week') < 0) return 'no rate of change';
  return /Weekly averages, never a single morning/.test(html) ? '' : 'it does not say why';
});

behaves('and the weekly chart is drawn in the validated mark colour', () => {
  const html = renderRoute('progress');
  if (html.indexOf('class="bodychart"') < 0) return 'no chart';
  if (html.indexOf('var(--chart-did)') < 0) return 'the columns are not the validated mark colour';
  /* One series, so no legend box — the label above it names it. */
  return html.indexOf('chart-key') < 0 ? '' : 'a legend was drawn for a single series';
});

behaves('one week of readings draws no chart and claims no rate', () => {
  S.resetAll();
  S.setBody(S.today(), { kg: 59, u: 'kg' });
  const html = renderRoute('progress');
  if (html.indexOf('class="bodychart"') >= 0) return 'a chart was drawn from one column';
  if (/a week</.test(html)) return 'a rate was claimed from a single week';
  return html.indexOf('A rate needs two') > 0 ? '' : 'it does not say why there is no rate';
});

behaves('the tape lists what was measured, with its change and its date', () => {
  S.setBody(A.addDays(S.today(), -30), { chest: 92, arm_l: 30, arm_r: 31 });
  S.setBody(S.today(), { chest: 95, arm_l: 31.5, arm_r: 32.5 });
  const html = renderRoute('progress');
  if (html.indexOf('95 cm') < 0) return 'the latest reading is not shown';
  if (html.indexOf('+3 cm') < 0) return 'the change since the first reading is not shown';
  if (html.indexOf('Arm · L / R') < 0) return 'a paired measurement is not shown as a pair';
  return html.indexOf('31.5 / 32.5 cm') > 0 ? '' : 'the two sides are not shown together';
});

behaves('a measurement taken once shows a value and no change', () => {
  S.setBody(S.today(), { neck: 37 });
  const html = renderRoute('progress');
  if (html.indexOf('37 cm') < 0) return 'the reading is missing';
  /* "no change" would be a claim; one reading supports neither. */
  return /37 cm<i>/.test(html.replace(/\s+/g, '')) ? 'it claimed a change from one reading' : '';
});

behaves('Stats says plainly that none of this scores a day', () => {
  const html = renderRoute('progress');
  return /not a training session/.test(html) ? '' : 'nothing says the record is not a task';
});

behaves('the weigh-in sheet asks for one number and says what it is for', () => {
  sheetBody.innerHTML = '';
  UI.openWeighIn(S.today());
  const html = sheetBody.innerHTML;
  if (html.indexOf('id="bw_kg"') < 0) return 'no weight field';
  if ((html.match(/<input/g) || []).length !== 1) return 'the quick weigh-in grew more than one field';
  return /weekly average/.test(html) ? '' : 'it does not say a single morning is not a weight';
});

behaves('the tape sheet offers every field and pre-fills none of them', () => {
  S.resetAll();
  S.setBody(A.addDays(S.today(), -30), { chest: 92, arm_l: 30 });
  sheetBody.innerHTML = '';
  UI.openTape(S.today());
  const html = sheetBody.innerHTML;
  const missing = A.BODY_KEYS.filter((k) => html.indexOf('id="bm_' + k + '"') < 0);
  if (missing.length) return 'no field for: ' + missing.join(', ');
  /* THE point of this test. Pre-filling would record ten measurements nobody
     took the moment the form was saved. The old reading is a hint beside the
     box, never a value inside it. */
  if (/id="bm_chest"[^>]*value="92"/.test(html)) return 'last month\'s reading was pre-filled into the box';
  if (html.indexOf('was 92 cm') < 0) return 'the previous reading is not shown beside the field';
  return /leave the rest\s+blank/.test(html) ? '' : 'it does not say a blank records nothing';
});

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

/* The reported bug: "I can't choose my goal, it only shows a few habits". The
   catalog is fourteen and closed on purpose, so the escape hatch is writing your
   own — and that route existed ONLY inside the mid-run "Add a habit" sheet. The
   one screen where you decide what your 66 days will be was the one screen that
   could not reach it, and a habit added after the start cannot begin before day
   two. Both halves are asserted: the route is on the start screen, and the
   catalog really is as small as it looks. */
