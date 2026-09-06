/* Headless smoke test for the Discipline data layer and set log (no DOM needed). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'js');
const store = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  setTimeout,
  clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['data.js', 'program.js', 'photos.js', 'store.js']) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
}

const A = sandbox.Arise;
const S = sandbox.Store;

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra != null ? '  → ' + extra : '')); }
}
const section = (s) => console.log('\n' + s);

/* ------------------------------------------------------------------ */
section('date helpers');
S.load();
const t = S.today();
ok('key round-trips', A.key(A.fromKey(t)) === t, t);
ok('addDays +1/-1 is identity', A.addDays(A.addDays(t, 1), -1) === t);
ok('daysBetween', A.daysBetween(t, A.addDays(t, 5)) === 5);
ok('weekStart is a Monday', A.weekday(A.weekStart(t)) === 1, A.weekStart(t));

section('day boundary (grace window)');
ok('boundary 0 is the raw calendar day', A.todayKey(0) === A.key());
ok('a 24h boundary lands on yesterday', A.todayKey(24) === A.addDays(A.key(), -1));
ok('minutesLeftToday is inside a day', A.minutesLeftToday(4) > 0 && A.minutesLeftToday(4) <= 1440, A.minutesLeftToday(4));

/* ------------------------------------------------------------------ */
section('seed state');
const st = S.get();
ok('exercise library seeded', st.exercises.length >= 20, st.exercises.length);
ok('all 7 weekdays present', [0, 1, 2, 3, 4, 5, 6].every((d) => Array.isArray(st.plan[d])));
ok('the built-in programme is laid out', [0,1,2,3,4,5,6].some((d) => (S.get().plan[d] || []).length > 0));
ok('the state carries a perf map on no day yet', Object.keys(S.get().logs).length === 0);
ok('kilograms are the default reading', S.settings().weightUnit === 'kg', S.settings().weightUnit);
ok('starts with no streak', S.currentStreak() === 0, S.currentStreak());

/* ------------------------------------------------------------------ */
section('logging a workout day');
const wd = A.weekday(t);
if (!S.get().plan[wd].length) S.addToPlan(wd, S.get().exercises[0].id);
const plan = S.dayPlan(t);
plan.forEach((i) => S.toggleExercise(t, i.id));
ok('day reads complete', S.dayStatus(t).status === 'complete', JSON.stringify(S.dayStatus(t)));
ok('streak is 1', S.currentStreak() === 1, S.currentStreak());
S.toggleExercise(t, plan[0].id);
ok('untoggle drops completion', S.dayStatus(t).status !== 'complete');
S.toggleExercise(t, plan[0].id);

section('streak across days');
for (let i = 1; i <= 6; i++) {
  S.ensureLog(A.addDays(t, -i));
  S.completeAll(A.addDays(t, -i));
}
ok('7 day streak', S.currentStreak() === 7, S.currentStreak());
ok('best streak tracked', S.history().best === 7, S.history().best);

/* ------------------------------------------------------------------ */
section('streak freezes');
S.resetAll();
S.updateSettings({ restCountsAsStreak: false });
const ex0 = S.get().exercises[0].id;
for (let d = 0; d <= 6; d++) {
  S.clearDayPlan(d);
  S.addToPlan(d, ex0);
}
for (let i = 1; i <= 12; i++) {
  if (i === 6) { S.ensureLog(A.addDays(t, -i)); continue; } // the day we drop
  S.completeAll(A.addDays(t, -i));
}
ok('11 completed days', S.history().completeDays === 11, S.history().completeDays);
ok('streak stops at the gap', S.currentStreak() === 5, S.currentStreak());
let fz = S.freezeStats();
ok('one freeze earned per 10 completed days', fz.earned === 1 && fz.available === 1, JSON.stringify(fz));
ok('cannot freeze today', S.applyFreeze(t) === false);
ok('cannot freeze a completed day', S.applyFreeze(A.addDays(t, -1)) === false);
ok('freeze applies to the gap', S.applyFreeze(A.addDays(t, -6)) === true);
ok('the chain is held across it', S.currentStreak() === 11, S.currentStreak());
ok('a freeze holds but does not add a day', S.history().completeDays === 11, S.history().completeDays);
ok('no freezes left', S.freezeStats().available === 0);
ok('a second freeze is refused', S.applyFreeze(A.addDays(t, -13)) === false);
S.clearFreeze(A.addDays(t, -6));
ok('unfreezing restores the break', S.currentStreak() === 5, S.currentStreak());

/* ------------------------------------------------------------------ */
section('history is never rewritten');
S.resetAll();
const yesterday = A.addDays(t, -1);
S.ensureLog(yesterday);
const beforeCount = S.dayPlan(yesterday).length;
S.addToPlan(A.weekday(yesterday), S.get().exercises[1].id);
ok('editing the weekly template does not rewrite a logged day', S.dayPlan(yesterday).length === beforeCount, S.dayPlan(yesterday).length);

/* The same rule, applied to the thing the app is now for. A set records the
   weight, the unit and the reps ON ITSELF, so nothing about the exercise or
   the plan can reach back and change what last Tuesday weighed. This is the
   single easiest place in the app to break that without anybody noticing. */
const histItem = S.dayPlan(yesterday)[0];
S.addSet(yesterday, histItem.id, 60, 8);
const histEx = S.exerciseById(histItem.exerciseId);
S.updateExercise(histEx.id, { name: 'Renamed lift', sets: 9, reps: 30, unit: 'time', minutes: 40 });
S.updatePlanItem(A.weekday(yesterday), histItem.id, { sets: 9, reps: 30 });
const kept = S.log(yesterday).perf[histItem.id].sets[0];
ok('a logged set keeps its own weight after the exercise is rewritten', kept.w === 60, kept);
ok('and its own reps', kept.r === 8, kept);
ok('and its own unit', kept.u === 'kg', kept);
ok('and the day still reports the volume it moved', S.dayVolume(yesterday).volume === 480, S.dayVolume(yesterday));

/* ------------------------------------------------------------------ */
section('future days are read-only');
const tomorrow = A.addDays(t, 1);
ok('future status', S.dayStatus(tomorrow).status === 'future');
ok('cannot log the future', S.toggleExercise(tomorrow, 'anything') === false);
/* Deciding what next Tuesday will weigh is a prescription, and prescriptions
   live in the plan. Every set verb refuses a future date for that reason. */
ok('cannot log a future set', S.addSet(tomorrow, 'anything', 60, 8) === null);
ok('cannot log a future amount', S.setAmount(tomorrow, 'anything', { min: 20 }) === false);
ok('cannot correct a future set', S.updateSet(tomorrow, 'anything', 0, 60, 8) === false);
ok('cannot write a future note', S.setPerfNote(tomorrow, 'anything', 'nope') === false);

section('clock tampering is noticed');
const tampered = JSON.parse(S.exportJson());
tampered.meta.maxSeen = A.addDays(t, 30); // as if the app had already seen a later date
store.set('arise.state.v1', JSON.stringify(tampered));
S.load();
ok('winding the clock back raises a warning', S.get().meta.clockWarning === true);
S.acknowledgeClock();
ok('and can be acknowledged', S.get().meta.clockWarning === false);

