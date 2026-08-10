/* Arise — the progression engine.
   Pure functions only: nothing here touches storage, so the whole thing is
   testable from node (see tools/smoke.js) and reusable by every section.

   Three rules hold the design together:
     1. A goal has a baseline AND a target. Progression stops at the target —
        it can never run away into 3am wake-ups.
     2. Levels are earned by performing, never by the calendar turning over.
        Miss a week and you stay where you are; miss enough and you step back.
     3. Difficulty scales the size of a step, not the rules for earning one. */
(function (root) {
  'use strict';

  const A = root.Arise;
  const G = {};

  const DEFAULT_ADVANCE = { successes: 5, window: 7 };
  const DEFAULT_REGRESS = { misses: 3 };

  /* ---------- normalising values ---------- */

  /** Bedtimes wrap: 00:30 is *later* than 23:30 but numerically smaller.
      A goal with wrapAt=720 treats anything before noon as after-midnight. */
  function norm(goal, v) {
    if (v == null) return null;
    if (goal.unit === 'time' && goal.wrapAt != null && v < goal.wrapAt) return v + 1440;
    return v;
  }

  function denorm(goal, v) {
    if (v == null) return null;
    return goal.unit === 'time' ? ((Math.round(v) % 1440) + 1440) % 1440 : v;
  }

  const INTEGER_UNITS = { time: 1, minutes: 1, count: 1, pages: 1, seconds: 1 };

  function roundValue(goal, v) {
    return INTEGER_UNITS[goal.unit] ? Math.round(v) : Math.round(v * 100) / 100;
  }

  /* ---------- difficulty ---------- */

  function modeOf(goal, globalMode) {
    const m = goal && goal.mode && goal.mode !== 'inherit' ? goal.mode : globalMode || 'normal';
    return A.MODES[m] ? m : 'normal';
  }

  /** Step size per level, in the goal's own unit. */
  function stepFor(goal, mode) {
    const id = modeOf(goal, mode);
    if (goal.steps && goal.steps[id] != null) return Math.abs(Number(goal.steps[id])) || 0;
    return Math.abs(Number(goal.step) || 0) * A.MODES[id].mult;
  }

  /** How many steps separate baseline from target. Progression cannot exceed this. */
  function maxLevel(goal, mode) {
    const step = stepFor(goal, mode);
    if (!step) return 0;
    const span = Math.abs(norm(goal, goal.target) - norm(goal, goal.baseline));
    return Math.ceil(span / step - 1e-9);
  }

  /** The value demanded at a given level — clamped so it never passes the target. */
  function valueAt(goal, level, mode) {
    const step = stepFor(goal, mode);
    const base = norm(goal, goal.baseline);
    const target = norm(goal, goal.target);
    const dir = goal.direction === 'down' ? -1 : 1;
    let raw = base + dir * step * Math.max(0, level);
    raw = dir < 0 ? Math.max(raw, target) : Math.min(raw, target);
    return denorm(goal, roundValue(goal, raw));
  }

  /**
   * Did this entry satisfy what was asked?
   *
   * An entry remembers the target it was logged against, so a day you completed
   * stays completed forever — changing difficulty, the baseline or the target
   * later can never reach back and turn an old success into a failure.
   */
  function evaluate(goal, entry, target) {
    if (!entry) return false;
    if (goal.gate === 'summary' && !(entry.summary && entry.summary.trim())) return false;
    if (entry.skipped) return false;
    if (goal.track === 'check') return !!entry.checked;
    if (entry.value == null || entry.value === '') return !!entry.checked;
    const v = norm(goal, Number(entry.value));
    const t = norm(goal, Number(entry.target != null ? entry.target : target));
    if (isNaN(v)) return !!entry.checked;
    return goal.direction === 'down' ? v <= t + 1e-9 : v >= t - 1e-9;
  }

  /* ---------- scheduling ---------- */

  /**
   * The schedule that was in force on a given day.
   *
   * A goal's targets are already frozen per entry and a day's exercises are frozen
   * into its log, for one reason: editing a goal must never rewrite days you have
   * already lived. The schedule needs the same protection. Without it, switching a
   * goal from daily to weekdays-only retroactively un-schedules every past Saturday,
   * which silently changes which days counted as misses and therefore when you
   * levelled up or stepped back.
   *
   * `scheduleHistory` is a list of `{ from, schedule }` in ascending date order.
   * Goals saved before this existed have no history and simply resolve to their
   * current schedule, which is exactly the old behaviour.
   */
  function scheduleOn(goal, dateKey) {
    const hist = goal.scheduleHistory;
    if (!Array.isArray(hist) || !hist.length) return goal.schedule || { type: 'daily' };
    let chosen = hist[0];
    for (let i = 0; i < hist.length; i++) {
      if (A.daysBetween(hist[i].from, dateKey) >= 0) chosen = hist[i];
      else break;
    }
    return chosen.schedule || goal.schedule || { type: 'daily' };
  }

  function isScheduled(goal, dateKey) {
    const s = scheduleOn(goal, dateKey);
    if (s.type === 'weekdays') return (s.days || []).indexOf(A.weekday(dateKey)) >= 0;
    return true; // 'daily', and anything unrecognised, asks for every day
  }

  /**
   * Was the goal paused on a given day?
   *
   * The same protection as `scheduleOn`, for the same reason. Pausing a goal is a
   * one-tap, reversible-looking action, but reading the *current* flag when
   * scoring a *past* day silently un-asks every day already lived: a day that was
   * 3/5 becomes 3/3, which turns a partial day complete and inflates the streak.
   *
   * `activeHistory` is a list of `{ from, archived }` in ascending date order.
   * Goals saved before this existed have no history and resolve to their current
   * flag, which is exactly the old behaviour.
   */
  function isArchived(goal, dateKey) {
    const hist = goal.activeHistory;
    if (!Array.isArray(hist) || !hist.length) return !!goal.archived;
    let chosen = hist[0];
    for (let i = 0; i < hist.length; i++) {
      if (A.daysBetween(hist[i].from, dateKey) >= 0) chosen = hist[i];
      else break;
    }
    return !!chosen.archived;
  }

  /**
   * The baseline eras a goal has run through.
   *
   * Re-baselining closes the current era and opens a new one: the ladder restarts
   * at level 0 from that day, while every earlier day keeps being judged by the
   * era it was actually lived in. Before this existed, re-baselining moved
   * `startDate` forward instead, which dropped every past day out of the goal
   * entirely — the same re-judging bug from the other direction.
   */
  function erasOf(goal) {
    const hist = goal.baselineHistory;
    if (!Array.isArray(hist) || !hist.length) return [{ from: goal.startDate, baseline: goal.baseline }];
    return hist;
  }

  /* ---------- the timeline ---------- */

  /**
   * Replays a goal's whole history to derive its current level.
   *
   * ctx = { today, mode, entry(dateKey), frozen(dateKey) }
   *
   * Only days *before* today drive transitions, because an unfinished today is
   * not yet a miss. Today can still push you up the moment you complete it.
   */
  function timeline(goal, ctx) {
    const adv = Object.assign({}, DEFAULT_ADVANCE, goal.advance || {});
    const reg = goal.regress === false ? null : Object.assign({}, DEFAULT_REGRESS, goal.regress || {});
    const mode = modeOf(goal, ctx.mode);
    const today = ctx.today;
    const start = goal.startDate || today;

    // One shim per era, built once, so the replay can ask what a given day's
    // baseline demanded without rebuilding an object on every day it walks.
    const eras = erasOf(goal).map((e) => {
      const shim = e.baseline === goal.baseline ? goal : Object.assign({}, goal, { baseline: e.baseline });
      return { from: e.from, goal: shim, cap: maxLevel(shim, mode) };
    });
    let eraIdx = 0;
    let era = eras[0];

    let level = 0;
    let misses = 0;
    let win = [];
    const levelByDay = {};
    const targetByDay = {};
    const events = [];
    let doneDays = 0;
    let scheduledDays = 0;
    /* The longest run of kept days this goal has ever had. Derived here rather
       than stored because the replay already walks every day — and a reward the
       user promised themselves at "14 days" must stay earned once reached, even
       if the current streak later breaks. */
    let run = 0;
    let bestRun = 0;

    /* Crossing into a new era restarts the ladder — that is what re-baselining
       means: today becomes day one, at the new starting point. */
    const enterEra = (dateKey) => {
      while (eraIdx + 1 < eras.length && A.daysBetween(eras[eraIdx + 1].from, dateKey) >= 0) {
        eraIdx++;
        era = eras[eraIdx];
        level = 0;
        win = [];
        misses = 0;
      }
    };

    const apply = (dateKey, ok) => {
      win.push(ok);
      if (win.length > adv.window) win.shift();
      misses = ok ? 0 : misses + 1;
      const hits = win.filter(Boolean).length;
      if (ok && hits >= adv.successes && level < era.cap) {
        level++;
        win = [];
        misses = 0;
        events.push({ date: dateKey, type: 'up', level });
      } else if (!ok && reg && misses >= reg.misses && level > 0) {
        level--;
        win = [];
        misses = 0;
        events.push({ date: dateKey, type: 'down', level });
      }
    };

    let cursor = start;
    let guard = 0;
    while (guard++ < 4000 && A.daysBetween(cursor, today) > 0) {
      enterEra(cursor);
      if (isScheduled(goal, cursor)) {
        levelByDay[cursor] = level;
        const ask = valueAt(era.goal, level, mode);
        targetByDay[cursor] = ask;
        scheduledDays++;
        const ok = evaluate(goal, ctx.entry(cursor), ask);
        const held = !!(ctx.frozen && ctx.frozen(cursor));
        if (ok) {
          doneDays++;
          run++;
          if (run > bestRun) bestRun = run;
        } else if (!held) {
          run = 0; // a freeze holds the chain without extending it
        }
        // A frozen day is neither a hit nor a miss — it simply doesn't count.
        if (!(held && !ok)) apply(cursor, ok);
      }
      cursor = A.addDays(cursor, 1);
    }

    // Today: counts only if already satisfied, so it can lift you but never drop you.
    enterEra(today);
    const todayScheduled = A.daysBetween(start, today) >= 0 && isScheduled(goal, today);
    if (todayScheduled) {
      levelByDay[today] = level;
      const askToday = valueAt(era.goal, level, mode);
      targetByDay[today] = askToday;
      scheduledDays++;
      const okToday = evaluate(goal, ctx.entry(today), askToday);
      if (okToday) {
        doneDays++;
        run++;
        if (run > bestRun) bestRun = run;
        apply(today, true);
      }
    }

    const target = valueAt(era.goal, level, mode);
    const hits = win.filter(Boolean).length;

    return {
      mode,
      level,
      maxLevel: era.cap,
      target,
      levelByDay,
      targetByDay,
      events,
      doneDays,
      scheduledDays,
      bestStreak: bestRun,
      atTarget: level >= era.cap,
      /* progress toward the next step */
      windowHits: hits,
      windowNeeded: adv.successes,
      windowSize: adv.window,
      toAdvance: Math.max(0, adv.successes - hits),
      /* how close a slip is to costing a level */
      misses,
      missesAllowed: reg ? reg.misses : null,
      atRisk: !!(reg && level > 0 && misses >= reg.misses - 1),
      nextTarget: level < era.cap ? valueAt(era.goal, level + 1, mode) : null,
      scheduledToday: todayScheduled
    };
  }

  /** What the goal asked for on a past day — so history never gets rewritten.
      The replay recorded the ask against the era that day was lived in; deriving
      it from the goal's current baseline would re-judge everything before a
      re-baseline. */
  function targetOn(goal, dateKey, tl, mode) {
    if (tl.targetByDay && tl.targetByDay[dateKey] != null) return tl.targetByDay[dateKey];
    const lvl = tl.levelByDay[dateKey];
    if (lvl == null) return tl.target;
    return valueAt(goal, lvl, modeOf(goal, mode));
  }

  /**
   * Consecutive scheduled days satisfied, walking backwards.
   * Unscheduled days are skipped (a rest day is not a failure) and frozen days
   * hold the chain without extending it.
   */
  function streak(goal, ctx, tl) {
    const today = ctx.today;
    const start = goal.startDate || today;
    let cursor = today;
    let n = 0;
    let guard = 0;

    if (isScheduled(goal, today) && !evaluate(goal, ctx.entry(today), targetOn(goal, today, tl, ctx.mode))) {
      cursor = A.addDays(today, -1); // today is still in play
    }
    while (guard++ < 2000 && A.daysBetween(start, cursor) >= 0) {
      if (isScheduled(goal, cursor)) {
        if (evaluate(goal, ctx.entry(cursor), targetOn(goal, cursor, tl, ctx.mode))) n++;
        else if (ctx.frozen && ctx.frozen(cursor)) {
          /* held, not counted */
        } else break;
      }
      cursor = A.addDays(cursor, -1);
    }
    return n;
  }

  /** Copy of a seed definition, ready to be stored. */
  function fromSeed(seed, startDate) {
    return Object.assign(
      {
        id: A.uid('gl'),
        mode: 'inherit',
        track: 'value',
        schedule: { type: 'daily' },
        advance: Object.assign({}, DEFAULT_ADVANCE),
        regress: Object.assign({}, DEFAULT_REGRESS),
        archived: false,
        startDate: startDate
      },
      seed,
      { startDate: startDate }
    );
  }

  Object.assign(G, {
    DEFAULT_ADVANCE, DEFAULT_REGRESS,
    norm, denorm, roundValue, modeOf, stepFor, maxLevel, valueAt,
    evaluate, isScheduled, scheduleOn, isArchived, erasOf, timeline, targetOn, streak, fromSeed
  });

  A.Goals = G;
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
})(typeof window !== 'undefined' ? window : globalThis);
