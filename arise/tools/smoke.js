/* Headless smoke test for the Arise data layer + progression engine (no DOM needed). */
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
for (const f of ['data.js', 'program.js', 'goals.js', 'store.js']) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
}

const A = sandbox.Arise;
const G = A.Goals;
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
ok('hh:mm round-trips', A.minToHhmm(A.hhmmToMin('06:15')) === '06:15');
ok('hh:mm parses to minutes', A.hhmmToMin('06:30') === 390, A.hhmmToMin('06:30'));

/* ------------------------------------------------------------------ */
section('seed state');
const st = S.get();
ok('exercise library seeded', st.exercises.length >= 20, st.exercises.length);
ok('all 7 weekdays present', [0, 1, 2, 3, 4, 5, 6].every((d) => Array.isArray(st.plan[d])));
ok('goals seeded', S.activeGoals().length >= 4, S.activeGoals().length);
ok('a reading goal is gated on a summary', !!S.activeGoals().find((g) => g.gate === 'summary'));
ok('starts at level 1 / 0 xp', S.progress().level === 1 && S.totalXp() === 0, S.totalXp());
ok('starts with no streak', S.currentStreak() === 0, S.currentStreak());

/* ------------------------------------------------------------------ */
section('progression: the target is a floor');
function freshGoal(patch) {
  const g = S.addGoal(Object.assign({ name: 'Wake', unit: 'time', direction: 'down', baseline: 450, target: 360, step: 15 }, patch));
  return g;
}

/* Give a goal a past, for tests that need one.
   This reaches past `updateGoal` on purpose: it refuses to move `startDate`
   precisely so that nothing in the app can do this to a real account. Setting
   the field before any day is logged is a fixture, not an edit — there is no
   history yet for it to re-judge. */
function backdate(id, key) {
  S.goalById(id).startDate = key;
  S.commit({ type: 'test' });
}
S.resetAll();
S.get().goals = [];
const wake = freshGoal({});
ok('normal mode needs 6 steps for 7:30 → 6:00', G.maxLevel(wake, 'normal') === 6, G.maxLevel(wake, 'normal'));
ok('hard mode halves the ladder', G.maxLevel(wake, 'hard') === 3, G.maxLevel(wake, 'hard'));
ok('easy mode doubles it', G.maxLevel(wake, 'easy') === 12, G.maxLevel(wake, 'easy'));
ok('week 1 asks for the baseline', G.valueAt(wake, 0, 'normal') === 450);
ok('normal steps by 15 min', G.valueAt(wake, 1, 'normal') === 435, A.prettyTime(G.valueAt(wake, 1, 'normal')));
ok('hard steps by 30 min', G.valueAt(wake, 1, 'hard') === 420, A.prettyTime(G.valueAt(wake, 1, 'hard')));
ok('level 99 still stops at the target', G.valueAt(wake, 99, 'normal') === 360, A.prettyTime(G.valueAt(wake, 99, 'normal')));
ok('hard mode cannot overshoot either', G.valueAt(wake, 99, 'hard') === 360, A.prettyTime(G.valueAt(wake, 99, 'hard')));

/* ------------------------------------------------------------------ */
section('progression is earned, not granted by the calendar');
backdate(wake.id, A.addDays(t, -5));
ok('a week passing alone changes nothing', S.goalTimeline(wake.id).level === 0, S.goalTimeline(wake.id).level);
ok('and the target is still the baseline', S.goalTarget(wake.id) === 450, A.prettyTime(S.goalTarget(wake.id)));

for (let i = 5; i >= 1; i--) {
  const k = A.addDays(t, -i);
  S.setGoalValue(k, wake.id, S.goalTargetOn(wake.id, k));
}
let tl = S.goalTimeline(wake.id);
ok('5 good days out of 7 earns a step', tl.level === 1, tl.level);
ok('the ask moves to 7:15', tl.target === 435, A.prettyTime(tl.target));
ok('goal streak counts', tl.streak === 5, tl.streak);

section('missing enough steps you back down');
const slip = freshGoal({ name: 'Slip' });
backdate(slip.id, A.addDays(t, -8));
for (let i = 8; i >= 4; i--) {
  const k = A.addDays(t, -i);
  S.setGoalValue(k, slip.id, S.goalTargetOn(slip.id, k));
}
// days -3, -2, -1 are left empty: three consecutive misses
tl = S.goalTimeline(slip.id);
ok('the step up happened', tl.events.some((e) => e.type === 'up'), JSON.stringify(tl.events));
ok('3 consecutive misses step back a level', tl.level === 0, tl.level);
ok('and the ask relaxes to the baseline again', tl.target === 450, A.prettyTime(tl.target));
ok('a slip resets the goal streak', tl.streak === 0, tl.streak);
ok('regression is recorded as an event', tl.events.some((e) => e.type === 'down'));

section('regression can be switched off per goal');
S.updateGoal(slip.id, { regress: false });
ok('no step-back when disabled', S.goalTimeline(slip.id).level === 1, S.goalTimeline(slip.id).level);
S.updateGoal(slip.id, { regress: { misses: 3 } });

/* ------------------------------------------------------------------ */
section('a full run reaches the target and stops');
S.resetAll();
S.get().goals = [];
const marathon = freshGoal({ name: 'Marathon' });
backdate(marathon.id, A.addDays(t, -60));
for (let i = 60; i >= 1; i--) {
  const k = A.addDays(t, -i);
  S.setGoalValue(k, marathon.id, S.goalTargetOn(marathon.id, k));
}
tl = S.goalTimeline(marathon.id);
ok('60 perfect days reaches the target', tl.target === 360, A.prettyTime(tl.target));
ok('level is capped at maxLevel', tl.level === tl.maxLevel && tl.level === 6, tl.level);
ok('reports atTarget', tl.atTarget === true);
ok('there is no next target past the end', tl.nextTarget === null);
ok('60 day goal streak', tl.streak === 60, tl.streak);