/* ------------------------------------------------------------------ */
section('sessions a week');
S.updateSettings({ goalPerWeek: 1 });
const wdd = A.weekday(t);
if (!S.get().plan[wdd].length) S.addToPlan(wdd, S.get().exercises[0].id);
S.completeAll(t);
ok('the weekly target is hit', S.weekStats().hit);
ok('and it is counted from completed days', S.weekStats().complete >= 1, S.weekStats().complete);

section('export / import');
const expItem = S.dayPlan(t)[0];
S.addSet(t, expItem.id, 72.5, 5);
const json = S.exportJson();
const volBefore = S.dayVolume(t).volume;
S.resetAll();
ok('reset clears the record', S.dayVolume(t).volume === 0, S.dayVolume(t).volume);
S.importJson(json);
ok('import restores the sets that were logged', S.dayVolume(t).volume === volBefore, S.dayVolume(t).volume + ' vs ' + volBefore);
ok('and the set keeps the unit it was typed in', S.log(t).perf[expItem.id].sets[0].u === 'kg');
let threw = false;
try { S.importJson('{"nope":1}'); } catch (e) { threw = true; }
ok('import rejects junk', threw);

/* Importing replaces every byte the user has and cannot be undone, while
   `migrate` is forgiving by design — so almost any JSON object used to become
   the account silently. The shape check stands in front of it. It stays a shape
   check on purpose: reject what is not an Arise backup, never a real one. */
function rejects(label, text) {
  let msg = null;
  try { S.inspectBackup(text); } catch (e) { msg = e.message; }
  ok(label, msg !== null, 'it was accepted');
  return msg || '';
}
const beforeCheck = S.exportJson();
const okInfo = S.inspectBackup(beforeCheck);
ok('a real export inspects cleanly',
  okInfo && typeof okInfo.days === 'number', JSON.stringify(okInfo));
rejects('rejects a file that is not JSON', 'this is my diary, not a backup');
rejects('rejects a JSON array', '[]');
rejects('rejects null', 'null');
rejects('rejects a string', '"backup"');
rejects('rejects a file with no weekly plan', JSON.stringify({ logs: {} }));
rejects('rejects a file with no day logs', JSON.stringify({ plan: {} }));
rejects('rejects goals that are not a list', JSON.stringify({ plan: {}, logs: {}, goals: 'all of them' }));
rejects('rejects a journal that is not an object', JSON.stringify({ plan: {}, logs: {}, journal: [] }));
const newer = rejects('rejects a backup from a newer version of Discipline',
  JSON.stringify({ plan: {}, logs: {}, version: 999 }));
ok('and says so in a way that names both formats', newer.indexOf('999') > 0 && /newer version/i.test(newer), newer);

// The guard is in the store, not only in the click handler that calls it.
let blocked = false;
try { S.importJson(JSON.stringify({ plan: {}, logs: {}, version: 999 })); } catch (e) { blocked = true; }
ok('importJson refuses what inspectBackup rejected', blocked);
ok('and the existing data is untouched after a refused import',
  S.exportJson() === beforeCheck, 'state changed');

section('migrating a v1 backup');
const v1 = {
  version: 1,
  createdAt: A.addDays(t, -3),
  exercises: S.get().exercises,
  habits: [],
  plan: S.get().plan,
  logs: { [A.addDays(t, -2)]: { plan: [], habits: [], ex: {}, hb: {}, extra: [], note: 'an old journal note' } },
  claimed: {},
  weeklyClaims: {},
  bestStreak: 4,
  settings: { name: 'Old', goalPerWeek: 3 }
};
S.importJson(JSON.stringify(v1));
ok('v1 state loads', S.get().version === 7, S.get().version);
/* v6 → v7 is the performance record, and additive means additive: a day logged
   before set logging existed gains an empty map and keeps its tick. Inventing
   numbers for it would be the app writing history the user did not. */
ok('an old day gains an empty perf map', JSON.stringify(S.log(A.addDays(t, -2)).perf) === '{}',
   S.log(A.addDays(t, -2)).perf);
ok('old settings survive', S.settings().name === 'Old' && S.settings().goalPerWeek === 3);

/* Everything this version no longer reads is CARRIED, never deleted. The app
   stopped looking at goals, journals, reading, runs and habits; it must not
   have thrown any of them away, because that is the one mistake with no
   recovery — and an export has to still contain them. */
const legacy = {
  version: 6,
  createdAt: A.addDays(t, -3),
  exercises: S.get().exercises,
  plan: S.get().plan,
  logs: {},
  goals: [{ id: 'g_old', name: 'Read', unit: 'minutes', baseline: 10, target: 60 }],
  goalLogs: { [A.addDays(t, -2)]: { g_old: { value: 30 } } },
  journal: { [A.addDays(t, -2)]: { text: 'a year of entries' } },
  reading: { [A.addDays(t, -2)]: { summary: 'kept' } },
  habits: [{ id: 'hb_old', name: 'Floss' }],
  run: { habits: [], log: {} },
  cookies: [{ id: 'ck', text: 'the hard thing' }],
  settings: {}
};
S.importJson(JSON.stringify(legacy));
const carried = JSON.parse(S.exportJson());
ok('a goal from the old app is still in the state', (carried.goals || []).length === 1, carried.goals);
ok('and every day it logged', !!(carried.goalLogs || {})[A.addDays(t, -2)], carried.goalLogs);
ok('the journal is still there', !!(carried.journal || {})[A.addDays(t, -2)], carried.journal);
ok('so is the reading', !!(carried.reading || {})[A.addDays(t, -2)], carried.reading);
ok('so are the habits', (carried.habits || []).length === 1, carried.habits);
ok('so is the run', !!carried.run, carried.run);
ok('so is the cookie jar', (carried.cookies || []).length === 1, carried.cookies);
ok('and none of it is scored into the day any more', S.dayStatus(A.addDays(t, -2)).total === S.dayPlan(A.addDays(t, -2)).length,
   JSON.stringify(S.dayStatus(A.addDays(t, -2))));

/* v4 → v5: what an exercise works. Additive, and it must not guess at a library
   the user built or renamed — an empty list is a real answer meaning "not
   tagged", which is why it is never filled in for anything off the seed. */
section('muscle groups');
const pushup = S.get().exercises.filter((e) => e.name === 'Push-ups')[0];
ok('a catalogue exercise is tagged by head, not by region',
   !!pushup && pushup.muscles.indexOf('triceps') >= 0 && pushup.muscles.indexOf('front_delts') >= 0,
   pushup && pushup.muscles);
ok('and every tag it carries is a real one',
   pushup.muscles.every((m) => !!A.MUSCLE_NAME[m]), pushup.muscles);

const sled = S.addExercise({ name: 'Sled push', category: 'Strength' });
ok('an exercise the user creates starts untagged rather than guessed',
   Array.isArray(sled.muscles) && sled.muscles.length === 0, sled.muscles);
S.updateExercise(sled.id, { muscles: ['quads', 'quads', 'not_a_muscle', 'GLUTES'] });
ok('tags are cleaned to the catalog, deduplicated and case-folded',
   S.exerciseById(sled.id).muscles.join(',') === 'quads,glutes', S.exerciseById(sled.id).muscles);

/* The v6 rule, and the two halves of it are deliberately different. A name the
   catalogue still knows is re-derived from the catalogue, because nineteen
   groups say more than nine ever could and v5 existed for hours. An exercise
   the user made is theirs: its coarse tags are WIDENED, never dropped. */
