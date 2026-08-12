/* Discipline — state, persistence and all derived stats (streaks, XP, rewards). */
(function (root) {
  'use strict';

  const A = root.Arise;
  const G = A.Goals;
  const STORAGE_KEY = 'arise.state.v1';
  // The one deliberate exception to "all state lives under one key". This is a
  // lifeboat, not state: nothing in the normal read path ever touches it. It
  // exists so the single-key rule can never cost a user their history.
  const QUARANTINE_KEY = 'arise.state.v1.unreadable';
  const STATE_VERSION = 4;

  /* ---------- defaults ---------- */

  /* The generic library plus the built-in program, deduplicated by name so a
     lift the program shares with the starter seed (Plank, Walking) stays one
     exercise rather than two rows that mean the same thing. Program entries win,
     because they carry the `how` coaching notes. */
  function seedExerciseList() {
    const byName = new Map();
    A.SEED_EXERCISES.forEach((e) => byName.set(e.name, Object.assign({}, e)));
    (A.PROGRAM_EXERCISES || []).forEach((e) => byName.set(e.name, Object.assign({}, byName.get(e.name), e)));
    return Array.from(byName.values()).map((e) => Object.assign({ id: A.uid('ex') }, e));
  }

  /** Turn one PROGRAM_WEEK entry into a stored plan item, falling back to the
      exercise's own defaults for anything the day does not override. */
  function planItemFor(ex, spec) {
    return {
      id: A.uid('pi'),
      exerciseId: ex.id,
      sets: spec.sets != null ? spec.sets : ex.sets,
      reps: spec.reps != null ? spec.reps : ex.reps,
      repsMax: spec.repsMax != null ? spec.repsMax : ex.repsMax,
      minutes: spec.minutes != null ? spec.minutes : ex.minutes,
      km: spec.km != null ? spec.km : ex.km,
      note: spec.note || ''
    };
  }

  /** The built-in program laid out across the seven days. */
  function programPlan(exercises) {
    const plan = {};
    for (let d = 0; d <= 6; d++) {
      const day = (A.PROGRAM_WEEK && A.PROGRAM_WEEK[d]) || { items: [] };
      plan[d] = (day.items || [])
        .map((spec) => {
          const ex = exercises.find((x) => x.name === spec.name);
          return ex ? planItemFor(ex, spec) : null;
        })
        .filter(Boolean);
    }
    return plan;
  }

  function seedState() {
    const exercises = seedExerciseList();
    const habits = A.SEED_HABITS.map((h) => Object.assign({ id: A.uid('hb') }, h));
    const plan = programPlan(exercises);

    const start = A.todayKey(4);
    const goals = A.SEED_GOALS.filter((s) => s.enabled !== false).map((s) => {
      const g = G.fromSeed(s, start);
      if (s.key === 'sleep') g.wrapAt = 720; // a 00:30 bedtime is later than 23:30, not earlier
      delete g.enabled;
      return g;
    });

    return {
      version: STATE_VERSION,
      createdAt: start,
      exercises,
      habits,
      plan,
      goals,
      logs: {},
      goalLogs: {},   // dateKey -> goalId -> { value, checked, skipped, at }
      reading: {},    // dateKey -> { book, summary, savedAt }
      journal: {},    // dateKey -> { text, mood, updatedAt }
      freezes: {},    // dateKey -> true  (a streak freeze the user spent)
      claimed: {},
      weeklyClaims: {},
      // Rewards the user promises themselves: "14 days of workouts → new sneakers".
      customRewards: [],
      // A fixed-length run — "66 days" — that the day counter counts against.
      challenges: [],
      /* The 66-day run, or null for the great majority of accounts that never
         start one. It is a separate thing from `goals` on purpose — see the
         header of js/run.js — and nothing here reads or writes the other. */
      run: null,
      bestStreak: 0,
      // programInstalled is already true here: seedState lays the program out
      // directly, so a later migrate() must not install it a second time over a
      // plan the user has since edited. storageError describes the health of
      // storage itself rather than the user's data: 'unreadable' means a saved
      // state existed but could not be parsed.
      meta: {
        maxSeen: start, lastTick: Date.now(), clockWarning: false,
        onboarded: false, programInstalled: true, storageError: null
      },
      settings: {
        name: 'Hunter',
        mode: 'normal',
        dayBoundaryHour: 4,
        goalPerWeek: 5,
        requireHabits: false,
        goalsCountTowardDay: true,
        runCountsTowardDay: true,
        restCountsAsStreak: true,
        completionPct: 100,
        reduceMotion: false,
        reminders: false
      }
    };
  }

  /* ---------- persistence ---------- */

  let state = null;
  const listeners = new Set();
  let saveTimer = null;
  let journalTimer = null; // typing debounces longer than tapping does
  let unreadableRaw = null; // the bytes that would not parse, kept for this session
  let writesBlocked = false; // set only when those bytes could not be copied anywhere

  function load() {
    tlCache.clear();
    dsCache.clear();

    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      // Storage itself is unavailable (blocked, or a private window that refuses).
      // There is nothing to lose here — nothing was ever readable.
      console.warn('Discipline: storage could not be read.', err);
    }

    if (raw) {
      try {
        state = migrate(JSON.parse(raw));
        checkClock();
        return state;
      } catch (err) {
        console.warn('Discipline: saved data could not be read.', err);
        return startFresh(raw);
      }
    }

    state = seedState();
    save();
    return state;
  }

  /**
   * A saved state existed but could not be read.
   *
   * It is the only copy the user has, so the bytes are preserved BEFORE anything
   * is allowed to overwrite them: the raw string is quarantined under its own key
   * and read back to prove it landed. Only a verified copy makes seeding
   * non-destructive. If no copy could be made, the seed lives in memory alone and
   * writes stay blocked, so the unreadable original survives on disk for a later
   * attempt rather than being replaced by a blank app.
   */
  function startFresh(raw) {
    unreadableRaw = raw;
    const preserved = quarantine(raw);
    state = seedState();
    state.meta.storageError = 'unreadable';
    if (preserved) save();
    else writesBlocked = true;
    return state;
  }

  /** @returns {boolean} true only if a copy of the original bytes is now on disk. */
  function quarantine(raw) {
    try {
      // Write once. The first failure holds the bytes closest to the user's real
      // data; a later one would only be of something this app wrote itself.
      if (localStorage.getItem(QUARANTINE_KEY) != null) return true;
      localStorage.setItem(QUARANTINE_KEY, raw);
      return localStorage.getItem(QUARANTINE_KEY) === raw;
    } catch (err) {
      console.error('Discipline: the unreadable copy could not be quarantined.', err);
      return false;
    }
  }

  /** The bytes that would not parse, so the user can get them off the device. */
  function unreadableBackup() {
    if (unreadableRaw != null) return unreadableRaw;
    try {
      return localStorage.getItem(QUARANTINE_KEY);
    } catch (err) {
      return null;
    }
  }

  /** The day the user is living in, honouring the grace window. */
  function today() {
    return A.todayKey(state ? state.settings.dayBoundaryHour : 4);
  }

  /**
   * A local-only app can't fully trust the device clock, and winding it back is
   * the easiest way to fake a streak. We can't prevent it, so we notice it and
   * say so rather than silently rewarding it.
   */
  function checkClock() {
    const t = today();
    const meta = state.meta;
    if (meta.maxSeen && t < meta.maxSeen) meta.clockWarning = true;
    else if (t > meta.maxSeen) meta.maxSeen = t;
    if (meta.lastTick && Date.now() < meta.lastTick - 120000) meta.clockWarning = true;
    meta.lastTick = Date.now();
    save();
  }

  function acknowledgeClock() {
    state.meta.clockWarning = false;
    state.meta.maxSeen = today();
    commit({ type: 'clockAck' });
  }

  function migrate(s) {
    const base = seedState();
    s.settings = Object.assign({}, base.settings, s.settings || {});
    s.logs = s.logs || {};
    s.claimed = s.claimed || {};
    s.weeklyClaims = s.weeklyClaims || {};
    s.exercises = s.exercises || base.exercises;
    s.habits = s.habits || [];
    s.plan = s.plan || base.plan;
    for (let d = 0; d <= 6; d++) if (!Array.isArray(s.plan[d])) s.plan[d] = [];
    s.createdAt = s.createdAt || A.todayKey(s.settings.dayBoundaryHour);
    s.bestStreak = s.bestStreak || 0;

    /* v1 → v2: goals, journal, reading and freezes. Existing logs are untouched. */
    s.goals = Array.isArray(s.goals) ? s.goals : base.goals;
    s.goalLogs = s.goalLogs || {};
    s.reading = s.reading || {};
    s.journal = s.journal || {};
    s.freezes = s.freezes || {};
    // Additive: an account written before custom rewards existed simply has none.
    s.customRewards = Array.isArray(s.customRewards) ? s.customRewards : [];
    s.challenges = Array.isArray(s.challenges) ? s.challenges : [];

    /* v3 → v4: the 66-day run. Purely additive, and null is the honest default:
       an account written before runs existed has not started one, and inventing
       a run for it would put a programme in front of somebody who never asked
       for one. Nothing in goals, logs, streaks or journals is touched. */
    const isRunObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
    if (!isRunObj(s.run)) s.run = null;
    if (s.run) {
      s.run.habits = Array.isArray(s.run.habits) ? s.run.habits : [];
      s.run.log = isRunObj(s.run.log) ? s.run.log : {};
      s.run.minutesBudget = Number(s.run.minutesBudget) || 45;
      // Bookkeeping added after runs shipped: absent means never checked in.
      if (typeof s.run.checkedOn !== 'number') s.run.checkedOn = null;
      // Per-run checklists arrived after runs did. Absent means "use the
      // catalog's defaults", which is what `A.Run.itemsFor` already does.
      s.run.habits.forEach((p) => { if (!Array.isArray(p.items)) delete p.items; });
    }
    // Read this BEFORE merging defaults: base.meta says the program is installed
    // (seedState lays it out itself), which would mask an old account that has
    // never seen it.
    const hadProgram = !!(s.meta && s.meta.programInstalled);
    s.meta = Object.assign({}, base.meta, s.meta || {});

    s.goals.forEach((g) => {
      g.schedule = g.schedule || { type: 'daily' };
      g.advance = Object.assign({}, G.DEFAULT_ADVANCE, g.advance || {});
      if (g.regress !== false) g.regress = Object.assign({}, G.DEFAULT_REGRESS, g.regress || {});
      g.mode = g.mode || 'inherit';
      g.track = g.track || 'value';
      g.startDate = g.startDate || s.createdAt;
      g.archived = !!g.archived;
      /* A goal already paused when dated activation shipped carries no record of
         WHEN it was paused, and guessing would move days the user has already
         lived. Grandfather it as never having been asked: that reproduces exactly
         the history this account computes today, so the fix moves nobody's past
         and binds only from here on. A `startDate` an old re-baseline moved is
         likewise left where it is — un-moving it would re-judge days too. */
      if (g.archived && !Array.isArray(g.activeHistory)) {
        g.activeHistory = [{ from: g.startDate, archived: true }];
      }
    });

    // Old journals lived on the day log; lift them into the journal proper.
    for (const k in s.logs) {
      const note = s.logs[k] && s.logs[k].note;
      if (note && !s.journal[k]) s.journal[k] = { text: note, mood: null, updatedAt: k };
    }

    /* v2 → v3: the built-in training program. Runs exactly once, tracked by a
       flag rather than the version number, so re-running a later migration can
       never wipe a plan the user has since rebuilt by hand. */
    if (!hadProgram) {
      installProgram(s);
      s.meta.programInstalled = true;
    }

    s.version = STATE_VERSION;
    return s;
  }

  /**
   * Merge the program into an existing account.
   *
   * The library is additive: an exercise the user already has keeps their name,
   * sets and reps, and only gains the coaching notes it was missing. Nothing is
   * ever deleted, because a removed exercise would orphan plan items.
   *
   * The weekly plan IS replaced — that is the point of installing a program —
   * but no logged day changes, because `ensureLog` freezes a day's exercises
   * into that day's log the first time it is touched.
   */
  function installProgram(s) {
    (A.PROGRAM_EXERCISES || []).forEach((p) => {
      const existing = s.exercises.find((e) => e.name === p.name);
      if (!existing) {
        s.exercises.push(Object.assign({ id: A.uid('ex') }, p));
        return;
      }
      // Fill gaps only — never overwrite something the user has edited.
      if (!existing.how && p.how) existing.how = p.how;
      if (existing.repsMax == null && p.repsMax != null) existing.repsMax = p.repsMax;
    });
    s.plan = programPlan(s.exercises);
  }

  function save() {
    // Set only when an unreadable state could not be copied anywhere. Writing now
    // would replace the user's only data with a seed, which is the loss this
    // whole path exists to prevent. Import or reset lifts it.
    if (writesBlocked) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeNow();
    }, 60);
  }

  /**
   * Force a pending write out immediately.
   *
   * The 60ms debounce is invisible to the user, but a phone can freeze or discard
   * a backgrounded PWA without ever running the timer — so the last tap of the
   * day, on the only device holding the data, would simply vanish. `app.js` calls
   * this when the page is hidden or unloading.
   */
  function flush() {
    if (saveTimer == null && journalTimer == null) return;
    clearTimeout(saveTimer);
    clearTimeout(journalTimer);
    saveTimer = null;
    journalTimer = null;
    writeNow();
  }

  function writeNow() {
    if (writesBlocked || !state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // Only ever clear the condition this function owns. 'unreadable' describes
      // data that is still missing, and a healthy write does not bring it back.
      if (state.meta.storageError === 'unwritable') {
        state.meta.storageError = null;
        emit({ type: 'storageRecovered' });
      }
    } catch (err) {
      // Every view still renders from the in-memory state, so without this the
      // app reports success while nothing persists and the user finds out days
      // later. Announce it and let the banner offer an export.
      console.error('Discipline: save failed (storage full?).', err);
      if (state.meta.storageError == null) {
        state.meta.storageError = 'unwritable';
        emit({ type: 'storageError' });
      }
    }
  }

  function emit(detail) {
    listeners.forEach((fn) => fn(detail || {}));
  }

  /**
   * Mutations must stay O(1). The best-streak high-water mark used to be
   * recomputed here, which walked every day since install on every single tap —
   * fine on day three, quadratic by year two. history() now keeps it instead.
   */
  function commit(detail) {
    tlCache.clear();
    dsCache.clear();
    save();
    emit(detail);
  }

  /* ---------- lookups ---------- */

  const get = () => state;
  const settings = () => state.settings;
  const exerciseById = (id) => state.exercises.find((e) => e.id === id) || null;
  const habitById = (id) => state.habits.find((h) => h.id === id) || null;

  /** Plan items scheduled for a date: the frozen snapshot if the day was touched,
      otherwise the live weekday template. Editing the plan never rewrites history. */
  function dayPlan(dateKey) {
    const log = state.logs[dateKey];
    if (log && log.plan) return log.plan;
    return state.plan[A.weekday(dateKey)] || [];
  }

  function dayHabits(dateKey) {
    const log = state.logs[dateKey];
    if (log && log.habits) return log.habits;
    return state.habits;
  }

  function log(dateKey) {
    return state.logs[dateKey] || null;
  }

  /** Create (and freeze) the log for a date so edits have somewhere to land. */
  function ensureLog(dateKey) {
    let l = state.logs[dateKey];
    if (!l) {
      l = state.logs[dateKey] = {
        plan: (state.plan[A.weekday(dateKey)] || []).map((i) => Object.assign({}, i)),
        habits: state.habits.map((h) => Object.assign({}, h)),
        ex: {},
        hb: {},
        extra: [],
        note: ''
      };
    }
    l.ex = l.ex || {};
    l.hb = l.hb || {};
    l.extra = l.extra || [];
    return l;
  }

  /* ---------- goals ---------- */

  const tlCache = new Map();

  const goals = () => state.goals || [];
  const activeGoals = () => goals().filter((g) => !g.archived);
  const goalById = (id) => goals().find((g) => g.id === id) || null;

  /** A day's raw entry for a goal. Gated goals fold in the summary they depend on. */
  function goalEntry(dateKey, goalId) {
    const g = goalById(goalId);
    const day = state.goalLogs[dateKey];
    let e = day && day[goalId] ? day[goalId] : null;
    if (g && g.gate === 'summary') {
      const r = state.reading[dateKey];
      const summary = (r && r.summary) || '';
      if (!e && !summary) return null;
      e = Object.assign({ checked: false, value: null }, e, { summary: summary });
    }
    return e;
  }

  /** Derived level/target for a goal. Cached — history() walks a lot of days. */
  function goalTimeline(goalId) {
    const g = goalById(goalId);
    if (!g) return null;
    const cacheKey = goalId + '|' + today();
    if (tlCache.has(cacheKey)) return tlCache.get(cacheKey);
    const ctx = {
      today: today(),
      mode: settings().mode,
      entry: (k) => goalEntry(k, goalId),
      frozen: (k) => !!state.freezes[k]
    };
    const tl = G.timeline(g, ctx);
    tl.streak = G.streak(g, ctx, tl);
    tlCache.set(cacheKey, tl);
    return tl;
  }

  const goalTarget = (goalId) => {
    const tl = goalTimeline(goalId);
    return tl ? tl.target : null;
  };

  /** What the goal asked for on a day — the frozen ask if one was recorded. */
  function goalTargetOn(goalId, dateKey) {
    const g = goalById(goalId);
    if (!g) return null;
    const day = state.goalLogs[dateKey];
    const raw = day && day[goalId];
    if (raw && raw.target != null) return raw.target;
    const tl = goalTimeline(goalId);
    return tl ? G.targetOn(g, dateKey, tl, settings().mode) : null;
  }

  function goalDone(dateKey, goalId) {
    const g = goalById(goalId);
    if (!g) return false;
    return G.evaluate(g, goalEntry(dateKey, goalId), goalTargetOn(goalId, dateKey));
  }

  /**
   * Was this goal asking anything on that day?
   *
   * The answer lives in `goals.js` — it touches no storage, and the ladder needs
   * the same answer this layer gives. Kept here as a delegate so the callers
   * below read the same as they always did.
   */
  function askedOn(g, dateKey) {
    return G.askedOn(g, dateKey);
  }

  /** Everything a given day actually asks of you, with its target frozen to that day. */
  function goalsForDay(dateKey) {
    return goals()
      .filter((g) => askedOn(g, dateKey))
      .map((g) => {
        const tl = goalTimeline(g.id);
        const target = goalTargetOn(g.id, dateKey);
        const entry = goalEntry(dateKey, g.id);
        return {
          goal: g,
          tl,
          target,
          entry,
          done: G.evaluate(g, entry, target),
          skipped: !!(entry && entry.skipped),
          streak: tl ? tl.streak : 0
        };
      });
  }

  /** Creates the entry and freezes the ask that was in force at that moment. */
  function ensureGoalLog(dateKey, goalId) {
    const ask = goalTargetOn(goalId, dateKey);
    const day = (state.goalLogs[dateKey] = state.goalLogs[dateKey] || {});
    const e = (day[goalId] = day[goalId] || { value: null, checked: false, skipped: false, at: null, target: null });
    if (e.target == null) e.target = ask;
    return e;
  }

  function setGoalValue(dateKey, goalId, value) {
    if (isFuture(dateKey)) return false;
    const e = ensureGoalLog(dateKey, goalId);
    e.value = value === '' || value == null ? null : Number(value);
    e.skipped = false;
    e.at = Date.now();
    commit({ type: 'goalValue', dateKey, goalId });
    return goalDone(dateKey, goalId);
  }

  /** One-tap completion: records exactly the target that was asked for. */
  function hitGoalTarget(dateKey, goalId) {
    if (isFuture(dateKey)) return false;
    const g = goalById(goalId);
    if (!g) return false;
    const e = ensureGoalLog(dateKey, goalId);
    const done = goalDone(dateKey, goalId);
    if (done) {
      e.value = null;
      e.checked = false;
    } else {
      e.value = g.track === 'check' ? null : goalTargetOn(goalId, dateKey);
      e.checked = true;
    }
    e.skipped = false;
    e.at = Date.now();
    commit({ type: 'goalHit', dateKey, goalId });
    return !done;
  }

  /** Deliberately skipping a scheduled day: honest, and it still breaks the chain.
      Toggles, and returns the state it landed in — the caller needs to know
      whether it just skipped or just un-skipped to say the right thing. */
  function skipGoal(dateKey, goalId) {
    if (isFuture(dateKey)) return false;
    const e = ensureGoalLog(dateKey, goalId);
    e.skipped = !e.skipped;
    if (e.skipped) {
      e.value = null;
      e.checked = false;
    }
    e.at = Date.now();
    commit({ type: 'goalSkip', dateKey, goalId });
    return e.skipped;
  }

  function clearGoalEntry(dateKey, goalId) {
    const day = state.goalLogs[dateKey];
    if (!day) return;
    delete day[goalId];
    commit({ type: 'goalClear', dateKey, goalId });
  }

  /* ---------- goal CRUD ---------- */

  function addGoal(data) {
    const g = G.fromSeed(
      Object.assign(
        {
          name: 'New goal', icon: '🎯', section: 'custom',
          unit: 'minutes', direction: 'up', baseline: 5, target: 30, step: 5,
          blurb: ''
        },
        data || {}
      ),
      (data && data.startDate) || today()
    );
    state.goals.push(g);
    commit({ type: 'goalAdd', id: g.id });
    return g;
  }

  const sameSchedule = (a, b) => JSON.stringify(a || { type: 'daily' }) === JSON.stringify(b || { type: 'daily' });

  /**
   * Close off the old schedule and start the new one from today, so past days keep
   * being judged by the schedule you actually kept on them. Days you already lived
   * are never re-scheduled — the same rule that protects frozen targets and plans.
   */
  function recordScheduleChange(g, previous) {
    if (sameSchedule(previous, g.schedule)) return;
    if (!Array.isArray(g.scheduleHistory)) g.scheduleHistory = [];
    if (!g.scheduleHistory.length) {
      // Everything up to now ran on the schedule the goal is leaving behind.
      g.scheduleHistory.push({ from: g.startDate || today(), schedule: JSON.parse(JSON.stringify(previous || { type: 'daily' })) });
    }
    const from = today();
    const last = g.scheduleHistory[g.scheduleHistory.length - 1];
    const next = JSON.parse(JSON.stringify(g.schedule));
    // Several edits on the same day collapse into one period.
    if (last.from === from) last.schedule = next;
    else g.scheduleHistory.push({ from: from, schedule: next });
  }

  /**
   * Edit a goal, without any edit reaching backwards.
   *
   * Two fields cannot simply be assigned, and the guard lives here rather than
   * at the call sites so a caller written later cannot reopen the hole:
   *
   * - `startDate` is rejected outright. It is where the goal's whole history
   *   hangs from, so moving it forward drops every day already lived out of
   *   `askedOn` — the record does not change, it just stops being counted.
   *   Re-baselining is what callers actually wanted, and `restartGoal` does it.
   * - `baseline` is diverted into `restartGoal`, which closes the era the goal
   *   has been running in and opens a new one from today. Assigning it directly
   *   re-runs the entire ladder as though the new number had always been true.
   */
  function updateGoal(id, patch) {
    const g = goalById(id);
    if (!g) return;
    const next = Object.assign({}, patch);
    delete next.startDate;
    const rebaseline =
      Object.prototype.hasOwnProperty.call(next, 'baseline') && Number(next.baseline) !== Number(g.baseline);
    const baseline = next.baseline;
    delete next.baseline; // restartGoal applies it, after the old era is closed

    const previousSchedule = g.schedule;
    Object.assign(g, next);
    if (g.schedule && g.schedule.type === 'weekdays' && !(g.schedule.days || []).length) {
      g.schedule = { type: 'daily' };
    }
    recordScheduleChange(g, previousSchedule);
    // restartGoal commits, so the whole edit still lands in exactly one revision.
    if (rebaseline) restartGoal(id, baseline);
    else commit({ type: 'goalUpdate', id });
  }

  /**
   * Close off the period the goal was running (or paused) and start the new one
   * from today, so days already lived keep counting exactly what they counted.
   * Same shape, and same reason, as recordScheduleChange.
   */
  function recordActiveChange(g, archived) {
    const from = today();
    if (!Array.isArray(g.activeHistory) || !g.activeHistory.length) {
      // Everything up to now ran in the state the goal is leaving behind.
      g.activeHistory = [{ from: g.startDate || from, archived: !archived }];
    }
    const last = g.activeHistory[g.activeHistory.length - 1];
    // Pausing and resuming on the same day collapses into one period.
    if (last.from === from) last.archived = archived;
    else g.activeHistory.push({ from: from, archived: archived });
  }

  function archiveGoal(id, on) {
    const g = goalById(id);
    if (!g) return;
    const previous = !!g.archived;
    g.archived = on == null ? !g.archived : !!on;
    if (g.archived !== previous) recordActiveChange(g, g.archived);
    commit({ type: 'goalArchive', id });
  }

  function removeGoal(id) {
    state.goals = state.goals.filter((g) => g.id !== id);
    for (const k in state.goalLogs) delete state.goalLogs[k][id];
    commit({ type: 'goalRemove', id });
  }

  /**
   * Re-baseline to where you actually are today, without wiping the record.
   *
   * `startDate` deliberately stays put. Moving it forward used to be how the
   * ladder was restarted, but it also dropped every earlier day out of
   * `askedOn`, which silently re-scored days the user had already lived. The
   * restart is recorded as a dated era instead: today still becomes day one.
   */
  function restartGoal(id, baseline) {
    const g = goalById(id);
    if (!g) return;
    const from = today();
    const previous = g.baseline;
    if (baseline != null) g.baseline = Number(baseline);
    if (!Array.isArray(g.baselineHistory) || !g.baselineHistory.length) {
      g.baselineHistory = [{ from: g.startDate || from, baseline: previous }];
    }
    const last = g.baselineHistory[g.baselineHistory.length - 1];
    // Several re-baselines on the same day collapse into one era.
    if (last.from === from) last.baseline = g.baseline;
    else g.baselineHistory.push({ from: from, baseline: g.baseline });
    commit({ type: 'goalRestart', id });
  }

  /* ---------- reading & journal ---------- */

  const readingEntry = (dateKey) => state.reading[dateKey] || null;

  /**
   * Saving the summary *is* the completion — there is no second checkbox to
   * fall out of sync with. An empty summary clears the day again.
   */
  function setReading(dateKey, patch) {
    if (isFuture(dateKey)) return false;
    const cur = state.reading[dateKey] || { book: '', summary: '', minutes: null, savedAt: null };
    const next = Object.assign({}, cur, patch);
    next.summary = String(next.summary || '');
    const has = !!next.summary.trim();
    if (!has && !next.book) delete state.reading[dateKey];
    else {
      next.savedAt = has ? next.savedAt || Date.now() : null;
      state.reading[dateKey] = next;
    }
    const g = activeGoals().find((x) => x.gate === 'summary');
    if (g) {
      const e = ensureGoalLog(dateKey, g.id);
      if (has) {
        if (next.minutes != null) e.value = Number(next.minutes);
        /* Writing the summary is what marks the day written. Whether the reading
           GOAL was met is a separate question, and only a check-tracked goal is
           met by the writing itself — a goal that asks for ten minutes has to be
           given ten minutes. `checked` unconditionally meant a rung, its XP and
           a streak day for a summary saved with the minutes box emptied. */
        e.checked = g.track === 'check';
        e.skipped = false;
        e.at = e.at || Date.now();
      } else {
        e.checked = false;
        e.value = null;
      }
    }
    commit({ type: 'reading', dateKey });
    return has;
  }

  function readingDays() {
    return Object.keys(state.reading)
      .filter((k) => (state.reading[k].summary || '').trim())
      .sort((a, b) => (a < b ? 1 : -1));
  }

  const journalEntry = (dateKey) => state.journal[dateKey] || null;

  function setJournal(dateKey, patch) {
    const cur = state.journal[dateKey] || { text: '', mood: null, updatedAt: null };
    const next = Object.assign({}, cur, patch);
    next.text = String(next.text || '');
    if (!next.text.trim() && next.mood == null) delete state.journal[dateKey];
    else {
      next.updatedAt = Date.now();
      state.journal[dateKey] = next;
    }
    // Deliberately no emit: re-rendering on every keystroke would steal focus
    // from the textarea the user is typing into.
    //
    // And a longer debounce than a tap gets. A tap is one write; typing is one
    // per keystroke, and each one re-serialises the whole state — which on a
    // multi-year account is megabytes on the main thread. flush() still catches
    // the last words when the page is hidden or closed.
    if (writesBlocked) return;
    clearTimeout(journalTimer);
    journalTimer = setTimeout(() => {
      journalTimer = null;
      writeNow();
    }, 500);
  }

  function journalDays() {
    return Object.keys(state.journal)
      .filter((k) => (state.journal[k].text || '').trim() || state.journal[k].mood != null)
      .sort((a, b) => (a < b ? 1 : -1));
  }

  /* ---------- streak freezes ---------- */

  /** Earned by showing up, spent by hand — no silent magic on a day you missed. */
  /* ---------- the 66-day run ---------- */

  /* Everything below is a thin shell over `A.Run`, which is pure. The rule the
     shell exists to keep is that the run is *stored* rather than recomputed:
     `recordRunDay` freezes what a day asked at the moment it was lived, so
     softening in week five cannot change what week two is shown to have asked
     for. See js/run.js. */

  const run = () => state.run;

  function runStatus() {
    return state.run ? A.Run.where(state.run, today()) : null;
  }

  /** The run's current day number, or null when there is no run to be on. */
  function runToday() {
    const st = runStatus();
    return st && st.running ? st.day : null;
  }

  function startRun(picks, minutesBudget) {
    // One run at a time. Replacing a live one would erase days the user earned,
    // which is the same thing the day counter refuses to do.
    if (state.run) return state.run;
    state.run = A.Run.buildRun(today(), minutesBudget || 45, picks);
    commit({ type: 'runStart' });
    return state.run;
  }

  function endRun() {
    if (!state.run) return;
    state.run = null;
    commit({ type: 'runEnd' });
  }

  /** Freeze one day of the run. `done` is a list of ids, `did` a map of
      measurements — see A.Run.recordDay for why they are separate. */
  function recordRunDay(day, done, did) {
    if (!state.run || !(day >= 1 && day <= A.Run.RUN_DAYS)) return null;
    const entry = A.Run.recordDay(state.run, day, done, did);
    state.run.log = state.run.log || {};
    state.run.log[day] = entry;
    commit({ type: 'runRecord', day: day });
    return entry;
  }

  /**
   * Today's record, created on the first touch of the day.
   *
   * An `asked` already frozen is kept. `runCheckIn` can patch the run part-way
   * through a day, which moves what `doseOn` says — but today's ask was settled
   * when the day opened, and re-deriving it would move the target the user has
   * spent the afternoon working toward.
   */
  function runEntryFor(day) {
    const log = state.run.log || (state.run.log = {});
    if (!log[day]) log[day] = A.Run.recordDay(state.run, day, [], null);
    return log[day];
  }

  /**
   * Tick a run habit for today, or untick it.
   *
   * A tick clears any measurement, and that is deliberate rather than tidy: a
   * tick is a claim with no number in it, and leaving a stale `did` beside a
   * verdict that contradicts it stores two facts that disagree. Use
   * `setRunValue` for anything the user actually counted.
   */
  function toggleRunHabit(habitId) {
    const day = runToday();
    if (!state.run || day == null) return null;
    const row = runEntryFor(day)[habitId];
    if (!row) return null;                       // not asked today
    row.done = !row.done;
    row.did = null;
    commit({ type: 'runToggle', day: day, habitId: habitId });
    return row;
  }

  /**
   * Record what the user actually managed — 1.5 of 2 glasses.
   *
   * Meeting the ask is the whole ask: the verdict is frozen here against the
   * ask that was recorded for the day, not against whatever the run asks now.
   * There is no partial credit toward `done`, and the shortfall is kept rather
   * than rounded away, because it is the honest number.
   */
  function setRunValue(habitId, value) {
    const day = runToday();
    if (!state.run || day == null) return null;
    const row = runEntryFor(day)[habitId];
    if (!row) return null;
    const n = value == null || value === '' ? null : Number(value);
    row.did = n == null || !isFinite(n) ? null : n;
    row.done = row.did != null && row.asked != null && row.did + 1e-9 >= row.asked;
    commit({ type: 'runValue', day: day, habitId: habitId });
    return row;
  }

  /**
   * Tick one item of a checklist habit for today — one supplement, one step.
   *
   * The habit is done when every item is, and that verdict is frozen into the
   * record here rather than derived on read, so the rule cannot change after
   * the day is over.
   */
  function toggleRunItem(habitId, name) {
    const day = runToday();
    if (!state.run || day == null) return null;
    const row = runEntryFor(day)[habitId];
    if (!row || !row.items) return null;
    A.Run.toggleItem(row, name);
    commit({ type: 'runItem', day: day, habitId: habitId, item: name });
    return row;
  }

  /**
   * Rewrite a checklist. The catalog is closed; what is inside a habit is not.
   *
   * Only the run's own copy is touched, never the catalog, and never a day that
   * has already been recorded — days behind keep the list they actually asked
   * for, which is why the record stores the item names and not just a count.
   */
  function setRunItems(habitId, list) {
    if (!state.run || !A.Run.isItemHabit(habitId)) return null;
    const clean = (list || [])
      .map((x) => String(x == null ? '' : x).trim())
      .filter((x, i, all) => x && all.indexOf(x) === i)
      .slice(0, 20);
    if (!clean.length) return null;            // a checklist of nothing is not a habit
    const p = (state.run.habits || []).find((x) => x.habitId === habitId);
    if (!p) return null;
    p.items = clean;
    commit({ type: 'runItems', habitId: habitId });
    return clean;
  }

  /**
   * Habits in the run this build's catalog no longer has.
   *
   * They are kept in storage rather than dropped — see `activeOn` in run.js —
   * so this is how the app can say so out loud instead of silently showing a
   * shorter day than the one the user signed up for.
   */
  function runUnknownHabits() {
    if (!state.run) return [];
    return (state.run.habits || []).filter((p) => !A.Run.isKnown(p.habitId)).map((p) => p.habitId);
  }

  /**
   * Step in, or offer more — never both. Once a day, and never from a render.
   *
   * This used to be called by `renderRun`, which is a write during a render and
   * an infinite loop besides: `commit` notifies the view, the view re-renders,
   * the render checks in again. Softening does not change the *logs*, so
   * `diagnose` returns the same rates every time and `needsIntervention` never
   * clears — the app would hang on the Run screen for exactly the user it was
   * built to help. Call it from boot and from the day rollover; a render reads
   * `lastPatchDay` and asks `A.Run.recommend` directly, both of which are pure.
   */
  function runCheckIn() {
    const day = runToday();
    if (!state.run || day == null) return null;
    if (state.run.checkedOn === day) return null;
    const out = A.Run.checkIn(state.run, day);
    /* Open today's record here rather than on first tap. It used to appear the
       moment a habit was ticked, which made *interacting* with the run worse
       than ignoring it: tick one of four and the day is judged 1/4, leave the
       section alone and the run asked nothing of you at all. Created once, from
       today's programme, on the day itself — so it freezes what today asks and
       re-derives nothing behind the user. */
    runEntryFor(day);
    const carry = { log: state.run.log, checkedOn: day };
    if (out.patched) {
      carry.lastPatchDay = day;
      carry.lastPatchNotes = out.notes;
    }
    state.run = Object.assign({}, out.patched ? out.run : state.run, carry);
    commit({ type: 'runCheckIn', day: day });
    return out;
  }

  /** Take up a recommendation. Refuses rather than repairs — see run.js. */
  function runApply(rec) {
    const day = runToday();
    if (!state.run || day == null) return null;
    const out = A.Run.applyRecommendation(state.run, rec, day);
    if (out.run !== state.run) {
      state.run = Object.assign({}, out.run, { log: state.run.log });
      commit({ type: 'runApply' });
    }
    return out;
  }

  function freezeStats() {
    const earned = Math.min(5, Math.floor(history().completeDays / 10));
    const used = Object.keys(state.freezes).length;
    return { earned, used, available: Math.max(0, earned - used) };
  }

  function applyFreeze(dateKey) {
    if (state.freezes[dateKey]) return false;
    if (isFuture(dateKey) || dateKey === today()) return false;
    if (freezeStats().available <= 0) return false;
    if (dayStatus(dateKey).status === 'complete') return false;
    state.freezes[dateKey] = true;
    commit({ type: 'freeze', dateKey });
    return true;
  }

  function clearFreeze(dateKey) {
    if (!state.freezes[dateKey]) return;
    delete state.freezes[dateKey];
    commit({ type: 'unfreeze', dateKey });
  }

  /* ---------- day status ---------- */

  const isFuture = (dateKey) => A.daysBetween(today(), dateKey) > 0;

  /**
   * @returns {{status:'future'|'rest'|'complete'|'partial'|'missed',
   *            done:number, total:number, pct:number, exDone:number, exTotal:number,
   *            hbDone:number, hbTotal:number, extra:number}}
   */
  const dsCache = new Map();

  /** history() walks every day since install and each day now scores goals too —
      without this memo a single render re-derives thousands of days. */
  function dayStatus(dateKey) {
    const ck = dateKey + '|' + today(); // keyed by "now" too, so midnight invalidates it
    if (dsCache.has(ck)) return dsCache.get(ck);
    const out = computeDayStatus(dateKey);
    dsCache.set(ck, out);
    return out;
  }

  /**
   * What the run asked of one calendar day, and what happened — from the
   * record, never from the programme.
   *
   * `A.Run.runDay` would re-derive it from the run as it stands *now*, so
   * easing a habit in week five would change what week two demanded and
   * re-score days the user has already lived. The record is frozen when the day
   * opens, which is the same reason `DayEntry.asked` exists.
   *
   * A day with no record contributes nothing, and that is the safe direction: a
   * day the user never opened the app on is one we know nothing about, and it
   * must not become a day the run retroactively decided they failed.
   */
  function runEntriesOn(dateKey) {
    const run = state.run;
    if (!run || !run.startDate) return [];
    const day = A.daysBetween(run.startDate, dateKey) + 1;
    const entry = (run.log || {})[day];
    if (!entry) return [];
    return Object.keys(entry).map((k) => entry[k]);
  }

  function computeDayStatus(dateKey) {
    const l = state.logs[dateKey];
    const plan = dayPlan(dateKey);
    const habits = settings().requireHabits ? dayHabits(dateKey) : [];
    const gl = settings().goalsCountTowardDay ? goalsForDay(dateKey) : [];
    const rn = settings().runCountsTowardDay ? runEntriesOn(dateKey) : [];
    const exDone = plan.filter((i) => l && l.ex && l.ex[i.id]).length;
    const hbDone = habits.filter((h) => l && l.hb && l.hb[h.id]).length;
    const glDone = gl.filter((x) => x.done).length;
    const rnDone = rn.filter((e) => e.done).length;
    const extra = l && l.extra ? l.extra.length : 0;
    const total = plan.length + habits.length + gl.length + rn.length;
    const done = exDone + hbDone + glDone + rnDone;
    const shape = {
      done, total, exDone, exTotal: plan.length, hbDone, hbTotal: habits.length,
      glDone, glTotal: gl.length, rnDone, rnTotal: rn.length,
      extra, frozen: !!state.freezes[dateKey]
    };

    if (isFuture(dateKey)) return Object.assign({ status: 'future', pct: 0 }, shape);
    if (total === 0) {
      // Nothing scheduled. Freeform work still counts as a completed day.
      const st = extra > 0 ? 'complete' : 'rest';
      return Object.assign({}, shape, { status: st, done: extra, total: extra, pct: extra ? 100 : 0 });
    }
    const pct = Math.round((done / total) * 100);
    const threshold = settings().completionPct || 100;
    let status = 'missed';
    if (pct >= threshold) status = 'complete';
    else if (done > 0) status = 'partial';
    return Object.assign({ status, pct }, shape);
  }

  /* ---------- streaks ---------- */

  /** Does this day add to the streak? */
  function countsToStreak(s) {
    if (typeof s === 'string') s = { status: s, frozen: false };
    if (s.status === 'complete') return true;
    return s.status === 'rest' && !!settings().restCountsAsStreak;
  }

  /** Does it keep the chain unbroken? A spent freeze holds without adding. */
  function holdsStreak(s) {
    if (typeof s === 'string') s = { status: s, frozen: false };
    return countsToStreak(s) || !!s.frozen;
  }

  /** Earliest date history is allowed to reach: install day, or the oldest
      backfilled log if the user logged days from before they installed. */
  function historyStart() {
    let earliest = state.createdAt;
    for (const k in state.logs) if (k < earliest) earliest = k;
    for (const k in state.goalLogs) if (k < earliest) earliest = k;
    for (const k in state.reading) if (k < earliest) earliest = k;
    return earliest;
  }

  function currentStreak() {
    const t = today();
    let cursor = t;
    // Today is still in play — an unfinished today must not break the streak.
    if (dayStatus(t).status !== 'complete') cursor = A.addDays(t, -1);

    const floor = historyStart();
    let count = 0;
    let guard = 0;
    while (guard++ < 1000 && A.daysBetween(floor, cursor) >= 0) {
      const s = dayStatus(cursor);
      // One definition of each rule, shared with history(): the two used to be
      // written out separately here and would have drifted apart on the next edit.
      if (!holdsStreak(s)) break;
      if (countsToStreak(s)) count++;
      cursor = A.addDays(cursor, -1);
    }
    // Cheap enough to record here too: the chip renders on every change, so a peak
    // is banked the moment it happens rather than waiting for the Progress tab.
    if (count > (state.bestStreak || 0)) {
      state.bestStreak = count;
      save();
    }
    return count;
  }

  /** Longest run of streak-holding days, plus totals, over the app's whole history. */
  function history() {
    const t = today();
    const start = historyStart();
    let best = 0;
    let run = 0;
    let completeDays = 0;
    let restDays = 0;
    let missedDays = 0;
    let cursor = start;
    let guard = 0;
    while (guard++ < 4000 && A.daysBetween(cursor, t) >= 0) {
      const s = dayStatus(cursor);
      const st = s.status;
      if (st === 'complete') completeDays++;
      else if (st === 'rest') restDays++;
      else missedDays++;
      if (holdsStreak(s)) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
      cursor = A.addDays(cursor, 1);
    }
    const rawBest = Math.max(best, currentStreak());
    // Best streak is a high-water mark: clearing or editing an old day must never
    // revoke a record you already set. Recorded here, on read, not on every write.
    if (rawBest > (state.bestStreak || 0)) {
      state.bestStreak = rawBest;
      save();
    }
    return { best: Math.max(rawBest, state.bestStreak || 0), rawBest, completeDays, restDays, missedDays };
  }

  /* ---------- what actually happened ---------- */

  /* Units that accumulate. A wake-up time does not: forty mornings at 06:30 do
     not sum to anything, so those goals report days kept and nothing else. */
  const ACCUMULATES = { minutes: 1, count: 1, pages: 1, km: 1, litres: 1, seconds: 1 };

  /**
   * The real ledger: what the user actually did, counted from their own logs.
   *
   * Deliberately free of XP, levels and ranks. Those are the app's own
   * invention; these are facts about a life — hours read, mornings kept,
   * sessions done — and knowledge/project.md says a real total outranks a
   * synthetic one. Nothing here is stored; it is all derived, like every other
   * number in the app.
   */
  function lifeTotals() {
    const start = historyStart();
    const t = today();
    const days = Math.max(1, A.daysBetween(start, t) + 1);
    const hist = history();

    let sessions = 0;
    let workoutDays = 0;
    for (const k in state.logs) {
      const l = state.logs[k];
      const done = Object.values(l.ex || {}).filter(Boolean).length + (l.extra || []).length;
      sessions += done;
      if (done > 0) workoutDays++;
    }

    const perGoal = goals()
      .map((g) => {
        let kept = 0;
        let total = 0;
        for (const k in state.goalLogs) {
          if (!state.goalLogs[k][g.id]) continue;
          if (!goalDone(k, g.id)) continue;
          kept++;
          const v = Number(state.goalLogs[k][g.id].value);
          if (ACCUMULATES[g.unit] && !isNaN(v)) total += v;
        }
        return { goal: g, kept: kept, total: ACCUMULATES[g.unit] ? total : null };
      })
      .filter((row) => row.kept > 0)
      .sort((a, b) => b.kept - a.kept);

    return {
      days: days,
      since: start,
      kept: hist.completeDays,
      sessions: sessions,
      workoutDays: workoutDays,
      summaries: readingDays().length,
      journal: journalDays().length,
      goals: perGoal
    };
  }

  /* ---------- xp & level ---------- */

  /** Every day that has any activity at all — logs, goals or reading. */
  function activeDays() {
    const set = Object.create(null);
    for (const k in state.logs) set[k] = 1;
    for (const k in state.goalLogs) set[k] = 1;
    for (const k in state.reading) set[k] = 1;
    return Object.keys(set);
  }

  function totalXp() {
    let xp = 0;
    for (const k in state.logs) {
      const l = state.logs[k];
      xp += Object.values(l.ex || {}).filter(Boolean).length * A.XP.exercise;
      xp += Object.values(l.hb || {}).filter(Boolean).length * A.XP.habit;
      xp += (l.extra || []).length * A.XP.exercise;
    }
    for (const k in state.goalLogs) {
      for (const gid in state.goalLogs[k]) if (goalDone(k, gid)) xp += A.XP.goal;
    }
    for (const k in state.reading) if ((state.reading[k].summary || '').trim()) xp += A.XP.summary;
    // Level-ups pay from the event log, so a later slip never claws XP back —
    // and neither does pausing the goal, which is why this reads every goal
    // rather than only the active ones. Those steps were earned.
    goals().forEach((g) => {
      const tl = goalTimeline(g.id);
      if (tl) xp += tl.events.filter((e) => e.type === 'up').length * A.XP.levelUp;
    });
    activeDays().forEach((k) => {
      if (dayStatus(k).status === 'complete') xp += A.XP.dayBonus;
    });
    for (const id in state.claimed) {
      const m = A.MILESTONES.find((x) => x.id === id);
      if (m) xp += m.xp;
    }
    xp += Object.keys(state.weeklyClaims).length * A.XP.weeklyGoal;
    return xp;
  }

  function progress() {
    const xp = totalXp();
    const level = A.levelFromXp(xp);
    const floor = A.xpForLevel(level);
    const ceil = A.xpForLevel(level + 1);
    return {
      xp,
      level,
      rank: A.rankFor(level),
      into: xp - floor,
      need: ceil - floor,
      pct: Math.min(100, Math.round(((xp - floor) / Math.max(1, ceil - floor)) * 100))
    };
  }

  /* ---------- rewards ---------- */

  function rewards() {
    const best = history().best;
    const cur = currentStreak();
    return A.MILESTONES.map((m) => ({
      ...m,
      unlocked: best >= m.days,
      claimed: !!state.claimed[m.id],
      claimedOn: state.claimed[m.id] || null,
      progress: Math.min(100, Math.round((Math.max(cur, best) / m.days) * 100))
    }));
  }

  function nextMilestone() {
    const best = history().best;
    return A.MILESTONES.find((m) => m.days > best) || null;
  }

  function claimReward(id) {
    if (state.claimed[id]) return false;
    const r = rewards().find((x) => x.id === id);
    if (!r || !r.unlocked) return false;
    state.claimed[id] = today();
    commit({ type: 'claim', id });
    return true;
  }


  /* ---------- rewards the user sets for themselves ---------- */

  /**
   * A custom reward is a promise: keep something going for N days and you have
   * earned the thing you named. Unlike the built-in milestones it pays out in
   * the real world, so claiming records that you actually bought it — there is
   * no XP, because inventing points for buying yourself trainers would be
   * exactly the kind of unearned number this app refuses to show.
   *
   * `source` is 'overall' (the whole-day streak) or 'goal' (one goal's streak).
   */
  const customRewards = () => state.customRewards || [];

  function addCustomReward(data) {
    const r = Object.assign(
      { id: A.uid('rw'), name: 'New reward', icon: '🎁', source: 'overall', goalId: null, days: 14, claimedOn: null },
      data || {}
    );
    r.days = Math.max(1, Math.round(Number(r.days) || 1));
    if (r.source !== 'goal') r.goalId = null;
    state.customRewards.push(r);
    commit({ type: 'rewardAdd', id: r.id });
    return r;
  }

  function updateCustomReward(id, patch) {
    const r = customRewards().find((x) => x.id === id);
    if (!r) return;
    Object.assign(r, patch);
    r.days = Math.max(1, Math.round(Number(r.days) || 1));
    if (r.source !== 'goal') r.goalId = null;
    commit({ type: 'rewardUpdate', id: id });
  }

  function removeCustomReward(id) {
    state.customRewards = customRewards().filter((x) => x.id !== id);
    commit({ type: 'rewardRemove', id: id });
  }

  /** Best run ever reached, so a reward stays earned once the streak got there. */
  function customRewardProgress(r) {
    let have = 0;
    if (r.source === 'goal' && r.goalId) {
      const tl = goalTimeline(r.goalId);
      have = tl ? tl.bestStreak : 0;
    } else {
      have = history().best;
    }
    const need = Math.max(1, Math.round(Number(r.days) || 1));
    return {
      have: have,
      need: need,
      pct: Math.min(100, Math.round((have / need) * 100)),
      unlocked: have >= need,
      claimed: !!r.claimedOn,
      claimedOn: r.claimedOn || null
    };
  }

  /** Marks the reward as actually collected. Reversible — a mistap is not a purchase. */
  function claimCustomReward(id) {
    const r = customRewards().find((x) => x.id === id);
    if (!r) return false;
    if (!customRewardProgress(r).unlocked) return false;
    r.claimedOn = r.claimedOn ? null : today();
    commit({ type: 'rewardClaim', id: id });
    return !!r.claimedOn;
  }


  /* ---------- the challenge ---------- */

  /**
   * A challenge is a fixed-length run the day counter counts against: DAY 5 / 66.
   *
   * It is optional on purpose. Discipline works without one — the counter then just
   * counts days since you installed it — because a finish line you did not
   * choose is a deadline, and this app does not set deadlines for people.
   *
   * Challenges are never deleted when they end, only stamped with `endedOn`, so
   * the record of a run you finished (or abandoned) survives.
   */
  /** Clamp a run length. `|| 66` would be wrong here: 0 is a value the user
      typed, not a missing one, and it must clamp to 1 rather than silently
      become the default. */
  function clampRunLength(v) {
    const n = Math.round(Number(v));
    return isNaN(n) ? 66 : Math.max(1, Math.min(999, n));
  }

  const challenges = () => state.challenges || [];
  const activeChallenge = () => challenges().find((c) => !c.endedOn) || null;

  /** Day number within a challenge, 1-based. Null when the date sits outside it. */
  function challengeDay(c, dateKey) {
    if (!c) return null;
    const n = A.daysBetween(c.startDate, dateKey) + 1;
    return n >= 1 ? n : null;
  }

  /**
   * Where a challenge stands. `kept` counts days actually completed inside the
   * window — the elapsed day number says how long it has been, which is not the
   * same thing and must not be dressed up as if it were.
   */
  function challengeProgress(c) {
    const ch = c || activeChallenge();
    if (!ch) return null;
    const elapsed = Math.max(1, A.daysBetween(ch.startDate, today()) + 1);
    const day = Math.min(elapsed, ch.days);
    let kept = 0;
    for (let i = 0; i < Math.min(elapsed, ch.days); i++) {
      if (dayStatus(A.addDays(ch.startDate, i)).status === 'complete') kept++;
    }
    return {
      challenge: ch,
      day: day,
      days: ch.days,
      elapsed: elapsed,
      kept: kept,
      pct: Math.min(100, Math.round((day / ch.days) * 100)),
      keptPct: Math.min(100, Math.round((kept / ch.days) * 100)),
      complete: elapsed > ch.days,
      finalDay: elapsed === ch.days
    };
  }

  /** Starting a new run closes whatever was already going. */
  function startChallenge(data) {
    const open = activeChallenge();
    if (open) open.endedOn = today();
    const c = Object.assign(
      { id: A.uid('ch'), name: 'Reset', days: 66, startDate: today(), endedOn: null },
      data || {}
    );
    c.days = clampRunLength(c.days);
    state.challenges.push(c);
    commit({ type: 'challengeStart', id: c.id });
    return c;
  }

  function updateChallenge(id, patch) {
    const c = challenges().find((x) => x.id === id);
    if (!c) return;
    Object.assign(c, patch);
    c.days = clampRunLength(c.days);
    commit({ type: 'challengeUpdate', id: id });
  }

  function endChallenge(id) {
    const c = challenges().find((x) => x.id === id);
    if (!c || c.endedOn) return;
    c.endedOn = today();
    commit({ type: 'challengeEnd', id: id });
  }

  /* ---------- weekly goal ---------- */

  function weekStats(anchorKey) {
    const start = A.weekStart(anchorKey || today());
    let complete = 0;
    const days = [];
    for (let i = 0; i < 7; i++) {
      const k = A.addDays(start, i);
      const s = dayStatus(k);
      if (s.status === 'complete') complete++;
      days.push({ key: k, ...s });
    }
    const goal = settings().goalPerWeek;
    return {
      start,
      days,
      complete,
      goal,
      hit: complete >= goal,
      claimed: !!state.weeklyClaims[start],
      pct: Math.min(100, Math.round((complete / Math.max(1, goal)) * 100))
    };
  }

  function claimWeekly(anchorKey) {
    const w = weekStats(anchorKey);
    if (!w.hit || w.claimed) return false;
    state.weeklyClaims[w.start] = true;
    commit({ type: 'claimWeekly', week: w.start });
    return true;
  }

  /* ---------- mutations: logging ---------- */

  function toggleExercise(dateKey, itemId) {
    if (isFuture(dateKey)) return false;
    const l = ensureLog(dateKey);
    l.ex[itemId] = !l.ex[itemId];
    if (!l.ex[itemId]) delete l.ex[itemId];
    commit({ type: 'toggleExercise', dateKey, itemId, on: !!l.ex[itemId] });
    return !!l.ex[itemId];
  }

  function toggleHabit(dateKey, habitId) {
    if (isFuture(dateKey)) return false;
    const l = ensureLog(dateKey);
    l.hb[habitId] = !l.hb[habitId];
    if (!l.hb[habitId]) delete l.hb[habitId];
    commit({ type: 'toggleHabit', dateKey, habitId, on: !!l.hb[habitId] });
    return !!l.hb[habitId];
  }

  function completeAll(dateKey) {
    if (isFuture(dateKey)) return;
    const l = ensureLog(dateKey);
    dayPlan(dateKey).forEach((i) => (l.ex[i.id] = true));
    if (settings().requireHabits) dayHabits(dateKey).forEach((h) => (l.hb[h.id] = true));
    commit({ type: 'completeAll', dateKey });
  }

  function clearDay(dateKey) {
    const l = state.logs[dateKey];
    if (!l) return;
    l.ex = {};
    l.hb = {};
    commit({ type: 'clearDay', dateKey });
  }

  function addExtra(dateKey, name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const l = ensureLog(dateKey);
    l.extra.push({ id: A.uid('xt'), name: trimmed });
    commit({ type: 'addExtra', dateKey });
  }

  function removeExtra(dateKey, id) {
    const l = state.logs[dateKey];
    if (!l) return;
    l.extra = (l.extra || []).filter((x) => x.id !== id);
    commit({ type: 'removeExtra', dateKey });
  }

  function completeOnboarding(patch) {
    Object.assign(state.settings, patch || {});
    state.meta.onboarded = true;
    commit({ type: 'onboarded' });
  }

  /* ---------- mutations: plan ---------- */

  function addToPlan(dayIndex, exerciseId, overrides) {
    const ex = exerciseById(exerciseId);
    if (!ex) return null;
    const item = Object.assign(
      { id: A.uid('pi'), exerciseId, sets: ex.sets, reps: ex.reps, repsMax: ex.repsMax, minutes: ex.minutes, km: ex.km, note: '' },
      overrides || {}
    );
    state.plan[dayIndex].push(item);
    commit({ type: 'planAdd', dayIndex });
    return item;
  }

  function updatePlanItem(dayIndex, itemId, patch) {
    const item = (state.plan[dayIndex] || []).find((i) => i.id === itemId);
    if (!item) return;
    Object.assign(item, patch);
    commit({ type: 'planUpdate', dayIndex, itemId });
  }

  function removePlanItem(dayIndex, itemId) {
    state.plan[dayIndex] = (state.plan[dayIndex] || []).filter((i) => i.id !== itemId);
    commit({ type: 'planRemove', dayIndex });
  }

  function movePlanItem(dayIndex, itemId, delta) {
    const arr = state.plan[dayIndex] || [];
    const i = arr.findIndex((x) => x.id === itemId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= arr.length) return;
    arr.splice(j, 0, arr.splice(i, 1)[0]);
    commit({ type: 'planMove', dayIndex });
  }

  function copyDayPlan(fromDay, toDay) {
    state.plan[toDay] = (state.plan[fromDay] || []).map((i) => Object.assign({}, i, { id: A.uid('pi') }));
    commit({ type: 'planCopy', fromDay, toDay });
  }

  function clearDayPlan(dayIndex) {
    state.plan[dayIndex] = [];
    commit({ type: 'planClear', dayIndex });
  }

  /* ---------- mutations: library & habits ---------- */

  function addExercise(data) {
    const ex = Object.assign(
      { id: A.uid('ex'), name: 'New exercise', category: 'Other', unit: 'reps', sets: 3, reps: 10, icon: '🏋️' },
      data || {}
    );
    state.exercises.push(ex);
    commit({ type: 'exerciseAdd', id: ex.id });
    return ex;
  }

  function updateExercise(id, patch) {
    const ex = exerciseById(id);
    if (!ex) return;
    Object.assign(ex, patch);
    commit({ type: 'exerciseUpdate', id });
  }

  function removeExercise(id) {
    state.exercises = state.exercises.filter((e) => e.id !== id);
    for (let d = 0; d <= 6; d++) state.plan[d] = (state.plan[d] || []).filter((i) => i.exerciseId !== id);
    commit({ type: 'exerciseRemove', id });
  }

  function addHabit(name, icon) {
    const h = { id: A.uid('hb'), name: (name || 'New habit').trim(), icon: icon || '✅' };
    state.habits.push(h);
    commit({ type: 'habitAdd', id: h.id });
    return h;
  }

  function removeHabit(id) {
    state.habits = state.habits.filter((h) => h.id !== id);
    commit({ type: 'habitRemove', id });
  }

  function habitStreak(habitId) {
    let cursor = today();
    const l0 = state.logs[cursor];
    if (!(l0 && l0.hb && l0.hb[habitId])) cursor = A.addDays(cursor, -1);
    const floor = historyStart();
    let n = 0;
    let guard = 0;
    while (guard++ < 1000 && A.daysBetween(floor, cursor) >= 0) {
      const l = state.logs[cursor];
      if (l && l.hb && l.hb[habitId]) n++;
      else break;
      cursor = A.addDays(cursor, -1);
    }
    return n;
  }

  function updateSettings(patch) {
    Object.assign(state.settings, patch);
    commit({ type: 'settings', patch });
  }

  /* ---------- data portability ---------- */

  function exportJson() {
    return JSON.stringify(state, null, 2);
  }

  /**
   * Read a backup file and say whether it is one, without touching anything.
   *
   * Importing replaces every byte the user has, and `migrate` is deliberately
   * forgiving — it fills in whatever is missing — so almost any JSON object used
   * to sail through and silently become the user's account. This is the shape
   * check that stands in front of it, and it is deliberately only a shape check:
   * the containers must be the right *kind* of thing where they are present, and
   * the two that have existed in every version of the format must be there at
   * all. Anything stricter would reject a genuine old backup, which is a worse
   * failure than the one being fixed.
   *
   * Throws an Error whose message can be shown to the user as-is.
   * @returns {{version:number, days:number, goals:number, summaries:number}}
   */
  function inspectBackup(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error('That file is not readable as JSON, so it is not a Discipline backup.');
    }
    const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
    if (!isObj(parsed)) throw new Error('Not a Discipline backup file.');

    // Present in every version of the format: without them this is some other file.
    const missing = [];
    if (!isObj(parsed.plan)) missing.push('the weekly plan');
    if (!isObj(parsed.logs)) missing.push('the day logs');
    if (missing.length) {
      throw new Error(`This file is missing ${missing.join(' and ')}, so it is not a Discipline backup.`);
    }

    // Added in later versions: absent is fine, wrong type is not.
    const wrong = [];
    if (parsed.goals != null && !Array.isArray(parsed.goals)) wrong.push('goals');
    if (parsed.exercises != null && !Array.isArray(parsed.exercises)) wrong.push('exercises');
    if (parsed.habits != null && !Array.isArray(parsed.habits)) wrong.push('habits');
    if (parsed.customRewards != null && !Array.isArray(parsed.customRewards)) wrong.push('custom rewards');
    if (parsed.challenges != null && !Array.isArray(parsed.challenges)) wrong.push('challenges');
    if (parsed.goalLogs != null && !isObj(parsed.goalLogs)) wrong.push('goal logs');
    if (parsed.reading != null && !isObj(parsed.reading)) wrong.push('reading');
    if (parsed.journal != null && !isObj(parsed.journal)) wrong.push('journal');
    if (parsed.settings != null && !isObj(parsed.settings)) wrong.push('settings');
    if (wrong.length) {
      throw new Error(`This backup is damaged — ${wrong.join(', ')} ${wrong.length > 1 ? 'are' : 'is'} not the right kind of data.`);
    }

    const v = parsed.version == null ? 1 : parsed.version;
    if (typeof v !== 'number' || !isFinite(v)) throw new Error('This backup does not say which format it is in.');
    if (v > STATE_VERSION) {
      throw new Error(
        `This backup was written by a newer version of Discipline (format ${v}; this copy reads ${STATE_VERSION}). ` +
          'Update Discipline before restoring it — importing it here would drop whatever the newer version added.'
      );
    }

    return {
      version: v,
      days: Object.keys(parsed.logs).length,
      goals: Array.isArray(parsed.goals) ? parsed.goals.length : 0,
      summaries: isObj(parsed.reading) ? Object.keys(parsed.reading).length : 0
    };
  }

  function importJson(text) {
    inspectBackup(text); // never import anything that has not been shape-checked
    const parsed = JSON.parse(text);
    state = migrate(parsed);
    // The user has chosen what their data should be, so the unreadable original
    // no longer needs protecting and writes may resume.
    writesBlocked = false;
    commit({ type: 'import' });
  }

  function resetAll() {
    state = seedState();
    writesBlocked = false;
    commit({ type: 'reset' });
  }

  root.Store = {
    load, get, settings, save, flush, commit, today, acknowledgeClock, completeOnboarding,
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    exerciseById, habitById, dayPlan, dayHabits, log, ensureLog, isFuture, historyStart, activeDays,
    dayStatus, currentStreak, history, lifeTotals, totalXp, progress,
    rewards, nextMilestone, claimReward, weekStats, claimWeekly,
    challenges, activeChallenge, challengeDay, challengeProgress, startChallenge, updateChallenge, endChallenge,
    customRewards, addCustomReward, updateCustomReward, removeCustomReward,
    customRewardProgress, claimCustomReward,
    toggleExercise, toggleHabit, completeAll, clearDay, addExtra, removeExtra,
    addToPlan, updatePlanItem, removePlanItem, movePlanItem, copyDayPlan, clearDayPlan,
    addExercise, updateExercise, removeExercise, addHabit, removeHabit, habitStreak,
    goals, activeGoals, goalById, goalEntry, goalTimeline, goalTarget, goalTargetOn,
    goalDone, goalsForDay, setGoalValue, hitGoalTarget, skipGoal, clearGoalEntry,
    addGoal, updateGoal, archiveGoal, removeGoal, restartGoal,
    readingEntry, setReading, readingDays, journalEntry, setJournal, journalDays,
    run, runStatus, runToday, startRun, endRun, recordRunDay, runCheckIn, runApply,
    toggleRunHabit, setRunValue, toggleRunItem, setRunItems, runUnknownHabits,
    freezeStats, applyFreeze, clearFreeze,
    updateSettings, exportJson, inspectBackup, importJson, unreadableBackup, resetAll
  };
})(window);