section('switching difficulty re-scores, never wipes');
const normalStreak = S.goalTimeline(marathon.id).streak;
S.updateSettings({ mode: 'hard' });
const hard = S.goalTimeline(marathon.id);
ok('hard keeps you at the target', hard.target === 360, A.prettyTime(hard.target));
ok('hard clamps the level to its shorter ladder', hard.level === 3, hard.level);
ok('the streak survives the switch', hard.streak === normalStreak, hard.streak);
ok('completed days stay completed', hard.doneDays === 60, hard.doneDays);
S.updateSettings({ mode: 'easy' });
const easy = S.goalTimeline(marathon.id);
ok('easy re-scores 60 hits onto its longer ladder', easy.level === 12, easy.level);
ok('easy still cannot pass the target', easy.target === 360 && G.valueAt(marathon, 99, 'easy') === 360);
ok('and the streak is still intact', easy.streak === normalStreak, easy.streak);
S.updateSettings({ mode: 'normal' });
ok('switching back is lossless', S.goalTimeline(marathon.id).level === 6);

section('at the same level, easy asks for less than hard');
const cmp = S.addGoal({ name: 'Compare', unit: 'time', direction: 'down', baseline: 450, target: 360, step: 20 });
ok('easy is gentler at level 1', G.valueAt(cmp, 1, 'easy') === 440, A.prettyTime(G.valueAt(cmp, 1, 'easy')));
ok('normal sits in the middle', G.valueAt(cmp, 1, 'normal') === 430, A.prettyTime(G.valueAt(cmp, 1, 'normal')));
ok('hard is the steepest', G.valueAt(cmp, 1, 'hard') === 410, A.prettyTime(G.valueAt(cmp, 1, 'hard')));

section('a completed day can never be un-completed later');
S.resetAll();
S.get().goals = [];
const frozenAsk = freshGoal({ name: 'Frozen' });
backdate(frozenAsk.id, A.addDays(t, -10));
for (let i = 10; i >= 6; i--) {
  const k = A.addDays(t, -i);
  S.setGoalValue(k, frozenAsk.id, S.goalTargetOn(frozenAsk.id, k));
}
const dayFive = A.addDays(t, -5);
S.setGoalValue(dayFive, frozenAsk.id, S.goalTargetOn(frozenAsk.id, dayFive)); // logged at 7:15
ok('the ask was frozen into the entry', S.goalEntry(dayFive, frozenAsk.id).target === 435, S.goalEntry(dayFive, frozenAsk.id).target);
ok('the day counts', S.goalDone(dayFive, frozenAsk.id) === true);
S.updateSettings({ mode: 'hard' });
ok('switching to hard does not un-complete it', S.goalDone(dayFive, frozenAsk.id) === true);
S.updateGoal(frozenAsk.id, { baseline: 400, target: 300 });
ok('moving the goalposts does not un-complete it either', S.goalDone(dayFive, frozenAsk.id) === true);
S.updateSettings({ mode: 'normal' });
S.updateGoal(frozenAsk.id, { baseline: 450, target: 360 });

section('per-goal difficulty overrides the app setting');
ok('app setting is normal', S.settings().mode === 'normal');
S.updateGoal(frozenAsk.id, { mode: 'hard' });
ok('goal override wins', S.goalTimeline(frozenAsk.id).mode === 'hard', S.goalTimeline(frozenAsk.id).mode);
S.updateGoal(frozenAsk.id, { mode: 'inherit' });
ok('back to inheriting', S.goalTimeline(frozenAsk.id).mode === 'normal');

/* ------------------------------------------------------------------ */
section('bedtimes that cross midnight');
const bed = S.addGoal({ name: 'Bed', unit: 'time', direction: 'down', baseline: 30, target: 1350, step: 15, wrapAt: 720 });
ok('00:30 normalises to later than 23:30', G.norm(bed, 30) > G.norm(bed, 1410));
ok('the ladder walks backwards through midnight', G.valueAt(bed, 1, 'normal') === 15, A.prettyTime(G.valueAt(bed, 1, 'normal')));
ok('and lands on 22:30 eventually', G.valueAt(bed, 99, 'normal') === 1350, A.prettyTime(G.valueAt(bed, 99, 'normal')));
ok('00:15 counts as meeting a 00:30 target', G.evaluate(bed, { value: 15 }, 30));
ok('01:00 does not', !G.evaluate(bed, { value: 60 }, 30));

/* ------------------------------------------------------------------ */
section('non-daily schedules');
S.resetAll();
S.get().goals = [];
const gym = S.addGoal({
  name: 'Deep work', unit: 'minutes', direction: 'up', baseline: 25, target: 60, step: 5,
  schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] }
});
backdate(gym.id, A.addDays(t, -21));
const sat = (() => { let k = t; while (A.weekday(k) !== 6) k = A.addDays(k, -1); return k; })();
ok('not scheduled on Saturday', !G.isScheduled(S.goalById(gym.id), sat), sat);
ok('Saturday is absent from the day list', !S.goalsForDay(sat).some((e) => e.goal.id === gym.id));
// hit every weekday for three weeks; weekends stay empty and must not count as misses
for (let i = 21; i >= 1; i--) {
  const k = A.addDays(t, -i);
  if (G.isScheduled(S.goalById(gym.id), k)) S.setGoalValue(k, gym.id, S.goalTargetOn(gym.id, k));
}
tl = S.goalTimeline(gym.id);
ok('weekends never break a weekday goal', tl.level >= 2, tl.level);
ok('only scheduled days are counted', tl.scheduledDays <= 16, tl.scheduledDays);
ok('goal streak skips unscheduled days', tl.streak === tl.doneDays, tl.streak + '/' + tl.doneDays);