S.updateExercise(pushup.id, { muscles: ['lats'] });
const beforeWiden = JSON.parse(S.exportJson());
beforeWiden.version = 5;
/* A real v5 account predates the flag entirely. Leaving it on made this fixture
   an already-upgraded account wearing a v5 label, which skipped the very
   re-derivation the next two assertions are about. */
delete beforeWiden.meta.musclesV6;
beforeWiden.exercises.forEach((e) => { if (e.name === 'Sled push') e.muscles = ['arms', 'legs']; });
S.importJson(JSON.stringify(beforeWiden));
ok('a catalogue exercise is re-derived from the catalogue on migration',
   S.get().exercises.filter((e) => e.name === 'Push-ups')[0].muscles.indexOf('triceps') >= 0,
   S.get().exercises.filter((e) => e.name === 'Push-ups')[0].muscles);
/* The v6 re-derivation is a ONE-TIME upgrade, guarded by its own flag. It used
   to be guarded by nothing and ran on every load, so an edited exercise was
   silently reverted the next time the app opened — forever. Both halves matter:
   a real v5 account must still be upgraded, and an edit must survive a reload. */
ok('a genuine v5 account is upgraded from the catalogue',
   S.get().exercises.filter((e) => e.name === 'Push-ups')[0].muscles.indexOf('triceps') >= 0,
   S.get().exercises.filter((e) => e.name === 'Push-ups')[0].muscles);
const editMe = S.get().exercises.filter((e) => e.name === 'Squats')[0];
S.updateExercise(editMe.id, { muscles: ['lats'] });
S.importJson(S.exportJson());                    // a reload, at the current version
ok('and an edit made after the upgrade survives the next load',
   S.get().exercises.filter((e) => e.name === 'Squats')[0].muscles.join(',') === 'lats',
   S.get().exercises.filter((e) => e.name === 'Squats')[0].muscles);
ok('the flag that makes it one-time is recorded', S.get().meta.musclesV6 === true);

const widened = S.get().exercises.filter((e) => e.name === 'Sled push')[0].muscles;
ok("a user's own exercise has its old coarse tags widened, not dropped",
   widened.indexOf('biceps') >= 0 && widened.indexOf('triceps') >= 0 && widened.indexOf('quads') >= 0,
   widened);

/* Built from scratch rather than from whatever the fixture's plan happens to
   hold: an assertion about counting has to know what it is counting. */
const mDay = S.today();
const lift = S.addExercise({ name: 'Trap bar deadlift', category: 'Strength', muscles: ['lower_back', 'hamstrings', 'glutes'] });
const curl = S.addExercise({ name: 'Hammer curl 2', category: 'Strength', muscles: ['biceps'] });
const blank = S.addExercise({ name: 'Something new', category: 'Other' });
S.get().plan[A.weekday(mDay)] = [];
delete S.get().logs[mDay];                      // so the day re-freezes the new plan
S.commit({ type: 'fixture' });
[lift, curl, blank].forEach((e) => S.addToPlan(A.weekday(mDay), e.id));
const mPlan = S.dayPlan(mDay);
ok('the muscle fixture is the three exercises just planned', mPlan.length === 3, mPlan.length);
mPlan.forEach((i) => S.toggleExercise(mDay, i.id));

const tally = S.muscleTally(7);
const by = {};
tally.rows.forEach((r) => { by[r.id] = r.count; });
ok('one training day is one session', tally.sessions === 1, tally.sessions);
ok('a three-muscle lift counts once against each of them',
   by.lower_back === 1 && by.hamstrings === 1 && by.glutes === 1, tally.rows);
ok('and a single-muscle lift counts once', by.biceps === 1, tally.rows);
ok('the counts deliberately overlap, so there is no honest total',
   tally.rows.reduce((n, r) => n + r.count, 0) === 4, tally.rows);
ok('untagged work is counted apart rather than dropped silently',
   tally.untagged === 1, tally.untagged);
ok('what was NOT trained is named, which is the half that changes tomorrow',
   tally.missing.indexOf('Chest') >= 0 && tally.missing.indexOf('Glutes') < 0, tally.missing);
ok('a day nobody logged contributes nothing', S.muscleTally(1, A.addDays(mDay, -400)).sessions === 0);

/* The same rule the whole app runs on, and the honest limit of this one: the
   tags live on the exercise, not frozen into the day, so re-tagging moves what
   past days are credited with. Completion, streaks and the ledger do not move. */
S.updateExercise(lift.id, { muscles: ['chest'] });
ok('re-tagging an exercise DOES change what past days are credited with',
   S.muscleTally(7).rows.some((r) => r.id === 'chest'), S.muscleTally(7).rows);
ok('new settings get defaults', S.settings().dayBoundaryHour === 4 && S.settings().weightUnit === 'kg');
ok('best streak is preserved across a migration', typeof S.get().bestStreak === 'number', S.get().bestStreak);

/* ------------------------------------------------------------------ */
section('the built-in training program');
S.resetAll();
const lib = S.get().exercises;
const named = (n) => lib.find((e) => e.name === n);
ok('program exercises are in the library', !!named('Dumbbell Floor Press') && !!named('Bulgarian Split Squat'));
ok('every program exercise has how-to notes', A.PROGRAM_EXERCISES.every((p) => (named(p.name) || {}).how),
  (A.PROGRAM_EXERCISES.find((p) => !(named(p.name) || {}).how) || {}).name);
ok('shared names are not duplicated', lib.filter((e) => e.name === 'Plank').length === 1, lib.filter((e) => e.name === 'Plank').length);
ok('all seven days are programmed', [0, 1, 2, 3, 4, 5, 6].every((d) => S.get().plan[d].length > 0));

/* `programPlan` resolves each week entry by NAME and `.filter(Boolean)`s what it
   cannot find, so one typo in PROGRAM_WEEK drops that exercise out of the day
   silently — no error, no empty row, just a session one lift shorter than the
   programme says. Nothing else in the app can catch it. */
const weekNames = [];
[0, 1, 2, 3, 4, 5, 6].forEach((d) => {
  ((A.PROGRAM_WEEK[d] || {}).items || []).forEach((it) => weekNames.push({ d: d, name: it.name }));
});
const unresolved = weekNames.filter((x) => !named(x.name));
ok('every exercise the week names exists in the library', unresolved.length === 0,
   unresolved.map((x) => 'day ' + x.d + ': ' + x.name));
ok('and nothing was silently dropped on the way into the plan',
   [0, 1, 2, 3, 4, 5, 6].every((d) => S.get().plan[d].length === ((A.PROGRAM_WEEK[d] || {}).items || []).length),
   [0, 1, 2, 3, 4, 5, 6].map((d) => S.get().plan[d].length + '/' + ((A.PROGRAM_WEEK[d] || {}).items || []).length).join(' '));

/* The SITE week: Mon Push A, Tue Pull A, Wed Legs A, Thu rest, Fri Push B,
   Sat Pull B, Sun Legs B. Push / pull / legs, twice over, with the one rest day
   a seven-day grid can hold. */
