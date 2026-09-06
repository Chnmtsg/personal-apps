/* Discipline — state, persistence and every derived training stat. */
(function (root) {
  'use strict';

  const A = root.Arise;

  const STORAGE_KEY = 'arise.state.v1';
  // The one deliberate exception to "all state lives under one key". This is a
  // lifeboat, not state: nothing in the normal read path ever touches it. It
  // exists so the single-key rule can never cost a user their history.
  const QUARANTINE_KEY = 'arise.state.v1.unreadable';
  /* 7 adds `log.perf` — what each exercise actually weighed. Additive: a v6
     state gains an empty object per day and nothing it already held moves. */
  const STATE_VERSION = 7;

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

  /** The week for a context id, falling back to the default. */
  function programWeek(contextId) {
    const list = A.PROGRAM_CONTEXTS || [];
    const found = list.find((c) => c.id === contextId);
    return (found && found.week) || (list[0] && list[0].week) || A.PROGRAM_WEEK || {};
  }

  /** The built-in program laid out across the seven days. */
  function programPlan(exercises, contextId) {
    const week = programWeek(contextId);
    const plan = {};
    for (let d = 0; d <= 6; d++) {
      const day = week[d] || { items: [] };
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
    const plan = programPlan(exercises);
    const start = A.todayKey(4);

    return {
      version: STATE_VERSION,
      createdAt: start,
      exercises,
      plan,
      /* dateKey -> { plan: frozen items, ex: {itemId:true}, perf: {itemId:entry},
         extra: [], note: '' }. `ex` says an exercise was done; `perf` says what
         it weighed. They are separate because they answer different questions
         and because every log written before set logging existed has the first
         and not the second. */
      logs: {},
      freezes: {},    // dateKey -> true  (a streak freeze the user spent)
      // Rewards the user promises themselves: "14 sessions kept → new shoes".
      customRewards: [],
      bestStreak: 0,
      // programInstalled is already true here: seedState lays the program out
      // directly, so a later migrate() must not install it a second time over a
      // plan the user has since edited. storageError describes the health of
      // storage itself rather than the user's data: 'unreadable' means a saved
      // state existed but could not be parsed.
      meta: {
        maxSeen: start, lastTick: Date.now(), clockWarning: false,
        /* `musclesV6` is seeded true for the same reason `programInstalled` is:
           a fresh install already HAS the nineteen-group tags, so the one-time
           v5→v6 re-derivation must not run against it. Without this the first
           reload after a fresh install treated a seed as an upgrade and reverted
           any muscle edit made before it. */
        programInstalled: true, musclesV6: true, storageError: null
      },
      settings: {
        name: 'Hunter',
        dayBoundaryHour: 4,
        /* Sessions a week. The key is still `goalPerWeek` and must stay that
           way: renaming a settings key silently resets it to the default for
           everybody who had already chosen a number. */
        goalPerWeek: 5,
        /* Which unit the weight fields are typed and read in. Purely a display
           choice — every set stores the unit it was entered in, so switching
           this re-reads history rather than re-judging it. */
        weightUnit: 'kg',
        /* Start the rest countdown when a set is logged. ON by default, which
           is safe in a way the switches below it are not: it changes nothing
           about the record and re-scores no day, so the only thing at stake is
           whether a timer somebody did not ask for appears at the bottom of the
           screen. It reads the interval off the plan's own note and invents
           none, so an exercise that prescribes no rest counts up instead. */
        restTimer: true,
        /* Every Nth week is a deload. 0 is off, and off is the default because
           this changes what the app tells you a week is for, and that is the
           user's call. 4 is the number the training literature and "Can't Hurt
           Me"'s own safety section land on. */
        deloadEveryWeeks: 0,
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
  let unreadableRaw = null; // the bytes that would not parse, kept for this session
  let writesBlocked = false; // set only when those bytes could not be copied anywhere

  function load() {
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
    s.exercises = s.exercises || base.exercises;
    s.plan = s.plan || base.plan;
    for (let d = 0; d <= 6; d++) if (!Array.isArray(s.plan[d])) s.plan[d] = [];
    s.createdAt = s.createdAt || A.todayKey(s.settings.dayBoundaryHour);
    s.bestStreak = s.bestStreak || 0;
    s.freezes = s.freezes || {};
    // Additive: an account written before custom rewards existed simply has none.
    s.customRewards = Array.isArray(s.customRewards) ? s.customRewards : [];

    /* Anything this version no longer reads — goals, goalLogs, reading, journal,
       lines, cookies, challenges, run, habits, claimed, weeklyClaims — is left
       exactly where it is and carried through every save and every export.
       Deleting it would be the one mistake with no recovery, and the app has no
       reason to: it simply stops looking. */

    // Read this BEFORE merging defaults: base.meta says the program is installed
    // (seedState lays it out itself), which would mask an old account that has
    // never seen it.
    const hadProgram = !!(s.meta && s.meta.programInstalled);
    /* Read BEFORE the merge below, for the same reason and by the same rule:
       `base.meta` seeds `musclesV6: true` so a fresh install skips the upgrade,
       and merging that over an incoming v5 account would mask the real value and
       skip it there too — which is the flag masking its own subject. */
    const hadMusclesV6 = !!(s.meta && s.meta.musclesV6);
    s.meta = Object.assign({}, base.meta, s.meta || {});

    /* v4 → v6: what an exercise works.
       Both catalogues, because most of a real library came from the training
       programme rather than the seed — and `installProgram` runs exactly once,
       so an account that already has it would never be filled in from there.

       v5 tagged nine coarse groups; v6 replaced them with nineteen that split by
       head, which is how a push-pull-legs split is actually written. Two paths:
       an exercise whose name is still in a catalogue takes that catalogue's
       list, because it is strictly more precise than anything v5 could have
       stored; anything else — an exercise the user created or renamed — has its
       old ids WIDENED (`arms` becomes biceps and triceps) rather than dropped.
       Widening over-credits a little. Dropping would lose the tag, and one of
       those is recoverable by editing and the other is not. */
    const seedMuscles = {};
    A.SEED_EXERCISES.forEach((e) => { seedMuscles[e.name] = e.muscles || []; });
    (A.PROGRAM_EXERCISES || []).forEach((e) => { seedMuscles[e.name] = e.muscles || []; });
    /* Guarded by its own flag, in the shape `programInstalled` established two
       blocks above. Re-deriving from the catalogue is right ONCE, on the upgrade
       from v5's nine coarse groups to v6's nineteen. It was running on every
       single load, so editing an exercise's muscles saved, showed as saved, and
       was silently reverted the next time the app opened — forever. That is the
       coding standard's own rule: never overwrite user data in a migration, and
       a one-time change is guarded by a flag rather than by the version. */
    const upgradeMuscles = !hadMusclesV6;
    (s.exercises || []).forEach((e) => {
      if (upgradeMuscles && seedMuscles[e.name]) { e.muscles = A.cleanMuscles(seedMuscles[e.name]); return; }
      if (!Array.isArray(e.muscles)) {
        e.muscles = A.cleanMuscles(seedMuscles[e.name] || []);
        return;
      }
      const widened = [];
      e.muscles.forEach((id) => {
        (A.MUSCLE_UPGRADE[id] || [id]).forEach((n) => { if (widened.indexOf(n) < 0) widened.push(n); });
      });
      e.muscles = A.cleanMuscles(widened);
    });
    s.meta.musclesV6 = true;

    /* v6 → v7: the performance record.
       Purely additive, and an empty object is the honest default — a day logged
       before set logging existed has a tick and no numbers, and inventing any
       would be the app writing history the user did not. `ex` still says the
       exercise was done, so nothing about that day's status changes. */
    for (const k in s.logs) {
      const l = s.logs[k];
      if (!l || typeof l !== 'object') continue;
      if (!l.perf || typeof l.perf !== 'object' || Array.isArray(l.perf)) l.perf = {};
      for (const id in l.perf) l.perf[id] = normalisePerf(l.perf[id]);
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
   * Bring one stored performance entry back to a shape the app can render.
   *
   * Defensive rather than corrective: it drops what it cannot read and keeps
   * everything it can, because the alternative on a half-written entry is a
   * `NaN` on a screen, and a number the user cannot explain is worse than a
   * blank. Nothing here invents a value.
   */
  function normalisePerf(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    if (Array.isArray(raw.sets)) {
      out.sets = raw.sets
        .filter((x) => x && typeof x === 'object')
        .map((x) => {
          const w = Number(x.w);
          return {
            w: x.w == null || !isFinite(w) ? null : w,
            u: x.u === 'lb' ? 'lb' : 'kg',
            r: Math.max(0, Math.round(Number(x.r) || 0))
          };
        });
    }
    const min = Number(raw.min);
    const km = Number(raw.km);
    if (raw.min != null && isFinite(min) && min > 0) out.min = min;
    if (raw.km != null && isFinite(km) && km > 0) out.km = km;
    if (raw.note) out.note = String(raw.note);
    return out;
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
  /**
   * @param {string} [contextId] which context's week to lay down. The programme
   *   names itself "Context 1", so there was always meant to be more than one;
   *   the app stores ONE plan, which is the right shape — you are on site or you
   *   are at home, not both — so installing a context replaces the week.
   */
  function installProgram(s, contextId) {
    (A.PROGRAM_EXERCISES || []).forEach((p) => {
      const existing = s.exercises.find((e) => e.name === p.name);
      if (!existing) {
        s.exercises.push(Object.assign({ id: A.uid('ex') }, p));
        return;
      }
      // Fill gaps only — never overwrite something the user has edited.
      if (!existing.how && p.how) existing.how = p.how;
      if (existing.repsMax == null && p.repsMax != null) existing.repsMax = p.repsMax;
      if (!Array.isArray(existing.muscles) && p.muscles) existing.muscles = p.muscles.slice();
    });
    s.plan = programPlan(s.exercises, contextId);
    if (contextId) s.meta.programContext = contextId;
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
    if (saveTimer == null) return;
    clearTimeout(saveTimer);
    saveTimer = null;
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
    dsCache.clear();
    save();
    emit(detail);
  }

  /* ---------- lookups ---------- */

  const get = () => state;
  const settings = () => state.settings;
  const exerciseById = (id) => state.exercises.find((e) => e.id === id) || null;

  /** Plan items scheduled for a date: the frozen snapshot if the day was touched,
      otherwise the live weekday template. Editing the plan never rewrites history. */
  function dayPlan(dateKey) {
    const log = state.logs[dateKey];
    if (log && log.plan) return log.plan;
    return state.plan[A.weekday(dateKey)] || [];
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
        ex: {},
        perf: {},
        extra: [],
        note: ''
      };
    }
    l.ex = l.ex || {};
    l.perf = l.perf || {};
    l.extra = l.extra || [];
    return l;
  }

  /* ---------- streak freezes ---------- */

  /** Earned by showing up, spent by hand — no silent magic on a day you missed. */
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

  /**
   * Where this week sits in the deload cycle.
   *
   * "Stress plus recovery equals adaptation; stress without recovery equals
   * damage" is the sentence the rest of this app's push features are only safe
   * underneath. Every fourth week the volume comes down on purpose.
   *
   * Derived from `historyStart()` and counted in whole weeks, so it is stable,
   * needs no stored anchor date, and cannot drift. It deliberately does NOT
   * touch the plan: `ensureLog` freezes a day's exercise list the first time the
   * day is opened, so rewriting sets here would put the screen and the record in
   * disagreement — the exact seam `reconcileToday` exists to close on the run
   * side. The app also has no weight field, so it cannot compute your volume.
   * What it can do honestly is tell you which week it is and what to do about it.
   */
  function deloadWeek(dateKey) {
    const every = Number(settings().deloadEveryWeeks) || 0;
    if (every < 2) return { on: false, week: 0, of: 0, isDeload: false };
    const from = A.weekStart(historyStart());
    const here = A.weekStart(dateKey || today());
    const weeks = Math.floor(A.daysBetween(from, here) / 7);
    const week = ((weeks % every) + every) % every;      // 0-based, negative-safe
    return { on: true, week: week + 1, of: every, isDeload: week === every - 1 };
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

  function computeDayStatus(dateKey) {
    const l = state.logs[dateKey];
    const plan = dayPlan(dateKey);
    const exDone = plan.filter((i) => l && l.ex && l.ex[i.id]).length;
    const extra = l && l.extra ? l.extra.length : 0;
    const total = plan.length;
    const done = exDone;
    const shape = {
      done, total, exDone, exTotal: plan.length,
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

  /* ---------- the performance record ----------

     What the app is for. Everything above answers "did you train today"; this
     answers "with what, and was it more than last time".

     Two rules hold the whole section up, and both are the frozen-history rule
     wearing a different hat:

     - A performance is stored against the LOG, never against the plan. Editing
       Monday's prescription must not rewrite what Monday weighed.
     - Nothing here re-derives a past day from the exercise as it stands now. A
       set carries its own weight, its own unit and its own rep count, so
       renaming an exercise or changing its prescription leaves every number
       already recorded exactly where it was. */

  const weightUnit = () => (settings().weightUnit === 'lb' ? 'lb' : 'kg');

  /** The frozen plan item, its exercise, and whatever was recorded against it. */
  function dayEntries(dateKey) {
    const l = state.logs[dateKey];
    return dayPlan(dateKey).map((item) => ({
      item: item,
      ex: exerciseById(item.exerciseId),
      done: !!(l && l.ex && l.ex[item.id]),
      perf: (l && l.perf && l.perf[item.id]) || null
    }));
  }

  /** Everything recorded on a day, rolled up. `unit` defaults to the display one. */
  function dayVolume(dateKey, unit) {
    const u = unit || weightUnit();
    let volume = 0;
    let sets = 0;
    let reps = 0;
    let minutes = 0;
    let km = 0;
    dayEntries(dateKey).forEach((row) => {
      const perf = row.perf;
      if (!perf) return;
      (perf.sets || []).forEach((set) => {
        sets++;
        reps += Math.max(0, Math.round(Number(set.r) || 0));
        volume += A.setVolume(set, u);
      });
      if (perf.min > 0) minutes += perf.min;
      if (perf.km > 0) km += perf.km;
    });
    return { volume: volume, sets: sets, reps: reps, minutes: minutes, km: km, unit: u };
  }

  /**
   * The last day this exercise was actually logged, strictly before `beforeKey`.
   *
   * Keyed on the EXERCISE and not on the plan item: the same lift on Monday and
   * on Thursday is two plan items with two ids, and "what did I press last
   * time" does not care which day of the week it was.
   */
  function lastPerformance(exerciseId, beforeKey) {
    const before = beforeKey || today();
    let bestKey = null;
    for (const k in state.logs) {
      if (k >= before) continue;
      if (bestKey && k <= bestKey) continue;
      const l = state.logs[k];
      if (!l || !l.perf) continue;
      const item = (l.plan || []).find((i) => i.exerciseId === exerciseId && A.isLogged(l.perf[i.id]));
      if (item) bestKey = k;
    }
    if (!bestKey) return null;
    const l = state.logs[bestKey];
    const item = (l.plan || []).find((i) => i.exerciseId === exerciseId && A.isLogged(l.perf[i.id]));
    return { date: bestKey, perf: l.perf[item.id] };
  }

  /**
   * One exercise over time, newest last — the series behind its chart.
   *
   * Only days that were LOGGED appear. A day the exercise was scheduled and
   * nothing was written down is not a zero: we know the user did not record it,
   * not that they lifted nothing, and drawing a zero would invent the second.
   */
  function exerciseSeries(exerciseId, days, unit) {
    const u = unit || weightUnit();
    const n = Math.max(1, days || 90);
    const end = today();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const k = A.addDays(end, -i);
      const l = state.logs[k];
      if (!l || !l.perf) continue;
      const item = (l.plan || []).find((x) => x.exerciseId === exerciseId && A.isLogged(l.perf[x.id]));
      if (!item) continue;
      const perf = l.perf[item.id];
      const sets = perf.sets || [];
      const loaded = sets.filter((x) => x.w != null && isFinite(x.w));
      const top = loaded.length
        ? Math.max.apply(null, loaded.map((x) => A.convertWeight(x.w, x.u || 'kg', u)))
        : null;
      out.push({
        date: k,
        volume: A.entryVolume(perf, u),
        sets: sets.length,
        reps: sets.reduce((sum, x) => sum + Math.max(0, Math.round(Number(x.r) || 0)), 0),
        top: top,
        minutes: perf.min > 0 ? perf.min : null,
        km: perf.km > 0 ? perf.km : null
      });
    }
    return out;
  }

  /**
   * The real ledger: what the user actually did, counted from their own logs.
   *
   * Nothing here is stored; it is all derived, like every other number in the
   * app, and every one of them is a fact rather than a score — sessions kept,
   * sets performed, kilos moved. knowledge/project.md says a real total
   * outranks a synthetic one, which is why there is no points column.
   */
  function lifeTotals() {
    const start = historyStart();
    const t = today();
    const days = Math.max(1, A.daysBetween(start, t) + 1);
    const hist = history();
    const u = weightUnit();

    let sessions = 0;
    let workoutDays = 0;
    let sets = 0;
    let reps = 0;
    let volume = 0;
    let minutes = 0;
    let km = 0;
    const byExercise = new Map();

    for (const k in state.logs) {
      const l = state.logs[k];
      const done = Object.values(l.ex || {}).filter(Boolean).length + (l.extra || []).length;
      sessions += done;
      if (done > 0) workoutDays++;
      if (!l.perf) continue;
      (l.plan || []).forEach((item) => {
        const perf = l.perf[item.id];
        if (!A.isLogged(perf)) return;
        const ex = exerciseById(item.exerciseId);
        const id = item.exerciseId;
        const row = byExercise.get(id) || {
          id: id, name: (ex && ex.name) || item.name || 'Exercise',
          days: 0, sets: 0, reps: 0, volume: 0, best: null, last: null
        };
        byExercise.set(id, row);
        row.days++;
        if (!row.last || k > row.last) row.last = k;
        (perf.sets || []).forEach((set) => {
          const r = Math.max(0, Math.round(Number(set.r) || 0));
          row.sets++;
          row.reps += r;
          row.volume += A.setVolume(set, u);
          sets++;
          reps += r;
          volume += A.setVolume(set, u);
          if (set.w != null && isFinite(set.w)) {
            const w = A.convertWeight(set.w, set.u || 'kg', u);
            if (!row.best || w > row.best.w) row.best = { w: w, r: r, date: k };
          }
        });
        if (perf.min > 0) minutes += perf.min;
        if (perf.km > 0) km += perf.km;
      });
    }

    return {
      days: days,
      since: start,
      kept: hist.completeDays,
      sessions: sessions,
      workoutDays: workoutDays,
      sets: sets,
      reps: reps,
      volume: volume,
      minutes: minutes,
      km: km,
      unit: u,
      exercises: Array.from(byExercise.values()).sort((a, b) => b.days - a.days || b.volume - a.volume)
    };
  }

  /** Every day the app has a record for. */
  function activeDays() {
    return Object.keys(state.logs);
  }
  /* ---------- rewards the user sets for themselves ---------- */

  /**
   * A custom reward is a promise: keep something going for N days and you have
   * earned the thing you named. Unlike the built-in milestones it pays out in
   * the real world, so claiming records that you actually bought it — there is
   * no XP, because inventing points for buying yourself trainers would be
   * exactly the kind of unearned number this app refuses to show.
   *
   * There is one thing it can be tied to — the training streak — and it is
   * earned on the BEST run that streak ever reached, so a slip afterwards
   * cannot revoke something already won.
   */
  const customRewards = () => state.customRewards || [];

  function addCustomReward(data) {
    const r = Object.assign(
      { id: A.uid('rw'), name: 'New reward', icon: '', days: 14, claimedOn: null },
      data || {}
    );
    r.days = Math.max(1, Math.round(Number(r.days) || 1));
    state.customRewards.push(r);
    commit({ type: 'rewardAdd', id: r.id });
    return r;
  }

  function updateCustomReward(id, patch) {
    const r = customRewards().find((x) => x.id === id);
    if (!r) return;
    Object.assign(r, patch);
    r.days = Math.max(1, Math.round(Number(r.days) || 1));
    commit({ type: 'rewardUpdate', id: id });
  }

  function removeCustomReward(id) {
    state.customRewards = customRewards().filter((x) => x.id !== id);
    commit({ type: 'rewardRemove', id: id });
  }

  /** Best run ever reached, so a reward stays earned once the streak got there. */
  function customRewardProgress(r) {
    const have = history().best;
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
      pct: Math.min(100, Math.round((complete / Math.max(1, goal)) * 100))
    };
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

  function completeAll(dateKey) {
    if (isFuture(dateKey)) return;
    const l = ensureLog(dateKey);
    dayPlan(dateKey).forEach((i) => (l.ex[i.id] = true));
    commit({ type: 'completeAll', dateKey });
  }

  /**
   * Tick the whole of a day's workout, or take it all back off.
   *
   * It toggles rather than only completing, so the tap is its own undo — the
   * heading is the one place a whole workout can be marked from, and a
   * mis-tap there would otherwise need the day cleared to correct.
   */
  function toggleWorkout(dateKey) {
    if (isFuture(dateKey)) return null;
    const plan = dayPlan(dateKey);
    if (!plan.length) return null;
    const l = ensureLog(dateKey);
    const all = plan.every((i) => l.ex[i.id]);
    plan.forEach((i) => {
      if (all) delete l.ex[i.id];
      else l.ex[i.id] = true;
    });
    commit({ type: 'toggleWorkout', dateKey });
    return !all;
  }

  /* ---------- mutations: the set log ----------

     Writing a set is a separate verb from ticking the exercise off, and the two
     only ever move in one direction together: filling in the last prescribed
     set marks the exercise done, and nothing here ever un-marks it. Deleting a
     set you mistyped must not quietly retract a session you know you did — that
     is the user's own tap to take back, on the tick they made themselves.

     Every one of these refuses a future date, exactly as `toggleExercise` does.
     Deciding what next Tuesday will weigh is a prescription, and prescriptions
     live in the plan. */

  /** The plan item on a day, from the day's own frozen list. */
  function itemOn(dateKey, itemId) {
    return dayPlan(dateKey).find((i) => i.id === itemId) || null;
  }

  /** How many sets this row asked for, from the item and never from the log. */
  function askedSets(dateKey, itemId) {
    const item = itemOn(dateKey, itemId);
    if (!item) return 0;
    const ex = exerciseById(item.exerciseId);
    if (A.logShape(ex) !== 'reps') return 0;
    return Math.max(0, Math.round(Number(item.sets != null ? item.sets : ex && ex.sets) || 0));
  }

  /** Mark the row done once it has met what it asked for. Never the reverse. */
  function maybeComplete(l, dateKey, itemId) {
    if (l.ex[itemId]) return;
    const item = itemOn(dateKey, itemId);
    if (!item) return;
    const ex = exerciseById(item.exerciseId);
    const perf = l.perf[itemId];
    if (!A.isLogged(perf)) return;
    const shape = A.logShape(ex);
    if (shape === 'reps') {
      const want = askedSets(dateKey, itemId);
      if (want && (perf.sets || []).length >= want) l.ex[itemId] = true;
      return;
    }
    if (shape === 'time') {
      const want = Number(item.minutes != null ? item.minutes : ex && ex.minutes) || 0;
      if (want && perf.min >= want) l.ex[itemId] = true;
      return;
    }
    const want = Number(item.km != null ? item.km : ex && ex.km) || 0;
    if (want && perf.km >= want) l.ex[itemId] = true;
  }

  /** An entry that exists so a set has somewhere to land. */
  function ensurePerf(l, itemId) {
    if (!l.perf[itemId]) l.perf[itemId] = {};
    return l.perf[itemId];
  }

  /** Drop an entry that holds nothing, so an empty one never reads as logged. */
  function prunePerf(l, itemId) {
    const perf = l.perf[itemId];
    if (!perf) return;
    if (Array.isArray(perf.sets) && !perf.sets.length) delete perf.sets;
    if (!A.isLogged(perf) && !perf.note) delete l.perf[itemId];
  }

  /**
   * Record one set.
   *
   * `weight` is null for a bodyweight set, which is a real answer and not a
   * missing one — see the note on the set shape in js/data.js. The unit in
   * force right now is stamped onto the set, so switching the display unit
   * later re-reads this set rather than re-valuing it.
   */
  function addSet(dateKey, itemId, weight, reps) {
    if (isFuture(dateKey)) return null;
    const l = ensureLog(dateKey);
    const perf = ensurePerf(l, itemId);
    perf.sets = perf.sets || [];
    const w = Number(weight);
    perf.sets.push({
      w: weight == null || weight === '' || !isFinite(w) ? null : w,
      u: weightUnit(),
      r: Math.max(0, Math.round(Number(reps) || 0))
    });
    maybeComplete(l, dateKey, itemId);
    commit({ type: 'addSet', dateKey, itemId });
    return perf.sets[perf.sets.length - 1];
  }

  function updateSet(dateKey, itemId, index, weight, reps) {
    if (isFuture(dateKey)) return false;
    const l = ensureLog(dateKey);
    const perf = l.perf[itemId];
    const set = perf && perf.sets && perf.sets[index];
    if (!set) return false;
    const w = Number(weight);
    set.w = weight == null || weight === '' || !isFinite(w) ? null : w;
    set.u = weightUnit();
    set.r = Math.max(0, Math.round(Number(reps) || 0));
    commit({ type: 'updateSet', dateKey, itemId, index });
    return true;
  }

  function removeSet(dateKey, itemId, index) {
    if (isFuture(dateKey)) return null;
    const l = ensureLog(dateKey);
    const perf = l.perf[itemId];
    if (!perf || !perf.sets || !perf.sets[index]) return null;
    const gone = perf.sets.splice(index, 1)[0];
    prunePerf(l, itemId);
    commit({ type: 'removeSet', dateKey, itemId, index });
    return gone;
  }

  /** Undo for `removeSet`: the same set back in the same place. */
  function restoreSet(dateKey, itemId, index, set) {
    if (!set || isFuture(dateKey)) return;
    const l = ensureLog(dateKey);
    const perf = ensurePerf(l, itemId);
    perf.sets = perf.sets || [];
    perf.sets.splice(Math.max(0, Math.min(index, perf.sets.length)), 0, set);
    commit({ type: 'restoreSet', dateKey, itemId });
  }

  /** Minutes and kilometres, for the exercises that are measured in them. */
  function setAmount(dateKey, itemId, patch) {
    if (isFuture(dateKey)) return false;
    const l = ensureLog(dateKey);
    const perf = ensurePerf(l, itemId);
    ['min', 'km'].forEach((f) => {
      if (!(f in patch)) return;
      const n = Number(patch[f]);
      if (patch[f] == null || patch[f] === '' || !isFinite(n) || n <= 0) delete perf[f];
      else perf[f] = n;
    });
    maybeComplete(l, dateKey, itemId);
    prunePerf(l, itemId);
    commit({ type: 'setAmount', dateKey, itemId });
    return true;
  }

  /** A free-text note on one exercise — how it felt, what the bar did. */
  function setPerfNote(dateKey, itemId, text) {
    if (isFuture(dateKey)) return false;
    const l = ensureLog(dateKey);
    const perf = ensurePerf(l, itemId);
    const t = String(text || '').trim().slice(0, 240);
    if (t) perf.note = t;
    else delete perf.note;
    prunePerf(l, itemId);
    commit({ type: 'setPerfNote', dateKey, itemId });
    return true;
  }

  /** Everything recorded against one exercise on one day, thrown away. */
  function clearPerf(dateKey, itemId) {
    const l = state.logs[dateKey];
    if (!l || !l.perf || !l.perf[itemId]) return null;
    const gone = l.perf[itemId];
    delete l.perf[itemId];
    commit({ type: 'clearPerf', dateKey, itemId });
    return gone;
  }

  function restorePerf(dateKey, itemId, perf) {
    if (!perf) return;
    const l = ensureLog(dateKey);
    l.perf[itemId] = perf;
    commit({ type: 'restorePerf', dateKey, itemId });
  }

  /**
   * What to put in the boxes before the user types anything.
   *
   * Last session first, because "what did I do last time" is the question this
   * whole screen exists to answer, and the plan prescription second. It
   * SUGGESTS and never writes: nothing is stored until a set is actually
   * logged, so an exercise the user skipped leaves no trace claiming otherwise.
   * `from` says which of the three it came from, so the screen can say so.
   */
  function suggestSet(dateKey, itemId) {
    const item = itemOn(dateKey, itemId);
    if (!item) return null;
    const ex = exerciseById(item.exerciseId);
    const shape = A.logShape(ex);
    const u = weightUnit();
    const prev = lastPerformance(item.exerciseId, dateKey);
    const l = state.logs[dateKey];
    const perf = (l && l.perf && l.perf[itemId]) || null;
    const doneSets = (perf && perf.sets) || [];

    if (shape !== 'reps') {
      const asked = shape === 'time'
        ? { min: Number(item.minutes != null ? item.minutes : ex && ex.minutes) || null }
        : { km: Number(item.km != null ? item.km : ex && ex.km) || null };
      return { shape: shape, from: prev ? 'last' : 'plan', last: prev, asked: asked, unit: u };
    }

    /* The set already typed today beats last week's: within a session you climb
       or you hold, and the row above is what you climbed from. */
    const here = doneSets[doneSets.length - 1];
    const prevSets = (prev && prev.perf.sets) || [];
    const there = prevSets.length ? prevSets[Math.min(doneSets.length, prevSets.length - 1)] : null;
    const src = here || there || null;
    const reps = Number(item.reps != null ? item.reps : ex && ex.reps) || 0;
    return {
      shape: 'reps',
      from: here ? 'today' : there ? 'last' : 'plan',
      last: prev,
      unit: u,
      weight: src && src.w != null ? A.round1(A.convertWeight(src.w, src.u || 'kg', u)) : null,
      reps: (src && src.r) || reps || 0,
      index: doneSets.length,
      asked: askedSets(dateKey, itemId)
    };
  }

  /**
   * What was actually trained over the last `days` days, by muscle group.
   *
   * Counted from the day's own frozen exercise list and only from exercises the
   * user ticked — this answers "what did I do", never "what was planned". A day
   * never opened contributes nothing, the same way it contributes nothing to
   * the streak.
   *
   * The totals deliberately overlap: a deadlift counts once to back, once to
   * legs and once to glutes, because it trained all three and pretending
   * otherwise is the reason a single-value muscle field would be a lie. That is
   * why this returns per-group counts and a `most`, and no percentage — there
   * is no honest denominator to divide by.
   */
  function muscleTally(days, endKey) {
    const end = endKey || today();
    const counts = {};
    let sessions = 0;
    let untagged = 0;

    for (let i = 0; i < Math.max(1, days); i++) {
      const k = A.addDays(end, -i);
      const l = state.logs[k];
      if (!l || !l.ex) continue;
      let didAny = false;
      dayPlan(k).forEach((item) => {
        if (!l.ex[item.id]) return;
        didAny = true;
        const ex = exerciseById(item.exerciseId);
        const muscles = A.cleanMuscles(ex && ex.muscles);
        if (!muscles.length) { untagged++; return; }
        muscles.forEach((m) => { counts[m] = (counts[m] || 0) + 1; });
      });
      if (didAny) sessions++;
    }

    const rows = A.MUSCLES
      .filter((m) => counts[m.id])
      .map((m) => ({ id: m.id, name: m.name, count: counts[m.id] }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return {
      rows: rows,
      sessions: sessions,
      untagged: untagged,
      most: rows.length ? rows[0].count : 0,
      /* What was *missed*, which is the half of a training week that actually
         changes what you do tomorrow — reported by REGION rather than by head.
         Naming every untrained head reads "nothing for upper chest, lats,
         traps, lower back, front delts, side delts, rear delts…", which is a
         paragraph nobody finishes. "Nothing for back, shoulders" is the same
         fact and is actionable. A region counts as trained the moment any head
         in it is. */
      missing: (function () {
        const trained = {};
        A.MUSCLES.forEach((m) => { if (counts[m.id]) trained[m.group] = true; });
        const out = [];
        A.MUSCLES.forEach((m) => {
          if (m.group === 'Other' || trained[m.group] || out.indexOf(m.group) >= 0) return;
          out.push(m.group);
        });
        return out;
      })()
    };
  }

  /* ---------- undo ----------

     Three setters that put a container back exactly as it was. They exist only
     for the UNDO in a toast, and they are deliberately dumb: they restore a
     snapshot rather than re-deriving anything, because the point of an undo is
     that the state afterwards is the state before, not a fresh computation that
     happens to agree. Day status is derived from these, so putting them back
     puts it back too. */

  function restoreExercises(dateKey, snapshot) {
    const l = state.logs[dateKey];
    if (!l || !snapshot || typeof snapshot !== 'object') return null;
    const exMap = snapshot.ex || snapshot;   // the old shape was the map alone
    l.ex = {};
    Object.keys(exMap).forEach((id) => { if (exMap[id]) l.ex[id] = true; });
    if (snapshot.perf) l.perf = JSON.parse(JSON.stringify(snapshot.perf));
    commit({ type: 'restoreExercises', dateKey });
    return l.ex;
  }

  function restorePlanDay(dayIndex, items) {
    if (!Array.isArray(items) || !state.plan[dayIndex]) return null;
    state.plan[dayIndex] = items.map((i) => Object.assign({}, i));
    commit({ type: 'restorePlanDay', dayIndex });
    return state.plan[dayIndex];
  }

  function restoreExtras(dateKey, items) {
    const l = state.logs[dateKey];
    if (!l || !Array.isArray(items)) return null;
    l.extra = items.map((x) => Object.assign({}, x));
    commit({ type: 'restoreExtras', dateKey });
    return l.extra;
  }

  /**
   * Everything logged on a day, taken back off — the ticks AND the sets.
   *
   * Both, because clearing the ticks alone would leave a day holding three sets
   * of bench press that it also says were never done. The undo hands the whole
   * snapshot back, which is why `restoreExercises` takes both halves.
   */
  function clearDay(dateKey) {
    const l = state.logs[dateKey];
    if (!l) return null;
    const before = { ex: Object.assign({}, l.ex), perf: JSON.parse(JSON.stringify(l.perf || {})) };
    l.ex = {};
    l.perf = {};
    commit({ type: 'clearDay', dateKey });
    return before;
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

  /* ---------- mutations: plan ---------- */

  /**
   * Put the built-in programme back over the weekly plan, on purpose.
   *
   * `installProgram` runs exactly ONCE per account, guarded by
   * `meta.programInstalled`, so changing the programme in `js/program.js` reaches
   * a fresh install and nobody else. That guard is not a bug — re-running it from
   * a migration would replace a plan the user has since built by hand, and
   * "never overwrite user data in a migration" is one of this app's rules.
   *
   * So the way a new programme reaches an existing account is a tap. The user
   * asks for it, having been told in the confirm sheet exactly what it replaces.
   * The library is additive as always; only `state.plan` is rewritten, and no
   * logged day moves, because `ensureLog` froze each day's exercises into that
   * day's log the first time it was touched.
   */
  function reinstallProgram(contextId) {
    installProgram(state, contextId);
    state.meta.programInstalled = true;
    commit({ type: 'programReinstall', context: contextId });
    return state.plan;
  }

  /** Which context is laid down right now, for the screen that offers them. */
  const programContext = () => (state.meta && state.meta.programContext) || 'site';

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
      { id: A.uid('ex'), name: 'New exercise', category: 'Other', unit: 'reps', sets: 3, reps: 10, icon: '', muscles: [] },
      data || {}
    );
    // Only ids the catalog knows, whatever the caller passed.
    ex.muscles = A.cleanMuscles(ex.muscles);
    state.exercises.push(ex);
    commit({ type: 'exerciseAdd', id: ex.id });
    return ex;
  }

  function updateExercise(id, patch) {
    const ex = exerciseById(id);
    if (!ex) return;
    Object.assign(ex, patch);
    if ('muscles' in (patch || {})) ex.muscles = A.cleanMuscles(ex.muscles);
    commit({ type: 'exerciseUpdate', id });
  }

  function removeExercise(id) {
    state.exercises = state.exercises.filter((e) => e.id !== id);
    for (let d = 0; d <= 6; d++) state.plan[d] = (state.plan[d] || []).filter((i) => i.exerciseId !== id);
    commit({ type: 'exerciseRemove', id });
  }

  /**
   * One goal's last N days: what was logged, and what was asked.
   *
   * Both come from the record rather than from the goal as it stands today.
   * `goalEntry` carries the target the day was judged against, and
   * `goalTargetOn` falls back to it, so a chart of last month shows the ladder
   * as it actually was — raising a target tomorrow cannot redraw a month the
   * user already lived. That is the same rule the whole app runs on, and a graph
   * is the one place it would be easiest to break without anybody noticing.
   *
   * `asked: false` on a day the schedule never asked for — a Saturday on a
   * weekday goal is not a zero, and plotting it as one would draw a fortnightly
   * sawtooth that means nothing.
   */
  /**
   * Did the previous day break, with today still open?
   *
   * "Never miss twice" is the consistency rule in the book, and it is the one
   * moment this app had nothing to say about. A streak counter tells you what
   * you have; it does not tell you that the single highest-leverage day of the
   * whole year is the one immediately after a miss.
   *
   * Deliberately narrow. It is silent on a rest day, on a frozen day, before
   * there is any history to miss, and the moment today is complete — a nag that
   * fires when there is nothing to fix is a nag people learn to ignore.
   */
  function missedYesterday(dateKey) {
    const k = dateKey || today();
    if (k !== today()) return null;                     // only ever about now
    const prev = A.addDays(k, -1);
    if (A.daysBetween(historyStart(), prev) < 0) return null;
    const y = dayStatus(prev);
    if (y.status !== 'missed' && y.status !== 'partial') return null;
    if (y.frozen) return null;
    const t = dayStatus(k);
    if (t.status === 'complete' || t.status === 'rest' || !t.total) return null;
    return { date: prev, status: y.status, pct: y.pct, left: Math.max(0, t.total - t.done) };
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
    load, get, settings, save, flush, commit, today, acknowledgeClock,
    exerciseById, dayPlan, log, ensureLog, isFuture, historyStart, activeDays,
    dayStatus, currentStreak, history, lifeTotals, weekStats,
    customRewards, addCustomReward, updateCustomReward, removeCustomReward,
    customRewardProgress, claimCustomReward,
    toggleExercise, completeAll, toggleWorkout, muscleTally, clearDay, addExtra, removeExtra,
    restoreExercises, restorePlanDay, restoreExtras,
    addToPlan, updatePlanItem, removePlanItem, movePlanItem, copyDayPlan, clearDayPlan,
    reinstallProgram, programContext,
    missedYesterday, deloadWeek,
    addExercise, updateExercise, removeExercise,
    dayEntries, dayVolume, lastPerformance, exerciseSeries, suggestSet, askedSets,
    addSet, updateSet, removeSet, restoreSet, setAmount, setPerfNote, clearPerf, restorePerf,
    freezeStats, applyFreeze, clearFreeze,
    updateSettings, exportJson, inspectBackup, importJson, unreadableBackup, resetAll,
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn))
  };
})(window);