/* ------------------------------------------------------------------ */
section('changing a schedule does not rewrite past days');
S.resetAll();
S.get().goals = [];
const sch = S.addGoal({ name: 'Move', unit: 'minutes', direction: 'up', baseline: 10, target: 40, step: 5 });
backdate(sch.id, A.addDays(t, -21));
// Three weeks lived on a DAILY schedule, hitting every single day including weekends.
for (let i = 21; i >= 1; i--) S.setGoalValue(A.addDays(t, -i), sch.id, S.goalTargetOn(sch.id, A.addDays(t, -i)));
const beforeSwitch = S.goalTimeline(sch.id);
const pastSat = (() => { let k = A.addDays(t, -1); while (A.weekday(k) !== 6) k = A.addDays(k, -1); return k; })();
ok('a past Saturday was scheduled under the daily rule', G.isScheduled(S.goalById(sch.id), pastSat), pastSat);
ok('past Saturday is done', S.goalDone(pastSat, sch.id));

// Now switch to weekdays-only. Saturdays from today on stop counting — but the
// three weeks already lived must be judged exactly as they were.
S.updateGoal(sch.id, { schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] } });
const afterSwitch = S.goalTimeline(sch.id);
ok('the switch was recorded as a period', (S.goalById(sch.id).scheduleHistory || []).length === 2, JSON.stringify(S.goalById(sch.id).scheduleHistory));
ok('past Saturday is still a scheduled day', G.isScheduled(S.goalById(sch.id), pastSat), pastSat);
ok('past Saturday is still done', S.goalDone(pastSat, sch.id));
ok('history was not rewritten — same scheduled days', afterSwitch.scheduledDays === beforeSwitch.scheduledDays, beforeSwitch.scheduledDays + ' → ' + afterSwitch.scheduledDays);
ok('history was not rewritten — same level', afterSwitch.level === beforeSwitch.level, beforeSwitch.level + ' → ' + afterSwitch.level);
ok('history was not rewritten — same completed days', afterSwitch.doneDays === beforeSwitch.doneDays, beforeSwitch.doneDays + ' → ' + afterSwitch.doneDays);
// ...and the new rule does apply going forward.
const nextSat = (() => { let k = A.addDays(t, 1); while (A.weekday(k) !== 6) k = A.addDays(k, 1); return k; })();
ok('a future Saturday is no longer scheduled', !G.isScheduled(S.goalById(sch.id), nextSat), nextSat);
// A goal saved before scheduleHistory existed must behave exactly as it used to.
const legacy = S.addGoal({ name: 'Legacy', unit: 'minutes', direction: 'up', baseline: 5, target: 20, step: 5, schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] } });
delete S.goalById(legacy.id).scheduleHistory;
ok('a goal with no history falls back to its current schedule', !G.isScheduled(S.goalById(legacy.id), pastSat) && G.isScheduled(S.goalById(legacy.id), A.addDays(pastSat, 2)));

/* ------------------------------------------------------------------ */
section('the reading gate');
S.resetAll();
const read = S.activeGoals().find((g) => g.gate === 'summary');
ok('reading goal exists', !!read);
ok('not done before anything is written', S.goalDone(t, read.id) === false);
S.hitGoalTarget(t, read.id);
ok('ticking alone cannot complete it', S.goalDone(t, read.id) === false);
ok('an all-whitespace summary is not a summary', S.setReading(t, { summary: '   \n  ' }) === false);
ok('still not done', S.goalDone(t, read.id) === false);
S.setReading(t, { book: 'Deep Work', minutes: 30, summary: 'Attention is trainable; shallow work crowds it out.' });
ok('writing the summary completes the day', S.goalDone(t, read.id) === true);
ok('summary is stored', S.readingEntry(t).summary.length > 10);
ok('minutes are stored on the goal entry', S.goalEntry(t, read.id).value === 30, JSON.stringify(S.goalEntry(t, read.id)));
ok('summary earns xp', S.totalXp() >= A.XP.summary);
S.setReading(t, { summary: '' });
ok('clearing the summary un-completes the day', S.goalDone(t, read.id) === false);
ok('and the reading record is gone', S.readingEntry(t) === null || !S.readingEntry(t).summary);

/* Writing the summary marks the DAY written. It is not the same question as
   whether the reading GOAL was met, and only a check-tracked goal is met by the
   writing alone: a goal that asks for ten minutes has to be given ten minutes.
   Marking the entry `checked` regardless handed out the rung, its XP and a
   streak day for a summary with the minutes box emptied. */
S.setReading(t, { book: 'Deep Work', minutes: null, summary: 'Wrote it up, but did not put the time in.' });
ok('a summary with the minutes cleared does not complete a value-tracked goal',
  S.goalDone(t, read.id) === false, JSON.stringify(S.goalEntry(t, read.id)));