ok('Monday is the chest day', S.get().plan[1].some((i) => S.exerciseById(i.exerciseId).name === 'Dumbbell Floor Press'));
ok('Tuesday is the pull day', S.get().plan[2].some((i) => S.exerciseById(i.exerciseId).name === 'Dumbbell Pullover'));
ok('Wednesday is the squat day', S.get().plan[3].some((i) => S.exerciseById(i.exerciseId).name === 'Goblet Squat'));
ok('Friday is the shoulder day', S.get().plan[5].some((i) => S.exerciseById(i.exerciseId).name === 'Arnold Press'));
ok('Sunday is the hinge day', S.get().plan[0].some((i) => S.exerciseById(i.exerciseId).name === 'Dumbbell Romanian Deadlift'));
ok('Thursday carries no lifting',
   S.get().plan[4].every((i) => S.exerciseById(i.exerciseId).category !== 'Strength'));
ok('a training day opens with a warm-up', S.exerciseById(S.get().plan[1][0].exerciseId).category === 'Warm-up');
ok('and closes with its stretch', (() => {
  const items = S.get().plan[1];
  // The daily mobility is the last row on every day, so the stretch is the one before it.
  return S.exerciseById(items[items.length - 2].exerciseId).category === 'Stretch';
})(), S.get().plan[1].map((i) => S.exerciseById(i.exerciseId).category).join(','));

/* "Training day or not" is the programme's own wording, and it is the only item
   that appears on all seven days — including the two rest days, which is what
   makes it the thing the app has to be most careful not to quietly drop. */
ok('the daily mobility is on every day of the week',
   [0, 1, 2, 3, 4, 5, 6].every((d) =>
     S.get().plan[d].some((i) => S.exerciseById(i.exerciseId).name === 'Daily Shift Mobility')));

ok('rep ranges survive into the plan', S.get().plan[1].some((i) => i.repsMax > i.reps));
ok('a day overrides the exercise default', (() => {
  const a = S.get().plan[3].find((i) => S.exerciseById(i.exerciseId).name === 'Goblet Squat');
  const b = S.get().plan[0].find((i) => S.exerciseById(i.exerciseId).name === 'Goblet Squat');
  return a && b && a.reps === 8 && b.reps === 12; // Legs A asks 8–12, Legs B 12–15 at tempo
})());
ok('the prescription rides the plan item, not the exercise', (() => {
  const row = S.get().plan[1].find((i) => S.exerciseById(i.exerciseId).name === 'Dumbbell Lateral Raise');
  return row && /RIR/.test(row.note || '');
})(), (S.get().plan[1].find((i) => S.exerciseById(i.exerciseId).name === 'Dumbbell Lateral Raise') || {}).note);

/* Saturday's accessory session and the whole home context used to be DRAFTED
   for this app, because the source document listed one and never supplied the
   other. Both arrived in 2026-09 with the full push/pull/legs rewrite, so the
   "drafted, not from the programme" labels are gone — and this asserts they
   stay gone, because a label that says a session was invented is a lie once the
   real one is in the file. */
ok('nothing in either week still claims to be drafted', A.PROGRAM_CONTEXTS.every(
   (c) => [0, 1, 2, 3, 4, 5, 6].every((d) => !/drafted/i.test(c.week[d].title || ''))),
   A.PROGRAM_CONTEXTS.map((c) => c.id));
ok('and neither does a context blurb', A.PROGRAM_CONTEXTS.every((c) => !/drafted/i.test(c.blurb)),
   A.PROGRAM_CONTEXTS.map((c) => c.blurb));

/* ------------------------------------------------------------------ */
section('the programme is transcribed exactly, session by session');

/* The sets each session prescribes, in order, straight off the source document.
   `programPlan` resolves week entries BY NAME and silently drops what it cannot
   find, and a mistyped set count is invisible everywhere else in the app — the
   screen just asks for one set fewer than the coach wrote. This is the only
   place that can see either.

   Timed holds are excluded: the Copenhagen and side planks are "2 x 20 s per
   side", which the app stores as one timed item with the prescription in its
   note rather than as two sets of nothing. */
const DOC_SETS = {
  site: { 1: [4, 3, 3, 3, 3, 2, 2], 2: [4, 4, 3, 3, 3, 3, 2], 3: [4, 3, 3, 2, 4, 2, 2],
          4: [], 5: [4, 3, 3, 4, 3, 3, 3], 6: [4, 3, 3, 3, 3, 2, 2, 3], 0: [4, 3, 3, 2, 4, 2, 3] },
  home: { 1: [4, 3, 3, 3, 3, 2, 2], 2: [4, 3, 3, 3, 3, 3, 2], 3: [4, 3, 3, 4, 2, 2],
          4: [4, 3, 3, 4, 3, 3, 3], 5: [4, 3, 3, 3, 3, 2, 2, 3], 6: [4, 3, 3, 2, 4, 2, 2, 3], 0: [] }
};
const exByName = {};
A.PROGRAM_EXERCISES.forEach((e) => { exByName[e.name] = e; });
A.PROGRAM_CONTEXTS.forEach((c) => {
  [1, 2, 3, 4, 5, 6, 0].forEach((d) => {
    const lifts = (c.week[d].items || []).filter((it) => {
      const ex = exByName[it.name];
      return ex && ex.unit === 'reps';
    });
    const got = lifts.map((it) => (it.sets != null ? it.sets : exByName[it.name].sets || 0));
    const want = DOC_SETS[c.id][d];
    ok(c.id + ' day ' + d + ' matches the document',
       got.length === want.length && got.every((n, i) => n === want[i]),
       'got ' + got.join(',') + ' want ' + want.join(','));
  });
});

/* Both planks are timed holds, and the reps they are actually done for live in
   the note. If either ever becomes a rep exercise, the set counts above change
   and the assertion has to be told. */
['Copenhagen Plank', 'Side Plank'].forEach((n) => {
  ok(n + ' is a timed hold carrying its own prescription', (() => {
    const ex = exByName[n];
    if (!ex || ex.unit !== 'time') return false;
    const row = (A.PROGRAM_WEEK[3].items || []).concat(A.PROGRAM_WEEK[0].items || [])
      .find((it) => it.name === n);
    return !!row && /\d+\s*[x\u00d7]\s*\d+\s*s/.test(row.note || '');
  })(), (exByName[n] || {}).unit);
});

/* Every prescribed rest interval has to be readable by the timer, or a lift
   that names one silently counts up instead. */
{
  let named = 0;
  const unread = [];
  A.PROGRAM_CONTEXTS.forEach((c) => {
    [0, 1, 2, 3, 4, 5, 6].forEach((d) => {
      (c.week[d].items || []).forEach((it) => {
        if (!/\brest\s+\d/.test(String(it.note || ''))) return;
        named++;
        if (!A.restFromNote(it.note)) unread.push(c.id + ' ' + it.name);
      });
    });
  });
  ok('the rewritten programme still prescribes rests', named > 40, named);
  ok('and every one of them still parses', unread.length === 0, unread);
}

/* ------------------------------------------------------------------ */
section('the week, as a shape');

/* Both contexts run the same pattern — that is what makes them contexts of one
   programme rather than two programmes. */
/* Each context rests on the day its own source says it does — Thursday on site,
   Sunday at home — and trains on the other six. They are not the same shape any
   more, and that is the source document rather than a slip: the home block is a
   fixed six-day week and the site block is a rolling cycle this grid can only
   approximate. */
const REST_DAY = { site: 4, home: 0 };
ok('each week rests exactly once, on the day its source names', A.PROGRAM_CONTEXTS.every((c) =>
   (c.week[REST_DAY[c.id]].items || []).length === 1 &&
   [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== REST_DAY[c.id])
     .every((d) => (c.week[d].items || []).length > 1)),
   A.PROGRAM_CONTEXTS.map((c) => c.id + ':' + [1, 2, 3, 4, 5, 6, 0].map((d) => c.week[d].items.length).join(',')));
