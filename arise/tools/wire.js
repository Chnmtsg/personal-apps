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
for (const f of ['data.js', 'program.js', 'goals.js', 'run.js', 'store.js', 'ui.js', 'app.js']) {
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

console.log('\nand again with a selection the budget cannot hold');
S.endRun();
resolve('#run_budget').value = '30';
UI.resetRunPicks();
A.Run.DEFAULT_PICKS.forEach((id) => click({ act: 'run-pick', id: id }));
['strength', 'run', 'deep_work', 'course', 'write'].forEach((id) => click({ act: 'run-pick', id: id }));
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
['vitamins', 'floss', 'water'].forEach((id) => click({ act: 'run-pick', id: id }));
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
['vitamins', 'skincare', 'water'].forEach((id) => click({ act: 'run-pick', id: id }));
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

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