ok('though the day is still written down', !!S.readingEntry(t).summary);
S.setReading(t, { minutes: 4, summary: 'Four minutes of it.' });
ok('and neither does less than the ask', S.goalDone(t, read.id) === false, JSON.stringify(S.goalEntry(t, read.id)));
S.setReading(t, { minutes: S.goalTargetOn(read.id, t), summary: 'Met the ask today.' });
ok('meeting the ask completes it', S.goalDone(t, read.id) === true, JSON.stringify(S.goalEntry(t, read.id)));

// The other half of the same rule: where writing IS the whole ask, it still counts.
S.updateGoal(read.id, { track: 'check' });
S.setReading(t, { minutes: null, summary: 'A check-tracked goal asks for the writing itself.' });
ok('a check-tracked reading goal is still completed by the summary alone', S.goalDone(t, read.id) === true);
S.updateGoal(read.id, { track: 'value' });

section('journal is a separate thing from the reading summary');
S.setReading(t, { summary: 'A summary of what I read.' });
S.setJournal(t, { text: 'A note about my day.', mood: 3 });
ok('both exist independently', S.readingEntry(t).summary !== S.journalEntry(t).text);
ok('journal keeps a mood', S.journalEntry(t).mood === 3);
ok('journal listing finds the day', S.journalDays().indexOf(t) >= 0);
ok('reading listing finds the day', S.readingDays().indexOf(t) >= 0);
S.setJournal(t, { text: '', mood: null });
ok('an emptied journal entry is dropped', S.journalEntry(t) === null);
ok('but the reading summary survives', !!S.readingEntry(t).summary);

/* ------------------------------------------------------------------ */
section('goals count toward the day');
S.resetAll();
S.updateSettings({ goalsCountTowardDay: true });
let ds = S.dayStatus(t);
ok('open goals are counted in the day total', ds.glTotal === S.activeGoals().length, ds.glTotal);
ok('day is not complete with goals outstanding', ds.status !== 'complete', ds.status);
S.updateSettings({ goalsCountTowardDay: false });
ok('the setting removes them again', S.dayStatus(t).glTotal === 0);

section('logging a workout day');
S.updateSettings({ goalsCountTowardDay: false });
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
ok('3-day milestone unlocked', S.rewards().find((r) => r.id === 'm3').unlocked);
const m7 = S.rewards().find((r) => r.id === 'm7');
const xpBefore = S.totalXp();
ok('claim grants xp', S.claimReward('m7') && S.totalXp() === xpBefore + m7.xp, S.totalXp() - xpBefore);
ok('cannot double-claim', S.claimReward('m7') === false);

/* ------------------------------------------------------------------ */
section('streak freezes');
S.resetAll();
S.updateSettings({ goalsCountTowardDay: false, restCountsAsStreak: false });
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
S.get().goals = [];
const hist = freshGoal({ name: 'History' });
backdate(hist.id, A.addDays(t, -10));
for (let i = 10; i >= 1; i--) {
  const k = A.addDays(t, -i);
  S.setGoalValue(hist.id ? k : k, hist.id, S.goalTargetOn(hist.id, k));
}
const oldTarget = S.goalTargetOn(hist.id, A.addDays(t, -10));
ok('day one was judged at the baseline', oldTarget === 450, A.prettyTime(oldTarget));
ok('today is judged at the current level', S.goalTarget(hist.id) < oldTarget, A.prettyTime(S.goalTarget(hist.id)));
S.updateSettings({ mode: 'hard' });
ok('changing mode does not un-complete a past day', S.goalDone(A.addDays(t, -10), hist.id) === true);
S.updateSettings({ mode: 'normal' });

const yesterday = A.addDays(t, -1);
S.updateSettings({ goalsCountTowardDay: false });
S.ensureLog(yesterday);
const beforeCount = S.dayPlan(yesterday).length;
S.addToPlan(A.weekday(yesterday), S.get().exercises[1].id);
ok('editing the weekly template does not rewrite a logged day', S.dayPlan(yesterday).length === beforeCount, S.dayPlan(yesterday).length);

/* ------------------------------------------------------------------ */
section('future days are read-only');
const tomorrow = A.addDays(t, 1);
ok('future status', S.dayStatus(tomorrow).status === 'future');
ok('cannot log the future', S.toggleExercise(tomorrow, 'anything') === false);
ok('cannot log a future goal value', S.setGoalValue(tomorrow, hist.id, 400) === false);
ok('cannot write a future summary', S.setReading(tomorrow, { summary: 'nope' }) === false);

/* A skip is a toggle, and the caller has to be able to tell which way it went —
   an undo offered for "skipped" when the tap actually un-skipped would put the
   day back where the user had just taken it from. */
section('skipping says which way it went');
const skipDay = A.addDays(t, -2);
ok('skipping reports that it skipped', S.skipGoal(skipDay, hist.id) === true);
ok('and the entry agrees', !!S.goalsForDay(skipDay).find((e) => e.goal.id === hist.id && e.skipped));
ok('skipping again reports the un-skip', S.skipGoal(skipDay, hist.id) === false);
ok('and the entry agrees again', !S.goalsForDay(skipDay).find((e) => e.goal.id === hist.id && e.skipped));
ok('a future day cannot be skipped at all', S.skipGoal(tomorrow, hist.id) === false);

section('clock tampering is noticed');
const tampered = JSON.parse(S.exportJson());
tampered.meta.maxSeen = A.addDays(t, 30); // as if the app had already seen a later date
store.set('arise.state.v1', JSON.stringify(tampered));
S.load();
ok('winding the clock back raises a warning', S.get().meta.clockWarning === true);
S.acknowledgeClock();
ok('and can be acknowledged', S.get().meta.clockWarning === false);