ok('and both run six sessions of push, pull and legs', A.PROGRAM_CONTEXTS.every((c) => {
  const titles = [0, 1, 2, 3, 4, 5, 6].map((d) => c.week[d].title).join(' | ');
  return ['Push A', 'Push B', 'Pull A', 'Pull B', 'Legs A', 'Legs B'].every((t) => titles.indexOf(t) >= 0);
}), A.PROGRAM_CONTEXTS.map((c) => [0, 1, 2, 3, 4, 5, 6].map((d) => c.week[d].title).join('/')));
ok('every day of both ends with the daily mobility', A.PROGRAM_CONTEXTS.every((c) =>
   [0, 1, 2, 3, 4, 5, 6].every((d) => c.week[d].items.slice(-1)[0].name === 'Daily Shift Mobility')));
/* The home context is the one with a barbell in it; that is the whole point of
   it being a separate context. */
const homeWeek = A.PROGRAM_CONTEXTS.find((c) => c.id === 'home').week;
const siteWeek = A.PROGRAM_CONTEXTS.find((c) => c.id === 'site').week;
const barbells = (w) => [0, 1, 2, 4, 5, 6].reduce(
  (n, d) => n + (w[d].items || []).filter((i) => /^Barbell |^Pull-up$/.test(i.name)).length, 0);
ok('the home context uses the barbell and the site one does not',
   barbells(homeWeek) >= 5 && barbells(siteWeek) === 0, [barbells(homeWeek), barbells(siteWeek)]);

/* Installing one lays that week down, and says which is on. */
S.resetAll();
S.reinstallProgram('home');
ok('installing a context lays down its week', S.programContext() === 'home', S.programContext());
ok('and the plan really is the home one',
   S.get().plan[1].some((i) => S.exerciseById(i.exerciseId).name === 'Barbell Bench Press'),
   S.get().plan[1].map((i) => S.exerciseById(i.exerciseId).name));
S.reinstallProgram('site');
ok('switching back lays down the other', S.programContext() === 'site' &&
   S.get().plan[1].some((i) => S.exerciseById(i.exerciseId).name === 'Dumbbell Floor Press'),
   S.get().plan[1].map((i) => S.exerciseById(i.exerciseId).name));
ok('an unknown context falls back rather than emptying the week', (() => {
  S.reinstallProgram('nope');
  return [0, 1, 2, 3, 4, 5, 6].every((d) => S.get().plan[d].length > 0);
})(), [0, 1, 2, 3, 4, 5, 6].map((d) => S.get().plan[d].length).join(','));
S.reinstallProgram('site');

/* ------------------------------------------------------------------ */
section('installing the program over an existing account');
// An account that predates the program: its own exercise, its own plan.
const legacyState = {
  version: 2,
  createdAt: A.addDays(t, -10),
  exercises: [{ id: 'ex_mine', name: 'Dumbbell Floor Press', category: 'Strength', unit: 'reps', sets: 9, reps: 3, icon: '🏋️' }],
  habits: [], plan: { 0: [], 1: [{ id: 'pi_mine', exerciseId: 'ex_mine', sets: 9, reps: 3, note: 'mine' }], 2: [], 3: [], 4: [], 5: [], 6: [] },
  logs: {}, goalLogs: {}, reading: {}, journal: {}, freezes: {}, claimed: {}, weeklyClaims: {}, bestStreak: 0,
  settings: { name: 'Old' }, meta: {}
};
S.importJson(JSON.stringify(legacyState));
const mine = S.get().exercises.find((e) => e.id === 'ex_mine');
ok('a same-named exercise is not duplicated', S.get().exercises.filter((e) => e.name === 'Dumbbell Floor Press').length === 1);
ok('the user’s own sets/reps are left alone', mine.sets === 9 && mine.reps === 3, `${mine.sets}×${mine.reps}`);
ok('but it gains the how-to notes', !!mine.how);
ok('the program replaced the weekly plan', S.get().plan[1].length > 1, S.get().plan[1].length);
ok('the program is marked installed', S.get().meta.programInstalled === true);
// Re-importing an already-installed backup must not stomp a plan edited since.
S.clearDayPlan(1);
S.importJson(S.exportJson());
ok('a second migrate does not reinstall over an edited plan', S.get().plan[1].length === 0, S.get().plan[1].length);

/* ------------------------------------------------------------------ */
section('the real ledger counts life, not points');

S.resetAll();
for (let d = 0; d <= 6; d++) S.get().plan[d] = [];
S.commit({ type: 'fixture' });

const press = S.addExercise({ name: 'Overhead press', category: 'Strength', unit: 'reps', sets: 3, reps: 5 });
for (let d = 0; d <= 6; d++) S.addToPlan(d, press.id);

/* Five sessions, climbing. Written straight through the store so what the
   ledger reports is derived from real logs rather than from a fixture object. */
for (let i = 9; i >= 5; i--) {
  const k = A.addDays(S.today(), -i);
  const item = S.dayPlan(k)[0];
  S.addSet(k, item.id, 40 + (9 - i) * 2.5, 5);
  S.addSet(k, item.id, 40 + (9 - i) * 2.5, 5);
  S.addSet(k, item.id, 40 + (9 - i) * 2.5, 4);
}

let life = S.lifeTotals();
ok('every set is counted', life.sets === 15, life.sets);
ok('and every rep', life.reps === 70, life.reps);
/* (40+42.5+45+47.5+50) x (5+5+4) = 225 x 14 = 3150 */
ok('volume is load times reps, summed', life.volume === 3150, life.volume);
ok('the lift appears once, with its sessions', life.exercises.length === 1 && life.exercises[0].days === 5,
   life.exercises);
ok('and its heaviest set is remembered', life.exercises[0].best.w === 50, life.exercises[0].best);
ok('the ledger spans the whole record', life.days === 10, life.days);
ok('there is no XP anywhere in it',
   Object.keys(life).indexOf('xp') < 0 && Object.keys(life).indexOf('level') < 0);

S.addExtra(A.addDays(S.today(), -9), 'Long walk');
S.addExtra(A.addDays(S.today(), -8), 'Swim');
life = S.lifeTotals();
ok('freeform work counts as something you did', life.sessions >= 2, life.sessions);

/* A bodyweight set is not a zero-kilo one. It has to count toward reps and sets
   and contribute nothing to volume, or a month of chin-ups reads as a month of
   lifting nothing. */
const chin = S.addExercise({ name: 'Chin-ups', category: 'Strength', unit: 'reps', sets: 3, reps: 6 });
S.addToPlan(A.weekday(A.addDays(S.today(), -5)), chin.id);
const chinDay = A.addDays(S.today(), -4);
S.ensureLog(chinDay);
const chinItem = S.dayPlan(chinDay).find((i) => i.exerciseId === chin.id);
if (chinItem) {
  const volBefore = S.lifeTotals().volume;
  S.addSet(chinDay, chinItem.id, null, 6);
  life = S.lifeTotals();
  ok('a bodyweight set adds reps but no volume', life.volume === volBefore && life.reps === 76,
     life.volume + ' / ' + life.reps);
}

/* ------------------------------------------------------------------ */
section('rewards you promise yourself');