/* ------------------------------------------------------------------ */
section('levels & xp');
ok('xpForLevel(1) is 0', A.xpForLevel(1) === 0);
ok('levels are monotonic', [1, 2, 3, 4, 5, 10, 20].every((n) => A.xpForLevel(n + 1) > A.xpForLevel(n)));
ok('levelFromXp inverts xpForLevel', [2, 3, 7, 15].every((n) => A.levelFromXp(A.xpForLevel(n)) === n));
ok('rank advances with level', A.rankFor(1).name !== A.rankFor(60).name);

section('a step back never claws xp back');
S.resetAll();
S.get().goals = [];
const xpGoal = freshGoal({ name: 'XP' });
backdate(xpGoal.id, A.addDays(t, -12));
for (let i = 12; i >= 8; i--) S.setGoalValue(A.addDays(t, -i), xpGoal.id, S.goalTargetOn(xpGoal.id, A.addDays(t, -i)));
const peakXp = S.totalXp();
ok('levelling up paid out', peakXp >= A.XP.levelUp, peakXp);
// days -7..-1 stay empty → regression
ok('the goal stepped back', S.goalTimeline(xpGoal.id).level === 0, S.goalTimeline(xpGoal.id).level);
ok('but the level-up xp is kept', S.totalXp() >= A.XP.levelUp, S.totalXp());

/* ------------------------------------------------------------------ */
section('weekly goal');
S.updateSettings({ goalPerWeek: 1, goalsCountTowardDay: false });
const wdd = A.weekday(t);
if (!S.get().plan[wdd].length) S.addToPlan(wdd, S.get().exercises[0].id);
S.completeAll(t);
ok('weekly goal hit', S.weekStats().hit);
ok('weekly chest claimable once', S.claimWeekly() === true && S.claimWeekly() === false);

section('export / import');
S.setReading(t, { summary: 'Something I read and understood.' });
S.setJournal(t, { text: 'And how the day went.' });
const json = S.exportJson();
const xp = S.totalXp();
const goalCount = S.goals().length;
S.resetAll();
ok('reset clears xp', S.totalXp() === 0, S.totalXp());
S.importJson(json);
ok('import restores xp', S.totalXp() === xp, S.totalXp() + ' vs ' + xp);
ok('import restores goals', S.goals().length === goalCount, S.goals().length);
ok('import restores summaries', !!S.readingEntry(t));
ok('import restores the journal', !!S.journalEntry(t));
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
  okInfo && typeof okInfo.days === 'number' && okInfo.goals === S.goals().length, JSON.stringify(okInfo));
rejects('rejects a file that is not JSON', 'this is my diary, not a backup');
rejects('rejects a JSON array', '[]');
rejects('rejects null', 'null');
rejects('rejects a string', '"backup"');
rejects('rejects a file with no weekly plan', JSON.stringify({ logs: {} }));
rejects('rejects a file with no day logs', JSON.stringify({ plan: {} }));
rejects('rejects goals that are not a list', JSON.stringify({ plan: {}, logs: {}, goals: 'all of them' }));
rejects('rejects a journal that is not an object', JSON.stringify({ plan: {}, logs: {}, journal: [] }));
const newer = rejects('rejects a backup from a newer version of Arise',
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
ok('v1 state loads', S.get().version === 3, S.get().version);
ok('v1 gains the goal engine', S.goals().length > 0, S.goals().length);
ok('old day notes become journal entries', (S.journalEntry(A.addDays(t, -2)) || {}).text === 'an old journal note');
ok('old settings survive', S.settings().name === 'Old' && S.settings().goalPerWeek === 3);
ok('new settings get defaults', S.settings().dayBoundaryHour === 4 && S.settings().mode === 'normal');
ok('best streak is preserved', S.get().bestStreak >= 4, S.get().bestStreak);

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
ok('Monday is the push day', S.get().plan[1].some((i) => S.exerciseById(i.exerciseId).name === 'Dumbbell Floor Press'));
ok('Thursday is recovery, not lifting', S.get().plan[4].every((i) => S.exerciseById(i.exerciseId).category !== 'Strength'));
ok('a day opens with a warm-up', S.exerciseById(S.get().plan[1][0].exerciseId).category === 'Warm-up');
ok('and closes with a stretch', S.exerciseById(S.get().plan[1].slice(-1)[0].exerciseId).category === 'Stretch');
ok('rep ranges survive into the plan', S.get().plan[1].some((i) => i.repsMax > i.reps));
ok('a day overrides the exercise default', (() => {
  const sun = S.get().plan[0].find((i) => S.exerciseById(i.exerciseId).name === 'Goblet Squat');
  return sun && sun.reps === 10; // Sunday asks 10–12 where Wednesday asks 8–12
})());

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
section('pausing or re-baselining never re-judges a day already lived');

S.resetAll();
S.get().goals = [];
S.get().habits = [];
for (let d = 0; d <= 6; d++) S.get().plan[d] = []; // goals alone score these days
S.updateSettings({ goalsCountTowardDay: true, requireHabits: false, completionPct: 100 });

const livedFrom = A.addDays(S.today(), -10);
const ladder = { unit: 'count', direction: 'up', baseline: 1, target: 10, step: 1, startDate: livedFrom };
const kept = S.addGoal(Object.assign({ name: 'Kept' }, ladder));
const paused = S.addGoal(Object.assign({ name: 'Paused later' }, ladder));

// Ten days where one of the two goals was kept: every one of them is a half day.
for (let i = 10; i >= 1; i--) S.hitGoalTarget(A.addDays(S.today(), -i), kept.id);

const sample = A.addDays(S.today(), -5);
const wasStatus = S.dayStatus(sample);
const wasBest = S.history().best;
ok('a half-kept day starts out partial', wasStatus.status === 'partial', `${wasStatus.done}/${wasStatus.total}`);
ok('and sets no best streak', wasBest === 0, wasBest);

S.archiveGoal(paused.id, true);
const nowStatus = S.dayStatus(sample);
ok('pausing leaves that day exactly as it was',
  nowStatus.status === wasStatus.status && nowStatus.total === wasStatus.total,
  `${nowStatus.status} ${nowStatus.done}/${nowStatus.total}`);
ok('and cannot invent a best streak', S.history().best === wasBest, S.history().best);
ok('but the goal does stop being asked from today', S.goalsForDay(S.today()).every((e) => e.goal.id !== paused.id));

S.archiveGoal(paused.id, false);
ok('resuming does not re-judge the stretch either', S.dayStatus(sample).status === wasStatus.status);
ok('and the goal is asked again', S.goalsForDay(S.today()).some((e) => e.goal.id === paused.id));

// A pause that really spans days: only the days inside it stop being asked.
S.goalById(paused.id).activeHistory = [
  { from: livedFrom, archived: false },
  { from: A.addDays(S.today(), -7), archived: true },
  { from: A.addDays(S.today(), -3), archived: false }
];
S.commit({ type: 'test' });
const asked = (k) => S.goalsForDay(k).some((e) => e.goal.id === paused.id);
ok('days before a pause are still asked', asked(A.addDays(S.today(), -9)));
ok('days inside it are not', !asked(A.addDays(S.today(), -5)));
ok('days after it resumes are asked again', asked(A.addDays(S.today(), -2)));

// Re-baselining restarts the ladder from today without touching what came before.
const beforeRestart = S.dayStatus(sample).status;
const askedOnSample = S.goalTimeline(kept.id).targetByDay[sample];
S.restartGoal(kept.id, 7);
const after = S.goalTimeline(kept.id);
ok('the ask recorded for a past day survives a re-baseline',
  after.targetByDay[sample] === askedOnSample, `${after.targetByDay[sample]} vs ${askedOnSample}`);
ok('the lived day keeps its verdict', S.dayStatus(sample).status === beforeRestart, S.dayStatus(sample).status);
ok('the goal still starts where it always did', S.goalById(kept.id).startDate === livedFrom, S.goalById(kept.id).startDate);
ok('but today runs on the new baseline', after.target === 7, after.target);
ok('and the ladder restarted at level 0', after.level === 0, after.level);

// Level-ups are earned; pausing the goal must not take the XP back.
const xpWithPaused = S.totalXp();
S.archiveGoal(kept.id, true);
ok('pausing a goal never claws back its level-up XP', S.totalXp() === xpWithPaused, `${S.totalXp()} vs ${xpWithPaused}`);
S.archiveGoal(kept.id, false);

/* ------------------------------------------------------------------ */
/* The pause tests above all read `dayStatus` and `goalsForDay`, which route
   through `askedOn`. `timeline` and `streak` did not, so a paused stretch was
   still scored as a run of misses — the ladder walked down and the streak broke
   on days the goal was not asking anything. That is invisible to every
   assertion above, which is why this section exists: it reads the numbers the
   ladder itself is made of.

   Note the ordering below. `activeHistory` is installed *before* the days after
   the pause are logged, because `hitGoalTarget` freezes the ask as it stood when
   the day was logged. Logging first and pausing afterwards would re-judge those
   entries against a different ladder — the very bug this file is guarding. */
section('a pause is skipped, not scored as a run of misses');

S.resetAll();
S.get().goals = [];
S.get().habits = [];
for (let d = 0; d <= 6; d++) S.get().plan[d] = [];

const pFrom = A.addDays(S.today(), -20);
const rung = S.addGoal({
  name: 'Paused mid-ladder', unit: 'count', direction: 'up',
  baseline: 1, target: 10, step: 1, startDate: pFrom
});

// Paused across T-7…T-4 — four days, one more than regress.misses (3).
S.goalById(rung.id).activeHistory = [
  { from: pFrom, archived: false },
  { from: A.addDays(S.today(), -7), archived: true },
  { from: A.addDays(S.today(), -3), archived: false }
];
S.commit({ type: 'test' });

for (let i = 20; i >= 8; i--) S.hitGoalTarget(A.addDays(S.today(), -i), rung.id);  // 13 kept
for (let i = 3; i >= 1; i--) S.hitGoalTarget(A.addDays(S.today(), -i), rung.id);   // 3 more after it resumes

const pTl = S.goalTimeline(rung.id);
// 13 hits = two level-ups with three banked; the four paused days must not touch
// that, so the three days after the resume complete the third rung.
ok('the ladder does not walk down over a pause', pTl.level === 3, `level ${pTl.level}`);
ok('the paused days are not counted as asked',
  pTl.scheduledDays === 17, `scheduledDays ${pTl.scheduledDays}`);
ok('and the streak carries across the pause instead of breaking on it',
  pTl.streak === 16, `streak ${pTl.streak}`);
ok('every day it did ask was kept', pTl.doneDays === 16, `doneDays ${pTl.doneDays}`);

/* ------------------------------------------------------------------ */
/* `updateGoal` was a bare Object.assign, which made it the one function in the
   data layer that could rewrite the past. Two ways: moving `startDate` forward
   dropped every lived day out of `askedOn`, and changing `baseline` re-ran the
   whole ladder from the new number as though it had always been that. Both are
   reachable from the goal edit sheet, and onboarding did the first one on
   purpose. The guard belongs here, not at the call sites — a caller added later
   must not be able to reopen it. */
section('updateGoal cannot rewrite a day already lived');

S.resetAll();
S.get().goals = [];
S.get().habits = [];
for (let d = 0; d <= 6; d++) S.get().plan[d] = [];

const uFrom = A.addDays(S.today(), -10);
const edited = S.addGoal({
  name: 'Edited later', unit: 'count', direction: 'up',
  baseline: 2, target: 10, step: 1, startDate: uFrom
});
for (let i = 10; i >= 6; i--) S.hitGoalTarget(A.addDays(S.today(), -i), edited.id);

const uSample = A.addDays(S.today(), -8);
const askBefore = S.goalTimeline(edited.id).targetByDay[uSample];
const schedBefore = S.goalTimeline(edited.id).scheduledDays;
ok('the sample day has a recorded ask to begin with', askBefore != null, String(askBefore));

// WORK-02 — the patch that onboarding used to send.
S.updateGoal(edited.id, { name: 'Renamed', startDate: S.today() });
ok('updateGoal refuses to move startDate',
  S.goalById(edited.id).startDate === uFrom, S.goalById(edited.id).startDate);
ok('so the days already lived stay inside the goal',
  S.goalTimeline(edited.id).scheduledDays === schedBefore,
  `${S.goalTimeline(edited.id).scheduledDays} vs ${schedBefore}`);
ok('and the rest of the patch still applies', S.goalById(edited.id).name === 'Renamed');

// WORK-07 — a baseline edited from the goal sheet.
S.updateGoal(edited.id, { baseline: 6 });
const afterBase = S.goalTimeline(edited.id);
ok('a changed baseline opens a dated era instead of rewriting the ladder',
  Array.isArray(S.goalById(edited.id).baselineHistory) && S.goalById(edited.id).baselineHistory.length === 2,
  JSON.stringify(S.goalById(edited.id).baselineHistory));
ok('so a past day is still judged by the baseline it ran on',
  afterBase.targetByDay[uSample] === askBefore, `${afterBase.targetByDay[uSample]} vs ${askBefore}`);
ok('while today runs on the new one', afterBase.target === 6, afterBase.target);
ok('and startDate never moved', S.goalById(edited.id).startDate === uFrom);

/* ------------------------------------------------------------------ */
section('the real ledger counts life, not points');

S.resetAll();
S.get().goals = [];
S.get().habits = [];
for (let d = 0; d <= 6; d++) S.get().plan[d] = [];

const lifeFrom = A.addDays(S.today(), -9);
const deep = S.addGoal({ name: 'Deep work', unit: 'minutes', direction: 'up', baseline: 30, target: 120, step: 10, startDate: lifeFrom });
const rise = S.addGoal({ name: 'Wake up', unit: 'time', direction: 'down', baseline: 450, target: 360, step: 15, startDate: lifeFrom });

for (let i = 9; i >= 5; i--) {
  const k = A.addDays(S.today(), -i);
  S.setGoalValue(k, deep.id, 60);       // an hour a day, five days
  S.hitGoalTarget(k, rise.id);
}
let life = S.lifeTotals();
const deepRow = life.goals.find((r) => r.goal.id === deep.id);
const riseRow = life.goals.find((r) => r.goal.id === rise.id);

ok('minutes accumulate into a real total', deepRow.total === 300, deepRow && deepRow.total);
ok('and the days are counted too', deepRow.kept === 5, deepRow && deepRow.kept);
ok('a clock goal counts days, never a sum', riseRow.total === null, riseRow && riseRow.total);
ok('because forty mornings at 06:30 do not add up to anything', riseRow.kept === 5, riseRow && riseRow.kept);
ok('goals never logged are left out entirely', life.goals.length === 2, life.goals.length);

S.addExtra(A.addDays(S.today(), -9), 'Long walk');
S.addExtra(A.addDays(S.today(), -8), 'Swim');
life = S.lifeTotals();
ok('freeform sessions count as things you did', life.sessions === 2, life.sessions);
ok('and the days they happened on', life.workoutDays === 2, life.workoutDays);

S.setReading(A.addDays(S.today(), -7), { book: 'Deep Work', summary: 'Attention is trainable.' });
S.setJournal(A.addDays(S.today(), -7), { text: 'Good day.' });
life = S.lifeTotals();
ok('summaries are counted', life.summaries === 1, life.summaries);
ok('journal entries are counted', life.journal === 1, life.journal);
ok('the ledger spans the whole record', life.days === 10, life.days);
ok('and reports days kept, not points', typeof life.kept === 'number' && life.kept >= 0, life.kept);
ok('there is no XP anywhere in it', Object.keys(life).indexOf('xp') < 0 && Object.keys(life).indexOf('level') < 0);

/* ------------------------------------------------------------------ */
section('a fixed-length run');

S.resetAll();
S.get().goals = [];
S.get().habits = [];
for (let d = 0; d <= 6; d++) S.get().plan[d] = [];

ok('there is no run to begin with', S.activeChallenge() === null);
ok('and no progress to report', S.challengeProgress() === null);

const runFrom = A.addDays(S.today(), -4);
const reset = S.startChallenge({ name: 'Reset', days: 66, startDate: runFrom });
let rp = S.challengeProgress();
ok('starting one makes it active', S.activeChallenge().id === reset.id);
ok('day five of a run started four days ago', rp.day === 5, rp.day);
ok('with the length it was given', rp.days === 66, rp.days);
ok('and it is nowhere near complete', rp.complete === false && rp.days - rp.day === 61, rp.days - rp.day);

// Elapsed days and kept days are different numbers and must stay different.
ok('kept counts days completed, not days passed', rp.kept === 0, rp.kept);
S.addExtra(runFrom, 'Something');
S.addExtra(A.addDays(runFrom, 1), 'Something else');
rp = S.challengeProgress();
ok('logging a day moves kept but not the day number', rp.kept === 2 && rp.day === 5, `${rp.kept}/${rp.day}`);

ok('a date before the run has no day number', S.challengeDay(reset, A.addDays(runFrom, -1)) === null);
ok('the first day is day one', S.challengeDay(reset, runFrom) === 1);

const long = S.startChallenge({ name: 'Second', days: 30 });
ok('starting another closes the first', !!S.challenges().find((c) => c.id === reset.id).endedOn);
ok('and only one is ever active', S.challenges().filter((c) => !c.endedOn).length === 1);
ok('the finished run is kept, not deleted', S.challenges().length === 2, S.challenges().length);

S.updateChallenge(long.id, { days: 0 });
ok('length is clamped to at least a day', S.activeChallenge().days === 1, S.activeChallenge().days);
S.updateChallenge(long.id, { days: 30, startDate: A.addDays(S.today(), -40) });
rp = S.challengeProgress();
ok('an overrun run reads as complete', rp.complete === true && rp.day === 30, `${rp.day}/${rp.days}`);

S.endChallenge(long.id);
ok('ending it clears the active run', S.activeChallenge() === null);
ok('without losing the record', S.challenges().length === 2);

// Additive migration: accounts written before runs existed simply have none.
const runLegacy = JSON.parse(S.exportJson());
delete runLegacy.challenges;
S.importJson(JSON.stringify(runLegacy));
ok('an older backup migrates to no runs', Array.isArray(S.challenges()) && S.challenges().length === 0);

/* ------------------------------------------------------------------ */
section('rewards you promise yourself');

S.resetAll();
S.get().goals = [];
S.get().habits = [];
for (let d = 0; d <= 6; d++) S.get().plan[d] = [];
S.updateSettings({ goalsCountTowardDay: true, requireHabits: false, completionPct: 100 });

const rwFrom = A.addDays(S.today(), -20);
const rwGoal = S.addGoal({ name: 'Workout', unit: 'count', direction: 'up', baseline: 1, target: 10, step: 1, startDate: rwFrom });
// Fourteen kept days, then a week of nothing: the run is over but it happened.
for (let i = 20; i >= 7; i--) S.hitGoalTarget(A.addDays(S.today(), -i), rwGoal.id);

ok('a goal remembers its best run', S.goalTimeline(rwGoal.id).bestStreak === 14, S.goalTimeline(rwGoal.id).bestStreak);
ok('while the current streak has gone', S.goalTimeline(rwGoal.id).streak === 0, S.goalTimeline(rwGoal.id).streak);

const rwShoes = S.addCustomReward({ name: 'Sneakers', icon: '👟', source: 'goal', goalId: rwGoal.id, days: 14 });
let rwP = S.customRewardProgress(rwShoes);
ok('a promise is earned on the best run, not the current one', rwP.unlocked && rwP.have === 14, `${rwP.have}/${rwP.need}`);
ok('and it is not collected until you say so', rwP.claimed === false);

const rwBike = S.addCustomReward({ name: 'New rwBike', source: 'goal', goalId: rwGoal.id, days: 30 });
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

const rwAway = S.addCustomReward({ name: 'Weekend away', source: 'rwAway', days: 3 });
ok('an rwAway reward reads the whole-day streak', S.customRewardProgress(rwAway).need === 3);
ok('switching away from a goal drops the goal link', S.customRewards().find((r) => r.id === rwAway.id).goalId === null);

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
S.hitGoalTarget(S.today(), (S.activeGoals()[0] || {}).id);
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
S.addHabit('Doomed', '💾');
ok('a refused write is announced', S.get().meta.storageError === 'unwritable', S.get().meta.storageError);

sandbox.localStorage.setItem = realSetItem;
S.addHabit('Fine now', '💾');
ok('a later successful write clears it', S.get().meta.storageError === null, S.get().meta.storageError);

// The two conditions are not interchangeable: missing data stays missing whether
// or not the next write happens to succeed.
S.get().meta.storageError = 'unreadable';
S.addHabit('Yet another', '💾');
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

S.addHabit('Flush me', '💾');
ok('the follow-up write is still only scheduled', store.get('arise.state.v1') === flushedBase);
S.flush();
ok('flush forces it out immediately', store.get('arise.state.v1') !== flushedBase);
ok('and what landed contains the change', (store.get('arise.state.v1') || '').indexOf('Flush me') > 0);
ok('flushing again with nothing pending is harmless', (S.flush(), store.get('arise.state.v1').indexOf('Flush me') > 0));

// Typing debounces longer than tapping, so flush has to cover it too or the
// last words of a journal entry are lost when the app is backgrounded.
const beforeTyping = store.get('arise.state.v1');
S.setJournal(S.today(), { text: 'Something I would hate to lose.' });
ok('a journal keystroke does not write straight away', store.get('arise.state.v1') === beforeTyping);
S.flush();
ok('but flush captures it', (store.get('arise.state.v1') || '').indexOf('hate to lose') > 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