S.resetAll();
for (let d = 0; d <= 6; d++) S.get().plan[d] = [];
S.updateSettings({ completionPct: 100, restCountsAsStreak: false });
const rwEx = S.get().exercises[0].id;
for (let d = 0; d <= 6; d++) S.addToPlan(d, rwEx);
// Fourteen kept days, then a week of nothing: the run is over but it happened.
for (let i = 20; i >= 7; i--) S.completeAll(A.addDays(S.today(), -i));

ok('the record remembers the best run', S.history().best === 14, S.history().best);
ok('while the current streak has gone', S.currentStreak() === 0, S.currentStreak());

const rwShoes = S.addCustomReward({ name: 'Sneakers', icon: '👟', days: 14 });
let rwP = S.customRewardProgress(rwShoes);
ok('a promise is earned on the best run, not the current one', rwP.unlocked && rwP.have === 14, `${rwP.have}/${rwP.need}`);
ok('and it is not collected until you say so', rwP.claimed === false);

const rwBike = S.addCustomReward({ name: 'New bike', days: 30 });
rwP = S.customRewardProgress(rwBike);
ok('a longer promise stays out of reach', !rwP.unlocked && rwP.need - rwP.have === 16, `${rwP.have}/${rwP.need}`);
ok('and reports how far there is to go', rwP.pct > 0 && rwP.pct < 100, rwP.pct);

ok('collecting is recorded', S.claimCustomReward(rwShoes.id) === true);
ok('and shows the day you did', !!S.customRewardProgress(rwShoes).claimedOn);
ok('collecting toggles back — a mistap is not a purchase', S.claimCustomReward(rwShoes.id) === false);
ok('an unearned reward cannot be collected', S.claimCustomReward(rwBike.id) === false);

S.updateCustomReward(rwBike.id, { days: 5 });
ok('lowering the bar earns it', S.customRewardProgress(rwBike).unlocked);
S.updateCustomReward(rwBike.id, { days: 0 });
ok('days is clamped to at least one', S.customRewards().find((r) => r.id === rwBike.id).days === 1);

const rwAway = S.addCustomReward({ name: 'Weekend away', days: 3 });
ok('every reward reads the training streak', S.customRewardProgress(rwAway).need === 3);
ok('and is earned on the best run it ever reached', S.customRewardProgress(rwAway).have === S.history().best);

S.removeCustomReward(rwBike.id);
ok('a deleted reward is gone', !S.customRewards().some((r) => r.id === rwBike.id));
ok('and the others are untouched', S.customRewards().length === 2, S.customRewards().length);

// Additive migration: an account written before rewards existed simply has none.
const rwLegacy = JSON.parse(S.exportJson());
delete rwLegacy.customRewards;
S.importJson(JSON.stringify(rwLegacy));
ok('an older backup migrates to an empty reward list', Array.isArray(S.customRewards()) && S.customRewards().length === 0);

/* ------------------------------------------------------------------ */
section('unreadable saved data is preserved, never overwritten');

/* Saving is debounced, so make the timer fire inline: these assertions are about
   what actually reaches storage, not about what was scheduled to. */
const realSetTimeout = sandbox.setTimeout;
sandbox.setTimeout = (fn) => { fn(); return 0; };

/* This section corrupts storage on purpose, so the app's own warnings are the
   expected output. Silence them inside the sandbox to keep the results readable —
   the assertions below are what proves the behaviour, not the log lines. */
const realConsole = sandbox.console;
sandbox.console = { log: () => {}, warn: () => {}, error: () => {} };

const CORRUPT = '{"version":3,"goals":[ this never finishes';
const CORRUPT_LATER = '<<< also not json >>>';

store.clear();
S.load();
ok('a first-ever load reports no storage error', S.get().meta.storageError === null, S.get().meta.storageError);
ok('a clean start quarantines nothing', store.get('arise.state.v1.unreadable') === undefined);

store.clear();
store.set('arise.state.v1', CORRUPT);
S.load();
ok('unreadable data is announced, not hidden', S.get().meta.storageError === 'unreadable', S.get().meta.storageError);
ok('the original bytes are copied before anything overwrites them', store.get('arise.state.v1.unreadable') === CORRUPT);
ok('the app can hand those bytes back to the user', S.unreadableBackup() === CORRUPT);
ok('a verified copy lets the fresh seed be written', (store.get('arise.state.v1') || '').indexOf('"storageError":"unreadable"') > 0);

// A second failure is of the seed we just wrote, so it must not replace the copy
// of the user's real data.
store.set('arise.state.v1', CORRUPT_LATER);
S.load();
ok('the quarantine keeps the first failure, not the latest', store.get('arise.state.v1.unreadable') === CORRUPT);

// The branch that matters most: no copy could be made, so nothing may overwrite
// the original.
store.clear();
store.set('arise.state.v1', CORRUPT);
// Fail ONLY the quarantine write. The primary key stays writable on purpose, so
// these assertions test the decision not to overwrite rather than an inability to.
const realSetItem = sandbox.localStorage.setItem;
sandbox.localStorage.setItem = (k, v) => {
  if (k === 'arise.state.v1.unreadable') throw new Error('quota exceeded');
  return realSetItem(k, v);
};
S.load();
sandbox.localStorage.setItem = realSetItem;
ok('an unsaveable quarantine leaves the original untouched on disk', store.get('arise.state.v1') === CORRUPT);
ok('nothing was seeded over it', store.get('arise.state.v1').indexOf('storageError') < 0);
ok('the bytes are still recoverable this session', S.unreadableBackup() === CORRUPT);
ok('and the failure is still announced', S.get().meta.storageError === 'unreadable');

// Writes stay blocked until the user decides what their data should be.
S.addSet(S.today(), (S.dayPlan(S.today())[0] || { id: 'x' }).id, 60, 8);
ok('a tap cannot overwrite the original while writes are blocked', store.get('arise.state.v1') === CORRUPT);
S.resetAll();
ok('choosing a reset lifts the block', store.get('arise.state.v1') !== CORRUPT);
ok('and clears the storage error', S.get().meta.storageError === null, S.get().meta.storageError);

/* ------------------------------------------------------------------ */
section('a write that fails is surfaced, not swallowed');

store.clear();
S.resetAll();
ok('a healthy write reports no storage error', S.get().meta.storageError === null, S.get().meta.storageError);

sandbox.localStorage.setItem = () => { throw new Error('quota exceeded'); };
S.addExercise({ name: 'Doomed', category: 'Other' });
ok('a refused write is announced', S.get().meta.storageError === 'unwritable', S.get().meta.storageError);

sandbox.localStorage.setItem = realSetItem;
S.addExercise({ name: 'Fine now', category: 'Other' });
ok('a later successful write clears it', S.get().meta.storageError === null, S.get().meta.storageError);

// The two conditions are not interchangeable: missing data stays missing whether
// or not the next write happens to succeed.
S.get().meta.storageError = 'unreadable';
S.addExercise({ name: 'Yet another', category: 'Other' });
ok('a successful write does not clear an unreadable error', S.get().meta.storageError === 'unreadable');
S.get().meta.storageError = null;

sandbox.setTimeout = realSetTimeout;
sandbox.console = realConsole;

/* ------------------------------------------------------------------ */
section('a pending write is flushed, not lost');

// Real timers here on purpose: the point is that the debounce has NOT fired yet.
store.clear();
S.resetAll();
S.flush();
const flushedBase = store.get('arise.state.v1');
ok('flush writes what was still pending', flushedBase != null);

S.addExercise({ name: 'Flush me', category: 'Other' });
ok('the follow-up write is still only scheduled', store.get('arise.state.v1') === flushedBase);
S.flush();
ok('flush forces it out immediately', store.get('arise.state.v1') !== flushedBase);
ok('and what landed contains the change', (store.get('arise.state.v1') || '').indexOf('Flush me') > 0);
ok('flushing again with nothing pending is harmless', (S.flush(), store.get('arise.state.v1').indexOf('Flush me') > 0));

// A note is typed rather than tapped, so flush has to cover it too or the last
// words of it are lost when the app is backgrounded.
const noteItem = S.dayPlan(S.today())[0];
if (noteItem) {
  S.setPerfNote(S.today(), noteItem.id, 'Something I would hate to lose.');
  S.flush();
  ok('flush captures a typed note', (store.get('arise.state.v1') || '').indexOf('hate to lose') > 0);
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
section('the set log');

S.resetAll();
const slDay = S.today();
for (let d = 0; d <= 6; d++) S.get().plan[d] = [];
S.commit({ type: 'fixture' });
const bench = S.addExercise({ name: 'Bench press', category: 'Strength', unit: 'reps', sets: 3, reps: 8 });
for (let d = 0; d <= 6; d++) S.addToPlan(d, bench.id, { sets: 3, reps: 8 });
const slItem = S.dayPlan(slDay)[0];

ok('nothing is stored until a set is written', S.log(slDay) === null || !S.log(slDay).perf[slItem.id]);
const first = S.addSet(slDay, slItem.id, 60, 8);
ok('a set stores the number that was typed', first.w === 60, first);
ok('and the reps', first.r === 8, first);
ok('and stamps the unit in force at the time', first.u === 'kg', first);
ok('the entry now reads as logged', A.isLogged(S.log(slDay).perf[slItem.id]));

/* A bodyweight set is a real answer, not a missing one. Zero would put it into
   the volume total as a zero-kilo barbell. */
const bwSet = S.addSet(slDay, slItem.id, '', 10);
ok('a blank weight is null, never zero', bwSet.w === null, bwSet);
ok('and contributes no volume', A.setVolume(bwSet, 'kg') === 0, A.setVolume(bwSet, 'kg'));
S.removeSet(slDay, slItem.id, 1);

ok('volume is load times reps', S.dayVolume(slDay).volume === 480, S.dayVolume(slDay));
ok('and the day counts the set', S.dayVolume(slDay).sets === 1, S.dayVolume(slDay));

/* Filling the last prescribed set ticks the exercise. Nothing else here ever
   un-ticks it — a corrected typo must not retract a session you know you did. */
ok('two of three sets does not complete the exercise', S.dayStatus(slDay).exDone === 0, S.dayStatus(slDay));
S.addSet(slDay, slItem.id, 60, 8);
S.addSet(slDay, slItem.id, 57.5, 6);
ok('the third does', S.dayStatus(slDay).exDone === 1, S.dayStatus(slDay));
const gone = S.removeSet(slDay, slItem.id, 2);
ok('and removing one does not take the tick back', S.dayStatus(slDay).exDone === 1, S.dayStatus(slDay));
S.restoreSet(slDay, slItem.id, 2, gone);
ok('the undo puts the same set back in the same place',
   S.log(slDay).perf[slItem.id].sets[2].w === 57.5, S.log(slDay).perf[slItem.id].sets);

S.updateSet(slDay, slItem.id, 2, 57.5, 7);
ok('a set can be corrected in place', S.log(slDay).perf[slItem.id].sets[2].r === 7);
ok('correcting one does not add another', S.log(slDay).perf[slItem.id].sets.length === 3);

/* ------------------------------------------------------------------ */
section('what did I lift last time');

const slPrev = A.addDays(slDay, -2);
S.ensureLog(slPrev);
const prevItem = S.dayPlan(slPrev).find((i) => i.exerciseId === bench.id);
S.addSet(slPrev, prevItem.id, 55, 8);
S.addSet(slPrev, prevItem.id, 55, 8);

const last = S.lastPerformance(bench.id, slDay);
ok('the last session is found by exercise, not by plan item', last && last.date === slPrev, last && last.date);
ok('and it carries what was actually done', last.perf.sets.length === 2, last.perf.sets);
ok('a day with nothing logged is not "last time"',
   S.lastPerformance(bench.id, slPrev) === null, S.lastPerformance(bench.id, slPrev));

/* A suggestion is a hint and never a write: an exercise the user skips must
   leave no trace claiming otherwise. */
const emptyDay = A.addDays(slDay, -1);
delete S.get().logs[emptyDay];
S.commit({ type: 'fixture' });
const sug = S.suggestSet(emptyDay, S.dayPlan(emptyDay)[0].id);
ok('the boxes are prefilled from the last session', sug.weight === 55 && sug.from === 'last', JSON.stringify(sug));
ok('and asking for one stores nothing', !S.log(emptyDay) || !Object.keys(S.log(emptyDay).perf).length);
ok('with no history it falls back to the plan', (() => {
  const fresh = S.addExercise({ name: 'Never done', category: 'Strength', unit: 'reps', sets: 3, reps: 12 });
  S.addToPlan(A.weekday(emptyDay), fresh.id);
  const item = S.dayPlan(emptyDay).find((i) => i.exerciseId === fresh.id);
  const g = S.suggestSet(emptyDay, item.id);
  return g && g.from === 'plan' && g.reps === 12;
})());

/* ------------------------------------------------------------------ */
section('minutes and kilometres, for the lifts that are measured in them');

S.resetAll();
for (let d = 0; d <= 6; d++) S.get().plan[d] = [];
S.commit({ type: 'fixture' });
const jog = S.addExercise({ name: 'Easy run', category: 'Cardio', unit: 'distance', km: 5 });
const hold = S.addExercise({ name: 'Plank hold', category: 'Core', unit: 'time', minutes: 3 });
S.addToPlan(A.weekday(S.today()), jog.id);
S.addToPlan(A.weekday(S.today()), hold.id);
const jogItem = S.dayPlan(S.today()).find((i) => i.exerciseId === jog.id);
const holdItem = S.dayPlan(S.today()).find((i) => i.exerciseId === hold.id);

S.setAmount(S.today(), jogItem.id, { km: 5.2, min: 28 });
ok('a distance is stored with its time', S.log(S.today()).perf[jogItem.id].km === 5.2);
ok('and reaching the distance completes it', S.dayStatus(S.today()).exDone === 1, S.dayStatus(S.today()));
S.setAmount(S.today(), holdItem.id, { min: 1 });
ok('falling short of the time does not', S.dayStatus(S.today()).exDone === 1, S.dayStatus(S.today()));
S.setAmount(S.today(), holdItem.id, { min: 3 });
ok('and reaching it does', S.dayStatus(S.today()).exDone === 2, S.dayStatus(S.today()));
S.setAmount(S.today(), holdItem.id, { min: '' });
ok('clearing the amount drops the entry rather than storing a zero',
   !S.log(S.today()).perf[holdItem.id], S.log(S.today()).perf[holdItem.id]);
ok('a time entry contributes no volume', S.dayVolume(S.today()).volume === 0, S.dayVolume(S.today()));
ok('but its minutes are counted', S.dayVolume(S.today()).minutes === 28, S.dayVolume(S.today()));

/* ------------------------------------------------------------------ */
section('switching the weight unit re-reads, never re-values');

S.resetAll();
for (let d = 0; d <= 6; d++) S.get().plan[d] = [];
S.commit({ type: 'fixture' });
const sq = S.addExercise({ name: 'Back squat', category: 'Strength', unit: 'reps', sets: 3, reps: 5 });
S.addToPlan(A.weekday(S.today()), sq.id);
const sqItem = S.dayPlan(S.today())[0];
S.addSet(S.today(), sqItem.id, 100, 5);
const inKg = S.dayVolume(S.today(), 'kg').volume;
S.updateSettings({ weightUnit: 'lb' });
ok('the stored number never moves', S.log(S.today()).perf[sqItem.id].sets[0].w === 100);
ok('nor the unit it was typed in', S.log(S.today()).perf[sqItem.id].sets[0].u === 'kg');
ok('the reading converts', Math.round(S.dayVolume(S.today()).volume) === Math.round(inKg * 2.2046226218),
   S.dayVolume(S.today()).volume);
/* And a set typed in pounds keeps ITS unit, so a mixed history reads correctly
   in either — which is the whole reason the unit rides the set. */
S.addSet(S.today(), sqItem.id, 225, 5);
ok('a set typed in pounds is stored in pounds', S.log(S.today()).perf[sqItem.id].sets[1].u === 'lb');
S.updateSettings({ weightUnit: 'kg' });
const mixed = S.dayVolume(S.today(), 'kg').volume;
ok('and a mixed history still totals correctly in kilos',
   Math.round(mixed) === Math.round(500 + (225 / 2.2046226218) * 5), Math.round(mixed));

/* ------------------------------------------------------------------ */
section('an exercise over time');

const series = S.exerciseSeries(sq.id, 30, 'kg');
ok('a logged day appears in the series', series.length === 1, series.length);
/* Two sets: 100 kg and 225 lb. In kilos the heavier is the pound one, which is
   the point — the series reads the record rather than the raw numbers. */
ok('and reports the heaviest set of that session, converted',
   Math.abs(series[0].top - 225 / 2.2046226218) < 0.01, series[0] && series[0].top);
ok('a day the lift was scheduled but never logged is absent, not a zero',
   S.exerciseSeries(sq.id, 30, 'kg').every((x) => x.top > 0), series);

/* ------------------------------------------------------------------ */
section('a defensive read of a half-written record');

/* `normalisePerf` runs on every load. It drops what it cannot read and keeps
   everything it can, because the alternative on a corrupt entry is a NaN on a
   screen, and a number nobody can explain is worse than a blank. */
const bad = JSON.parse(S.exportJson());
const badKey = Object.keys(bad.logs)[0];
bad.logs[badKey].perf = {
  x1: { sets: [{ w: 'heavy', r: 'lots' }, { w: 60, u: 'st', r: 8.7 }, null] },
  x2: { min: 'ages', km: -4 },
  x3: 'not an object'
};
S.importJson(JSON.stringify(bad));
const fixed = S.log(badKey).perf;
ok('an unreadable weight becomes bodyweight rather than NaN', fixed.x1.sets[0].w === null, fixed.x1.sets[0]);
ok('unreadable reps become zero rather than NaN', fixed.x1.sets[0].r === 0, fixed.x1.sets[0]);
ok('an unknown unit falls back to kilos', fixed.x1.sets[1].u === 'kg', fixed.x1.sets[1]);
ok('fractional reps are rounded', fixed.x1.sets[1].r === 9, fixed.x1.sets[1]);
ok('a null set is dropped', fixed.x1.sets.length === 2, fixed.x1.sets);
ok('an unreadable amount is dropped rather than stored', fixed.x2.min === undefined && fixed.x2.km === undefined, fixed.x2);
ok('and a garbage entry becomes an empty one', JSON.stringify(fixed.x3) === '{}', fixed.x3);
ok('nothing in the repaired record is NaN', JSON.stringify(fixed).indexOf('NaN') < 0, JSON.stringify(fixed));

/* ------------------------------------------------------------------ */
section('the rest between sets, read out of the plan note');

/* The interval lives in the plan item's `note` because the programme already
   writes it there. These are the exact strings js/program.js ships. */
const restCases = [
  ['2 RIR \u00b7 rest 2\u20133 min \u00b7 pause 1 s on the floor', 120, 180],
  ['per side \u00b7 2 RIR \u00b7 rest 90 s', 90, null],
  ['1 RIR \u00b7 rest 75 s', 75, null],
  ['2\u20133 RIR \u00b7 rest 3 min', 180, null],
  ['rest 2 minutes', 120, null],
  ['rest 30 seconds', 30, null]
];
restCases.forEach(([note, seconds, upper]) => {
  const got = A.restFromNote(note);
  ok('"' + note.slice(0, 34) + '" reads as ' + seconds + 's',
     got && got.seconds === seconds && got.upper === upper, JSON.stringify(got));
});

/* A range counts down to its LOWER bound: that is when the rest is over and you
   may start, and the upper bound is how long you are allowed to take. */
ok('a range takes its lower bound, and remembers the upper',
   A.restFromNote('rest 2\u20133 min').seconds === 120 && A.restFromNote('rest 2\u20133 min').upper === 180);

/* The two prose traps in the real programme. Neither is an interval, and the
   second has a number in it that is not one. */
ok('prose after the word rest is not an interval',
   A.restFromNote('rest the top of the rear foot on it.') === null);
ok('a note whose first number is not the rest still finds the rest',
   A.restFromNote('2 \u00d7 20 s per side, knee on the bench \u00b7 rest 45 s').seconds === 45,
   JSON.stringify(A.restFromNote('2 \u00d7 20 s per side, knee on the bench \u00b7 rest 45 s')));
ok('a note with no rest at all prescribes none', A.restFromNote('3 min \u00b7 2 RIR') === null);
ok('and so does an empty one', A.restFromNote('') === null && A.restFromNote(null) === null);
ok('a zero rest is no rest rather than an instant one', A.restFromNote('rest 0 s') === null);

ok('a clock reads as minutes and seconds', A.fmtClock(105) === '1:45', A.fmtClock(105));
ok('and pads the seconds', A.fmtClock(9) === '0:09' && A.fmtClock(60) === '1:00');

/* Every interval the built-in programmes prescribe has to parse, or the timer
   silently counts up on a lift that names a rest. Nothing else can see this. */
{
  let named = 0;
  let unread = [];
  (A.PROGRAM_CONTEXTS || []).forEach((c) => {
    [0, 1, 2, 3, 4, 5, 6].forEach((d) => {
      ((c.week[d] || {}).items || []).forEach((it) => {
        if (!/\brest\s+\d/.test(String(it.note || ''))) return;
        named++;
        if (!A.restFromNote(it.note)) unread.push(c.id + ' ' + it.name);
      });
    });
  });
  ok('the programmes prescribe rests at all', named > 20, named);
  ok('and every one of them parses', unread.length === 0, unread);
}

/* The setting exists and is on, and it is a display choice: nothing about the
   record depends on it. */
S.resetAll();
ok('the rest timer is on by default', S.settings().restTimer === true);

console.log(`
${pass} passed, ${fail} failed
`);
process.exit(fail ? 1 : 0);
