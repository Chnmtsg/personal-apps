/* Discipline — the 66-day run.

   A port of the `life-reset` Python engine, and a deliberately partial one.
   That project has three layers; only the deterministic one belongs here.

     ported      the catalog, the ramp maths, validate/repair, the day record,
                 the recommender, and the daily check-in
     dropped     the Architect and Adaptation agents. Both need a language
                 model, and this app makes no network calls, holds no secrets
                 and has no accounts. Both were written LLM-optional, so what
                 crosses over is the fallback each already had: a dull,
                 low-friction starting programme, and a code-chosen patch.

   This sits BESIDE `goals.js` and shares nothing with it. The two are different
   answers to a similar question — goals.js ramps one target the user chose from
   a baseline they set, and earns each step by performance; a run picks from a
   closed catalog, ramps on the calendar, and is feasible-by-construction across
   all 66 days. Merging them would mean migrating every custom goal onto a
   catalog id it does not have, so they stay separate and a user may have both.

   Pure functions only. Nothing here touches storage, which is what lets
   tools/smoke.js walk thousands of synthetic days without a browser.

   The comments below record bugs the Python version actually shipped. They are
   here because this port inherits every one of the traps that produced them. */
(function (root) {
  'use strict';

  const A = root.Arise;
  const R = {};

  /* ================= the closed catalog ================= */

  /* Nothing outside this list may be a habit. A model — or a future import —
     naming something else gets it dropped, not invented, which is why an
     unknown id can never become a runtime error on day 41. That machinery is
     what made it safe to *shrink* this list: a stored run naming a habit this
     build no longer has keeps it in storage, hides it from the day, and says so
     on the run screen.

     It holds what nothing else in the app tracks. Ten habits were removed in
     2026-08 because they duplicated something the user already had — `read`,
     `meditate` and `deep_work` are seed goals, `water` and `sleep_window` are
     daily habits or sleep goals, and `pushups`, `squats`, `plank`, `run` and
     `strength` are all in the weekly training plan. Today was showing the same
     commitment three times in three sections with three separate ticks. A run
     habit has to earn its place by being the only place a thing is tracked.

     `min` is a scheduling weight, not a duration: it is what the habit costs
     the daily budget, and it is deliberately not what the user is shown. A day
     of three 45-minute habits does not cost 135 budget-minutes. */
  const HABITS = [
    // --- fitness ---
    { id: 'walk', name: 'Walk', domain: 'fitness', unit: 'min', start: 10, target: 45, step: 5, min: 1.0, friction: 1 },
    { id: 'mobility', name: 'Mobility flow', domain: 'fitness', unit: 'min', start: 5, target: 20, step: 2.5, min: 1.0, friction: 2 },
    // --- self-care ---
    { id: 'stretch', name: 'Evening stretch', domain: 'self_care', unit: 'min', start: 5, target: 20, step: 2.5, min: 1.0, friction: 1 },
    { id: 'sunlight', name: 'Morning daylight', domain: 'self_care', unit: 'min', start: 5, target: 20, step: 2.5, min: 1.0, friction: 2 },
    { id: 'cold_shower', name: 'Cold finish', domain: 'self_care', unit: 'sec', start: 15, target: 120, step: 15, min: 0.02, friction: 4 },
    { id: 'no_screens', name: 'Screens off before bed', domain: 'self_care', unit: 'min', start: 15, target: 60, step: 5, min: 0.1, friction: 4 },
    /* Item habits. The dose is the length of a checklist rather than a number,
       because "take your vitamins" is four separate things you can miss one of,
       and a skincare routine is an order you follow rather than five minutes
       you spend. The list is stored per run and is the user's to edit: the
       closed catalog decides which *habits* exist, never what is inside one.

       Nothing downstream needed a new concept for this. `asked` is the item
       count, `did` is how many were ticked, and three of four supplements is a
       partial exactly the way 1.5 of 2 litres is. */
    { id: 'vitamins', name: 'Take vitamins', domain: 'self_care', unit: 'items', start: 1, target: 1, step: 1, min: 0.5, friction: 1,
      items: ['Multivitamin', 'Vitamin D3', 'Omega-3', 'Magnesium'] },
    { id: 'skincare', name: 'Morning skincare', domain: 'self_care', unit: 'items', start: 1, target: 1, step: 1, min: 1.0, friction: 1,
      items: ['Cleanser', 'Niacinamide ampoule', 'Hydrating ampoule', 'Moisturiser', 'SPF 50+'] },
    { id: 'skincare_pm', name: 'Night skincare', domain: 'self_care', unit: 'items', start: 1, target: 1, step: 1, min: 1.0, friction: 1,
      items: ['Cleansing oil', 'Second cleanse', 'Hydrating ampoule', 'Moisturiser'] },
    /* Anchors: target === start, so there is nothing to ramp. `doseOn`'s clamp
       holds them flat with no special case anywhere, and they are the cheapest
       rows on any day, so `repair` never sacrifices one — an anchor is what a
       day still has on it after everything expensive has gone. */
    { id: 'floss', name: 'Floss', domain: 'self_care', unit: 'times', start: 1, target: 1, step: 1, min: 1.0, friction: 2 },
    { id: 'brush_teeth', name: 'Brush teeth', domain: 'self_care', unit: 'times', start: 1, target: 2, step: 1, min: 2.0, friction: 1 },
    // --- development ---
    { id: 'journal', name: 'Journal', domain: 'development', unit: 'min', start: 5, target: 15, step: 2.5, min: 1.0, friction: 1 },
    { id: 'language', name: 'Language practice', domain: 'development', unit: 'min', start: 10, target: 30, step: 5, min: 1.0, friction: 3 },
    { id: 'course', name: 'Course / study', domain: 'development', unit: 'min', start: 15, target: 60, step: 5, min: 1.0, friction: 4 },
    { id: 'write', name: 'Write', domain: 'development', unit: 'min', start: 10, target: 40, step: 5, min: 1.0, friction: 4 }
  ];

  const BY_ID = {};
  HABITS.forEach((h) => { BY_ID[h.id] = h; });

  const habit = (id) => BY_ID[id] || null;
  const isKnown = (id) => Object.prototype.hasOwnProperty.call(BY_ID, id);
  const isItemHabit = (id) => !!(habit(id) && habit(id).items);

  /**
   * The checklist this habit runs with, or null when it is not an item habit.
   *
   * A run carries its own copy, so the user can add, rename and remove entries
   * without touching the catalog. Falls back to the catalog's defaults until it
   * has been edited, so a habit picked today already has sensible steps in it.
   */
  function itemsFor(rh) {
    const h = habit(rh && rh.habitId);
    if (!h || !h.items) return null;
    const own = rh && Array.isArray(rh.items)
      ? rh.items.filter((x) => typeof x === 'string' && x.trim())
      : null;
    return own && own.length ? own.slice() : h.items.slice();
  }

  /** What a habit costs the budget at its heaviest, item habits included. An
      item habit's nominal target is 1 while its real cost is its list length. */
  const topCost = (h) => (h.items ? h.items.length : h.target) * h.min;

  /* A stretch of the run, and the most habits allowed live in it. The cap is
     the point: a programme asking for nine things on day 5 is the one people
     quit in week one. */
  const PHASES = [
    { name: 'foundation', first: 1, last: 21, max: 4 },
    { name: 'build', first: 22, last: 45, max: 7 },
    { name: 'consolidate', first: 46, last: 66, max: 9 }
  ];

  const RUN_DAYS = 66;
  const LAST_INTRO_DAY = 56;   // nothing new may start after this
  const MAX_NEW_PER_WEEK = 2;  // in any rolling 7-day window
  const MIN_HABITS = 3;
  const MAX_HABITS = 9;

  function phaseFor(day) {
    for (const p of PHASES) if (day >= p.first && day <= p.last) return p;
    return null;
  }

  /* ================= dose and cost ================= */

  function roundTo(value, step) {
    if (!(step > 0)) return value;
    return Math.round(value / step) * step;
  }

  /**
   * What this habit asks on this day, or 0 before it starts.
   *
   * Two ordering rules, both of which the Python version got wrong first:
   *
   *   Round the ramp, never the total. Rounding `start + ramp` snaps the whole
   *   figure to a multiple of `step`, which displaces any habit whose starting
   *   dose is not already one — `meditate` (start 3, step 2) rendered a
   *   4-minute day one against a catalog that says 3, then ramped 0, +4, 0, +4
   *   against a declared step of 2. It survived ~165,000 day-renders reporting
   *   zero violations, because the wrong numbers were still monotonic and still
   *   inside [start, target].
   *
   *   Round before the clamp. Rounding after it is how a 90-minute target once
   *   shipped a 100-minute prescription.
   */
  function doseOn(rh, day) {
    if (day < rh.startDay) return 0;
    const h = habit(rh.habitId);
    if (!h) return 0;
    /* A checklist does not ramp. Four supplements is four supplements on day
       one and on day 66, and a programme that added a fifth in week three would
       be inventing a vitamin. The number moves only when the user edits it. */
    if (h.items) return (itemsFor(rh) || []).length;
    // A frozen habit keeps asking whatever it asked on the day it froze.
    const effective = rh.frozenDay == null ? day : Math.min(day, rh.frozenDay);
    const weeks = Math.max(0, Math.floor((effective - rh.startDay) / 7));
    const scale = typeof rh.scale === 'number' && isFinite(rh.scale) ? rh.scale : 1;
    const ramp = roundTo(h.step * weeks * Math.max(0, scale), h.step);
    return Math.min(Math.max(h.start + ramp, h.start), h.target);
  }

  const minutesOn = (rh, day) => doseOn(rh, day) * (habit(rh.habitId) || { min: 0 }).min;

  /**
   * The habits live on a day — and only the ones this build still has.
   *
   * A stored run can name a habit the catalog has since retired: the state
   * outlives the release that wrote it, and an import can arrive from any
   * build. `runDay` used to reach straight for `habit(id).name` and threw on
   * one, which is a crash on the main screen from data that is not corrupt.
   *
   * It is filtered here rather than dropped in the migration on purpose.
   * Removing it from storage would be deleting the user's data to make our
   * rendering easier, and it would be irreversible — filtering leaves the habit
   * in the run, so a build that restores the catalog entry restores the habit
   * with it. `validate` still reports it, and `repair` is what removes it, when
   * the user asks for that.
   */
  const activeOn = (run, day) =>
    (run.habits || []).filter((p) => p.startDay <= day && isKnown(p.habitId));
  const dayMinutes = (run, day) => activeOn(run, day).reduce((n, p) => n + minutesOn(p, day), 0);

  /** Calendar day key → 1-based run day. Outside the run, still honest. */
  const dayIndex = (run, dateKey) => A.daysBetween(run.startDate, dateKey) + 1;

  /* ================= where the user is ================= */

  /**
   * The first thing to ask, every time the app opens.
   *
   * `day` is deliberately not clamped: negative before the run, past 66 after
   * it. Clamping makes day 80 indistinguishable from day 66, which is the
   * difference between "you have finished" and "you have one left". Nothing
   * owned this in the Python version at first, and every caller had to notice
   * for itself — one that forgot kept a user running forever.
   */
  function where(run, dateKey) {
    const day = dayIndex(run, dateKey);
    if (day < 1) return { day, state: 'not_started', running: false, daysOver: 0 };
    if (day > RUN_DAYS) return { day, state: 'finished', running: false, daysOver: day - RUN_DAYS };
    return { day, state: 'running', running: true, daysOver: 0 };
  }

  /* ================= the day view ================= */

  function runDay(run, day) {
    return activeOn(run, day).map((p) => {
      const h = habit(p.habitId);
      return {
        id: h.id,
        name: h.name,
        domain: h.domain,
        unit: h.unit,
        dose: doseOn(p, day),
        minutes: minutesOn(p, day),
        dayOfHabit: day - p.startDay + 1,
        frozen: p.frozenDay != null && day >= p.frozenDay,
        softened: (p.scale == null ? 1 : p.scale) < 1
      };
    });
  }

  /* ================= the day record ================= */

  /**
   * Freeze what a day asked, and what was done about it.
   *
   * The record is the whole reason a lived day cannot be re-judged. `doseOn`
   * answers from the habit's *current* state, so softening on day 30 changes
   * what it says day 12 asked for — fine for a prescription, false for a
   * record. Writing the ask down at the time is also what let a run habit stay
   * four fields instead of growing a list of dated adjustments.
   *
   * `done` is frozen here rather than derived on read, so the rule turning 1.8
   * of 2 litres into a yes or a no cannot change later and silently re-score
   * every day behind the user. And meeting the ask is the whole ask: there is
   * no partial credit toward `done`. The fraction is for the app to draw.
   *
   * `did` is never inferred. A habit ticked with nothing measured keeps
   * `did: null`, because "they said yes" and "we measured the ask" are
   * different facts and flattening them invents data.
   */
  function recordDay(run, day, done, did) {
    const ticked = {};
    (done || []).forEach((id) => { ticked[id] = true; });
    const values = did || {};
    const out = {};
    activeOn(run, day).forEach((p) => {
      const asked = doseOn(p, day);
      const list = itemsFor(p);

      /* An item habit freezes the checklist itself, not only its length. Edit
         the list in week five and week two still shows the four supplements it
         actually asked for that morning, with the one that was missed still
         named. A count alone would remember that three of four were taken and
         forget which. */
      if (list) {
        const state = {};
        const all = !!ticked[p.habitId];
        list.forEach((name) => { state[name] = all; });
        out[p.habitId] = {
          asked: list.length,
          done: all && list.length > 0,
          did: all ? list.length : null,
          items: state
        };
        return;
      }

      const measured = values[p.habitId];
      if (measured == null || !isFinite(measured)) {
        out[p.habitId] = { asked: asked, done: !!ticked[p.habitId], did: null };
      } else {
        out[p.habitId] = { asked: asked, done: measured + 1e-9 >= asked, did: Number(measured) };
      }
    });
    return out;
  }

  /**
   * Tick or untick one item of a checklist, and re-freeze the verdict.
   *
   * `done` is recomputed here rather than derived on read, for the same reason
   * it is frozen everywhere else: the rule turning three of four supplements
   * into a yes or a no must not be changeable after the day is over.
   */
  function toggleItem(entry, name) {
    if (!entry || !entry.items) return entry;
    if (!Object.prototype.hasOwnProperty.call(entry.items, name)) return entry;
    entry.items[name] = !entry.items[name];
    const names = Object.keys(entry.items);
    const ticked = names.filter((k) => entry.items[k]).length;
    entry.did = ticked;
    entry.done = names.length > 0 && ticked === names.length;
    return entry;
  }

  /** How much of the ask was met, or null when nothing was measured. Capped at
      1: beating today is not extra credit, because the ramp is what advances a
      habit and doing more today does not move it. */
  function fractionOf(entry) {
    if (!entry || entry.did == null || !entry.asked) return null;
    return Math.min(1, Math.max(0, entry.did / entry.asked));
  }

  /* ================= the run, looked back on ================= */

  /**
   * What one day of the run looks like from where the user is standing.
   *
   * `unopened` is a state of its own, and keeping it apart from `missed` is the
   * whole reason this lives in the engine rather than in three lines of view
   * code. A day with no record is a day we know nothing about — the app was not
   * opened — and painting it as a failure would be the run retroactively
   * deciding somebody failed a day it never actually asked them about. The
   * streak already refuses to do that, and a picture of the run that quietly
   * disagreed with the streak would be the more believable of the two.
   *
   * Everything about a lived day is read from its frozen record and nothing
   * from the programme as it now stands. Counting `activeOn` instead would make
   * easing a habit in week five redraw week two — the same bug `diagnose`
   * shipped once, in a place the user can see.
   *
   * A day still ahead is the one honest exception: there is no record to read,
   * so `asked` is what the programme currently intends, which is a plan and not
   * a claim about anything that happened.
   */
  function dayMark(run, day, today) {
    if (day > today) return { day: day, state: 'ahead', done: 0, asked: activeOn(run, day).length };

    const entry = (run.log || {})[day] || {};
    const ids = Object.keys(entry);
    const done = ids.filter((k) => entry[k] && entry[k].done).length;

    if (day === today) return { day: day, state: 'today', done: done, asked: ids.length };
    if (!ids.length) return { day: day, state: 'unopened', done: 0, asked: 0 };
    if (done === ids.length) return { day: day, state: 'kept', done: done, asked: ids.length };
    return { day: day, state: done ? 'part' : 'missed', done: done, asked: ids.length };
  }

  /** All 66 days in order, so a view can draw the run without walking the log. */
  function journey(run, today) {
    const out = [];
    for (let day = 1; day <= RUN_DAYS; day++) out.push(dayMark(run, day, today));
    return out;
  }

  /* ================= validation ================= */

  /**
   * Every way a run could be wrong, on any of its 66 days.
   *
   * An infeasible day 41 is the most expensive bug this design can have: the
   * user does not find it until day 41, by which point they have earned 40.
   */
  function validate(run) {
    const v = [];
    const seen = {};
    const habits = run.habits || [];

    habits.forEach((p) => {
      if (!isKnown(p.habitId)) {
        v.push({ kind: 'unknown_habit', day: null, detail: p.habitId + ' is not in the catalog' });
        return;
      }
      if (seen[p.habitId]) v.push({ kind: 'duplicate_habit', day: null, detail: p.habitId + ' appears twice' });
      seen[p.habitId] = true;
      if (!(p.startDay >= 1 && p.startDay <= LAST_INTRO_DAY)) {
        v.push({ kind: 'start_day_range', day: null, detail: p.habitId + ' starts on day ' + p.startDay });
      }
    });

    if (habits.length < MIN_HABITS) {
      v.push({ kind: 'min_habits', day: null, detail: habits.length + ' habits, floor is ' + MIN_HABITS });
    }
    if (v.some((x) => x.kind === 'unknown_habit')) return v;

    /* Two of the rules below are about *easing somebody in*, not about whether
       a day can be done: at most two new habits in any week, and a cap on how
       many run at once early on. They are the right default for a programme a
       machine laid out, and the wrong one for four things a person chose and
       wants to start tonight — being told that flossing begins on day 22 reads
       as the app refusing to do what it was asked.

       `startTogether` opts out of both. What it cannot opt out of is the
       minutes budget, which is the rule that decides whether a day is
       physically doable, and that is the point of keeping them separate. */
    const eased = !run.startTogether;

    const starts = habits.map((p) => p.startDay).sort((a, b) => a - b);
    if (eased) {
      for (const day of starts) {
        const window = starts.filter((d) => d >= day - 6 && d <= day);
        if (window.length > MAX_NEW_PER_WEEK) {
          v.push({ kind: 'new_per_week', day: day, detail: window.length + ' habits start within 7 days of day ' + day });
          break;
        }
      }
    }

    for (let day = 1; day <= RUN_DAYS; day++) {
      const live = activeOn(run, day);
      const cap = phaseFor(day).max;
      if (eased && live.length > cap) {
        v.push({ kind: 'phase_cap', day: day, detail: live.length + ' live, ' + phaseFor(day).name + ' allows ' + cap });
      }
      const minutes = live.reduce((n, p) => n + minutesOn(p, day), 0);
      if (minutes > run.minutesBudget + 1e-9) {
        v.push({ kind: 'daily_budget', day: day, detail: Math.round(minutes) + ' min against a ' + run.minutesBudget + ' min budget' });
      }
      for (const p of live) {
        const h = habit(p.habitId);
        const d = doseOn(p, day);
        /* An item habit is bounded by its own checklist, which `doseOn` returns
           directly — there is no ramp to leave its rails. Measuring it against
           the catalog's nominal start and target would fail all four
           supplements on every day of the run. */
        if (!h.items && (d < h.start - 1e-9 || d > h.target + 1e-9)) {
          v.push({ kind: 'dose_in_bounds', day: day, detail: p.habitId + ' at ' + d + ' outside [' + h.start + ', ' + h.target + ']' });
        }
        if (day > p.startDay && doseOn(p, day - 1) - d > 1e-9) {
          v.push({ kind: 'dose_monotonic', day: day, detail: p.habitId + ' went backwards' });
        }
      }
    }
    return v;
  }

  /* ================= repair ================= */

  /**
   * An even ladder of start days. One pass, no search.
   *
   * Habits already begun are never moved: rescheduling one the user is three
   * weeks into is how a repair pass once broke a 100%-completion streak while
   * fixing something else entirely.
   */
  function respace(habits, protectBefore) {
    const ordered = habits.slice().sort((a, b) => a.startDay - b.startDay || a.habitId.localeCompare(b.habitId));
    const fixed = ordered.filter((p) => p.startDay <= protectBefore);
    const movable = ordered.filter((p) => p.startDay > protectBefore);
    const taken = fixed.map((p) => p.startDay);
    const out = fixed.slice();
    const unplaceable = [];

    /* The same test `validate` runs, over every window rather than only the one
       ending at `day`. Counting backwards alone is not the rule: slotting a
       habit into day 1 when days 2 and 7 are taken looks free from day 1 and
       quietly makes day 7 the third start in a week. */
    function fits(day) {
      const days = taken.concat([day]).sort((a, b) => a - b);
      return days.every((x) => days.filter((y) => y >= x - 6 && y <= x).length <= MAX_NEW_PER_WEEK);
    }
    function firstFree(lo) {
      for (let day = Math.max(lo, 1); day <= LAST_INTRO_DAY; day++) if (fits(day)) return day;
      return null;
    }

    movable.forEach((p) => {
      /* Prefer the day asked for, then the first legal day after it, and only
         then look *earlier*. Everything on day 900 clamps onto day 56, where
         searching forward finds nothing and dropping five habits takes the run
         under its own floor — moving one earlier is a far smaller sacrifice.
         Stacking them onto the last legal day satisfies the loop and ships the
         exact violation it was meant to remove. */
      let day = firstFree(Math.max(p.startDay, protectBefore + 1));
      if (day == null) day = firstFree(protectBefore + 1);
      if (day == null) { unplaceable.push(p.habitId); return; }
      taken.push(day);
      out.push(Object.assign({}, p, { startDay: day }));
    });

    out.sort((a, b) => a.startDay - b.startDay || a.habitId.localeCompare(b.habitId));
    return { placed: out, unplaceable: unplaceable };
  }

  /**
   * Make a run feasible, deterministically.
   *
   * `today` protects everything already underway — pass the user's current day
   * for a live run, 0 for a fresh one.
   *
   * The sacrifice differs per constraint, and that distinction is the whole
   * function. A phase-cap violation means too many *habits*, so the newest
   * goes. A budget violation means too many *minutes*, so the most expensive
   * goes. One heuristic for both made repair swap two zero-cost habits back and
   * forth forever while a 20-minute habit sat untouched.
   */
  function repair(run, today) {
    today = today || 0;
    const notes = [];
    let habits = [];
    const seen = {};

    (run.habits || []).forEach((p) => {
      if (!isKnown(p.habitId)) { notes.push('dropped unknown habit ' + p.habitId); return; }
      if (seen[p.habitId]) { notes.push('dropped duplicate ' + p.habitId); return; }
      seen[p.habitId] = true;
      const day = Math.min(Math.max(Math.round(p.startDay) || 1, 1), LAST_INTRO_DAY);
      if (day !== p.startDay) notes.push(p.habitId + ': start day ' + p.startDay + ' → ' + day);
      habits.push(Object.assign({}, p, { startDay: day }));
    });

    const before = {};
    habits.forEach((p) => { before[p.habitId] = p.startDay; });
    /* Respacing is the spacing rule's enforcement arm. A run the user asked to
       start on day one has opted out of that rule, so moving its habits apart
       would put back exactly what they opted out of. */
    const spaced = run.startTogether
      ? { placed: habits.slice(), unplaceable: [] }
      : respace(habits, today);
    habits = spaced.placed;
    const moved = habits.filter((p) => before[p.habitId] !== p.startDay).map((p) => p.habitId);
    if (moved.length) notes.push('respaced start days: ' + moved.sort().join(', '));
    spaced.unplaceable.forEach((id) => {
      notes.push('dropped ' + id + ': no legal start day left before day ' + LAST_INTRO_DAY);
    });

    let out = Object.assign({}, run, { habits: habits });

    /* Bounded: every pass either softens one habit by a quarter of its ramp or
       removes one, and the floor stops it before a run stops being a run. */
    for (let pass = 0; pass < habits.length * 8 + 8; pass++) {
      const vs = validate(out).filter((x) => x.kind === 'phase_cap' || x.kind === 'daily_budget');
      if (!vs.length) break;
      const v = vs[0];
      const day = v.day || 1;
      const live = activeOn(out, day);
      if (!live.length) break;
      const movable = live.filter((p) => p.startDay > today);

      if (v.kind === 'phase_cap') {
        if (!movable.length || out.habits.length <= MIN_HABITS) break;
        const victim = movable.slice().sort((a, b) =>
          a.startDay - b.startDay || habit(a.habitId).friction - habit(b.habitId).friction).pop();
        notes.push('dropped ' + victim.habitId + ' for the phase cap on day ' + day);
        out = Object.assign({}, out, { habits: out.habits.filter((p) => p !== victim) });
        continue;
      }

      /* Removing before flattening, and the order matters more than it looks.
         `scale` reduces the ramp across the whole run, so softening to fit one
         overshoot on day 60 leaves the user on their starting dose for all 66
         days — five habits that never move instead of four that do. The ramp is
         the product; flattening is what is left when there is nothing to
         remove, not the first thing to reach for. */
      const dearest = (list) => list.slice().sort((a, b) =>
        minutesOn(a, day) - minutesOn(b, day) || a.startDay - b.startDay).pop();

      if (out.habits.length > MIN_HABITS && movable.length) {
        const victim = dearest(movable);
        notes.push('dropped ' + victim.habitId + ' for the daily budget on day ' + day);
        out = Object.assign({}, out, { habits: out.habits.filter((p) => p !== victim) });
        continue;
      }

      /* `movable`, not `live`: every other branch protects what the user is
         already running, and this one silently did not. */
      if (!movable.length) break;
      const victim = dearest(movable);
      const scale = victim.scale == null ? 1 : victim.scale;
      if (scale > 1e-9) {
        const eased = Object.assign({}, victim, { scale: Math.max(0, scale - 0.25) });
        notes.push('flattened ' + victim.habitId + "'s ramp to " + eased.scale.toFixed(2) +
                   ' for the budget on day ' + day + ' (at the ' + MIN_HABITS + '-habit floor)');
        out = Object.assign({}, out, { habits: out.habits.map((p) => (p === victim ? eased : p)) });
        continue;
      }

      /* Flat at its starting dose and still over. Feasibility outranks the
         habit floor — an impossible day is the one thing the user cannot work
         around. */
      notes.push('dropped ' + victim.habitId + ' below the ' + MIN_HABITS +
                 '-habit floor: day ' + day + ' is not doable in ' + run.minutesBudget + ' min otherwise');
      out = Object.assign({}, out, { habits: out.habits.filter((p) => p !== victim) });
    }

    return { run: out, notes: notes };
  }

  /* ================= building a run ================= */

  /**
   * A starting run, without a model.
   *
   * The Python version asks a large model to choose from the catalog and then
   * repairs whatever comes back. This app cannot make that call, so what ships
   * is the fallback that path already had: deliberately dull, low-friction, and
   * reliable. A working programme beats a spinner, and this is the only option
   * an offline app has.
   */
  /* All still in the catalog, all low friction, and spread across the three
     domains. Rebuilt when the ten duplicating habits went: three of the old six
     were `water`, `read` and `pushups`, which is what happens to a default list
     nobody re-derives after the thing it indexes into changes. */
  const DEFAULT_PICKS = ['walk', 'stretch', 'journal', 'brush_teeth', 'vitamins', 'floss'];

  function buildRun(startDate, minutesBudget, picks, together) {
    const budget = minutesBudget || 45;
    const draft = (list) => ({
      startDate: startDate,
      minutesBudget: budget,
      startTogether: !!together,
      habits: list.map((id, i) => ({
        habitId: id, startDay: together ? 1 : 1 + i * 7, scale: 1, frozenDay: null
      })),
      log: {}
    });
    const toFloor = (list) => {
      const out = list.slice();
      DEFAULT_PICKS.forEach((id) => {
        if (out.length < MIN_HABITS && out.indexOf(id) < 0) out.push(id);
      });
      return out.slice(0, MAX_HABITS);
    };

    /* `repair` strips a programme below the habit floor rather than ship a day
       the user physically cannot do — feasibility outranks the floor — so a
       heavy selection against a small budget comes back as two habits and then
       fails `min_habits`. Five heavy picks at 30 minutes did exactly that.
       The Python original reads a sub-floor result as the signal to substitute
       its dull fallback; here the survivors are kept and the floor is topped up
       around them, so the user keeps whatever of their choice actually fits. */
    let chosen = (picks && picks.length ? picks : DEFAULT_PICKS).filter(isKnown);
    let out = null;
    for (let pass = 0; pass < 3; pass++) {
      out = repair(draft(toFloor(chosen)), 0).run;
      if (out.habits.length >= MIN_HABITS) return openOnDayOne(out);
      const survivors = out.habits.map((p) => p.habitId);
      /* Nothing new to try: the same survivors would be topped up the same way
         and repaired to the same place. Fall through to the floor below. */
      if (survivors.join(',') === chosen.join(',')) break;
      chosen = survivors;
    }

    /* The last resort, and it always fits. The three cheapest habits in the
       catalog cost under four weighted minutes between them at their targets,
       so there is no budget a user can choose that cannot hold them. Returning
       a run that fails `validate` is the one thing this function may not do:
       every screen downstream assumes a run is feasible. */
    const cheapest = HABITS.slice()
      .sort((a, b) => topCost(a) - topCost(b) || a.friction - b.friction)
      .slice(0, MIN_HABITS)
      .map((h) => h.id);
    const floor = repair(draft(cheapest), 0).run;
    return openOnDayOne(floor.habits.length >= MIN_HABITS ? floor : out);
  }

  /**
   * Pull a fresh run back so that day one asks for something.
   *
   * The draft lays habits out on days 1, 8, 15… and `repair` may drop whichever
   * one was on day 1 — the default six against a 45-minute budget lost `walk`
   * and `read`, leaving a 66-day run whose first habit arrived on day 8. Press
   * Start and the app says "nothing has started yet" for a week, which reads
   * exactly like the button did not work.
   *
   * The shift is uniform, so every gap between starts is unchanged and the
   * rolling-window rule cannot break. It can only pull habits *earlier*, which
   * a phase cap might refuse, so the result is validated and kept only if it is
   * clean. Fresh runs only: `startDay` is what `repair` protects on a live one,
   * and moving those would reschedule habits somebody is already running.
   */
  function openOnDayOne(run) {
    if (run.startTogether) return run;
    const starts = (run.habits || []).map((p) => p.startDay);
    if (!starts.length) return run;
    const first = Math.min.apply(null, starts);
    if (first <= 1) return run;

    /* Pull the whole run back if that is legal: every habit keeps its place in
       the queue and the run simply begins when the user pressed the button. */
    const shifted = Object.assign({}, run, {
      habits: run.habits.map((p) => Object.assign({}, p, { startDay: p.startDay - (first - 1) }))
    });
    if (!validate(shifted).length) return shifted;

    /* It is not always legal. Pulling everything earlier makes every habit
       reach a higher dose sooner, so at a tight budget the late days overflow —
       eight habits against 30 minutes did. Failing that, move one habit to day
       one and leave the queue alone. The cheapest is chosen because it is the
       one most likely to fit: an anchor costs half a weighted minute, so it can
       be added to the opening week of almost any run. */
    const byCost = run.habits.slice().sort((a, b) => {
      const ha = habit(a.habitId), hb = habit(b.habitId);
      return (ha ? topCost(ha) : 0) - (hb ? topCost(hb) : 0);
    });
    for (const p of byCost) {
      const moved = Object.assign({}, run, {
        habits: run.habits.map((q) => (q === p ? Object.assign({}, q, { startDay: 1 }) : q))
      });
      if (!validate(moved).length) return moved;
    }
    return run;
  }

  /* ================= patching a live run ================= */

  const MAX_PATCH_HABITS = 2;
  const RESUME_SCALE_STEP = 0.25;

  /**
   * A finite number, or null if whatever produced this op did not give one.
   *
   * In Python these arrived from a language model and `float()` crashed on
   * every one of `"half"`, `null` and a list. Here they arrive from stored
   * state and from the UI, which is a different threat and the same guard: a
   * `NaN` scale passed every check, left the ramp dead for the whole run on a
   * run `validate` called healthy, and made the state unserialisable.
   */
  function num(value) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return typeof n === 'number' && isFinite(n) ? n : null;
  }

  /**
   * The only sanctioned way to change a run that is already going.
   *
   * Five operations and no rewrite. Four of them are sacrifices; `resume` is
   * the way back, and the only one that gives anything.
   */
  function applyPatch(run, ops, today) {
    const notes = [];
    const touched = {};
    const byId = {};
    (run.habits || []).forEach((p) => { byId[p.habitId] = p; });
    const preResume = {};

    (ops || []).forEach((op) => {
      const name = op && op.op;
      const id = op && op.habitId;
      if (!id || !byId[id]) { notes.push('ignored ' + name + ' on unknown/absent ' + id); return; }
      if (!touched[id] && Object.keys(touched).length >= MAX_PATCH_HABITS) {
        notes.push('ignored ' + name + ' on ' + id + ': the patch already touches ' + MAX_PATCH_HABITS);
        return;
      }
      const p = byId[id];

      if (name === 'soften') {
        // "soften walk" is clear even when "by how much" is garbled, so an
        // unreadable factor falls back to the default rather than dropping the
        // op — dropping it leaves a slipping user with no intervention at all.
        let factor = num(op.factor == null ? 0.5 : op.factor);
        if (factor == null) { notes.push(id + ': unreadable soften factor, used 0.5'); factor = 0.5; }
        factor = Math.min(Math.max(factor, 0), 1);
        byId[id] = Object.assign({}, p, { scale: (p.scale == null ? 1 : p.scale) * factor });
        notes.push('softened ' + id + ' to ' + byId[id].scale.toFixed(2) + ' of its ramp');
      } else if (name === 'freeze') {
        if (p.frozenDay == null || today < p.frozenDay) byId[id] = Object.assign({}, p, { frozenDay: today });
        notes.push('froze ' + id + ' at day ' + byId[id].frozenDay);
      } else if (name === 'defer') {
        if (p.startDay <= today) { notes.push('ignored defer on ' + id + ': already underway'); return; }
        let by = num(op.days == null ? 7 : op.days);
        if (by == null) { notes.push(id + ': unreadable defer days, used 7'); by = 7; }
        byId[id] = Object.assign({}, p, { startDay: Math.min(p.startDay + Math.max(Math.round(by), 1), LAST_INTRO_DAY) });
        notes.push('deferred ' + id + ' to day ' + byId[id].startDay);
      } else if (name === 'resume') {
        /* One notch per call, never a snap back to full: clearing `frozenDay`
           outright takes a habit frozen at 20 minutes on day 20 and resumed on
           day 40 straight to 35, which is how you break the run you were
           rewarding. The freeze is unwound before the scale because a week of
           ramp is the smaller, more predictable gift. */
        if (p.frozenDay != null) {
          const next = p.frozenDay + 7;
          preResume[id] = p;
          byId[id] = Object.assign({}, p, { frozenDay: next > RUN_DAYS ? null : next });
          notes.push('resumed ' + id + "'s ramp for another week");
        } else if ((p.scale == null ? 1 : p.scale) < 1) {
          preResume[id] = p;
          byId[id] = Object.assign({}, p, { scale: Math.min(1, (p.scale == null ? 1 : p.scale) + RESUME_SCALE_STEP) });
          notes.push('gave ' + id + ' back some ramp: scale ' + byId[id].scale.toFixed(2));
        } else {
          notes.push('ignored resume on ' + id + ': already at full pace');
          return;
        }
      } else if (name === 'drop') {
        if (Object.keys(byId).length <= MIN_HABITS) {
          notes.push('ignored drop on ' + id + ': at the ' + MIN_HABITS + '-habit floor');
          return;
        }
        delete byId[id];
        notes.push('dropped ' + id);
      } else {
        notes.push('ignored unknown op ' + name);
        return;
      }
      touched[id] = true;
    });

    const rebuild = (map) => Object.assign({}, run, { habits: Object.keys(map).map((k) => map[k]) });
    let fixed = repair(rebuild(byId), today);

    /* `resume` is the only op that ADDS load, and `repair` cannot take it back:
       every sacrifice branch protects `startDay > today`, so a resume on a habit
       already underway can put day 64 over budget with nothing allowed to pay
       for it — a shipped day the user physically cannot do. Reverting is the
       only correction available, and it is taken only when it actually helps: a
       run that arrived infeasible is not resume's fault. */
    if (Object.keys(preResume).length && validate(fixed.run).length) {
      Object.keys(preResume).forEach((id) => { if (byId[id]) byId[id] = preResume[id]; });
      const retry = repair(rebuild(byId), today);
      if (!validate(retry.run).length) {
        notes.push('took back the resume on ' + Object.keys(preResume).sort().join(', ') +
                   ': it put a later day over the budget, and nothing may reschedule a habit already underway to pay for it');
        return { run: retry.run, notes: notes.concat(retry.notes) };
      }
    }

    return { run: fixed.run, notes: notes.concat(fixed.notes) };
  }

  /* ================= diagnosis ================= */

  const TRAILING_DAYS = 14;
  const INTERVENTION_RATE = 0.6;
  const INTERVENTION_MISSES = 3;
  const PROTECTED_RATE = 0.7;

  /**
   * Per-habit completion, consecutive misses, and whether to step in.
   *
   * Which days counted is read from the record, never re-derived. This once
   * asked `day >= startDay` — the habit's *current* start day — so deferring a
   * habit on day 30 retroactively decided days 20 to 29 had never asked for it,
   * and moved a completion rate for a fortnight the user had already lived.
   */
  function diagnose(run, today) {
    const log = run.log || {};
    const per = {};
    const from = Math.max(1, today - TRAILING_DAYS);

    (run.habits || []).forEach((p) => {
      const asked = [];
      for (let d = from; d < today; d++) if (log[d] && log[d][p.habitId]) asked.push(d);
      const done = asked.filter((d) => log[d][p.habitId].done);
      let missed = 0;
      for (const d of asked.slice().sort((a, b) => b - a)) {
        if (log[d][p.habitId].done) break;
        missed++;
      }
      per[p.habitId] = {
        asked: asked.length,
        done: done.length,
        rate: asked.length ? done.length / asked.length : 1,
        missedStreak: missed
      };
    });

    const scored = Object.keys(per).map((k) => per[k]).filter((s) => s.asked);
    const overall = scored.length ? scored.reduce((n, s) => n + s.rate, 0) / scored.length : 1;
    const needs = overall < INTERVENTION_RATE ||
      Object.keys(per).some((k) => per[k].missedStreak >= INTERVENTION_MISSES);
    return { perHabit: per, overallRate: overall, needsIntervention: needs };
  }

  /**
   * No model to ask, so the sacrifice is chosen in code: soften whatever the
   * user is keeping least. Doing nothing is also a decision, and the wrong one
   * when somebody is already slipping.
   */
  function adapt(run, diagnosis, today) {
    let worst = null;
    (run.habits || []).forEach((p) => {
      const stat = diagnosis.perHabit[p.habitId] || { rate: 1, asked: 0 };
      if (stat.asked && stat.rate >= PROTECTED_RATE) return;   // not the problem
      if (!worst || stat.rate < (diagnosis.perHabit[worst.habitId] || { rate: 1 }).rate) worst = p;
    });
    if (!worst) return { run: run, notes: ['nothing to ease: everything is being kept'] };
    return applyPatch(run, [{ op: 'soften', habitId: worst.habitId, factor: 0.5 }], today);
  }

  /* ================= recommendations ================= */

  const ADD_READY_RATE = 0.8;
  const ADVANCE_READY_RATE = 0.9;
  const MIN_EVIDENCE_DAYS = 7;
  const MAX_RECOMMENDATIONS = 3;
  const START_ATTEMPTS = 4;

  const isEased = (p) => p.frozenDay != null || (p.scale == null ? 1 : p.scale) < 1;

  function withAdded(run, habitId, startDay) {
    return Object.assign({}, run, {
      habits: (run.habits || []).concat([{ habitId: habitId, startDay: startDay, scale: 1, frozenDay: null }])
    });
  }

  function legalStartDays(run, today) {
    const taken = (run.habits || []).map((p) => p.startDay);
    const out = [];
    for (let day = Math.max(today + 1, 1); day <= LAST_INTRO_DAY; day++) {
      if (run.startTogether) { out.push(day); continue; }
      const days = taken.concat([day]).sort((a, b) => a - b);
      if (days.every((x) => days.filter((y) => y >= x - 6 && y <= x).length <= MAX_NEW_PER_WEEK)) out.push(day);
    }
    return out;
  }

  function domainCounts(run) {
    const counts = { fitness: 0, self_care: 0, development: 0 };
    (run.habits || []).forEach((p) => {
      const h = habit(p.habitId);
      if (h) counts[h.domain]++;
    });
    return counts;
  }

  /**
   * The run one `resume` later, or null if that resume is not safe.
   *
   * Three things have to hold, and the lower bound on the last one is the easy
   * one to leave out: `scale` multiplies the week count before rounding, so
   * 0.5 → 0.75 can land on the same step. Water softened at day 24 and resumed
   * at day 38 came back as "4 → 4 glasses" — a button that validated, kept
   * every invariant, ran 369 times across 2,000 synthetic users, and did
   * nothing the user could see. An invisible recommendation is worse than none,
   * because it spends the trust that makes the next one work.
   */
  function resumed(run, habitId, today) {
    const after = applyPatch(run, [{ op: 'resume', habitId: habitId }], today);
    if (validate(after.run).length) return null;

    const beforeIds = (run.habits || []).map((p) => p.habitId).sort().join(',');
    const afterIds = (after.run.habits || []).map((p) => p.habitId).sort().join(',');
    if (beforeIds !== afterIds) return null;                    // it cost another habit

    const was = (run.habits || []).find((p) => p.habitId === habitId);
    const now = (after.run.habits || []).find((p) => p.habitId === habitId);
    if (!was || !now || JSON.stringify(was) === JSON.stringify(now)) return null;
    if ((run.habits || []).some((p) => {
      const q = (after.run.habits || []).find((x) => x.habitId === p.habitId);
      return p.habitId !== habitId && JSON.stringify(p) !== JSON.stringify(q);
    })) return null;

    const next = Math.min(today + 1, RUN_DAYS);
    const gain = doseOn(now, next) - doseOn(was, next);
    if (gain <= 1e-9 || gain > habit(habitId).step + 1e-9) return null;
    return after.run;
  }

  /**
   * Everything worth offering today, best first.
   *
   * `advance` outranks `add` and always will: giving back something already
   * earned costs the user nothing and reads as the app noticing, while a new
   * habit costs a slot, some budget and some attention.
   *
   * Nothing is returned until the run it would produce has been walked across
   * all 66 days with zero violations, and the suggestions are mutually
   * compatible — placing each independently offered three habits all "from day
   * 31", which is two offers the spacing rule cannot honour.
   */
  function recommend(run, today, limit) {
    limit = limit || MAX_RECOMMENDATIONS;
    if (validate(run).length) return [];        // repair's problem, not this one
    const diagnosis = diagnose(run, today);
    const out = [];
    let working = run;

    (run.habits || []).forEach((p) => {
      if (out.length >= limit || !isEased(p)) return;
      const stat = diagnosis.perHabit[p.habitId] || {};
      if ((stat.asked || 0) < MIN_EVIDENCE_DAYS || (stat.rate || 0) < ADVANCE_READY_RATE) return;
      const after = resumed(working, p.habitId, today);
      if (!after) return;
      const next = Math.min(today + 1, RUN_DAYS);
      const h = habit(p.habitId);
      out.push({
        kind: 'advance',
        habitId: p.habitId,
        headline: h.name,
        detail: doseOn(working.habits.find((x) => x.habitId === p.habitId), next) + ' → ' +
                doseOn(after.habits.find((x) => x.habitId === p.habitId), next) + ' ' + h.unit,
        reasons: ['kept ' + stat.done + ' of the last ' + stat.asked + ' it asked for',
                  'eased back earlier; this gives one week of that ramp back']
      });
      working = after;
    });

    /* Never hand more work to somebody already missing days. It is the same
       signal `adapt` acts on, the two must never fire together, and it is
       exactly what an engagement metric would ask for. */
    if (diagnosis.needsIntervention || diagnosis.overallRate < ADD_READY_RATE) return out.slice(0, limit);
    if (!Object.keys(diagnosis.perHabit).some((k) => diagnosis.perHabit[k].asked >= MIN_EVIDENCE_DAYS)) {
      return out.slice(0, limit);
    }

    while (out.length < limit) {
      const legal = legalStartDays(working, today);
      if (!legal.length) break;
      const counts = domainCounts(working);
      const have = {};
      (working.habits || []).forEach((p) => { have[p.habitId] = true; });

      /* Thinnest domain first — five fitness habits and nothing else reads as a
         training plan rather than a life — then lowest friction, because a
         friction-5 habit dropped on a working run is how a good one ends. */
      const candidates = HABITS.filter((h) => !have[h.id]).sort((a, b) =>
        counts[a.domain] - counts[b.domain] || a.friction - b.friction ||
        (a.start * a.min) - (b.start * b.min) || a.id.localeCompare(b.id));

      let chosen = null;
      for (const h of candidates) {
        for (const day of legal.slice(0, START_ATTEMPTS)) {
          if (!validate(withAdded(working, h.id, day)).length) { chosen = { h: h, day: day }; break; }
        }
        if (chosen) break;
      }
      if (!chosen) break;

      const ph = phaseFor(chosen.day);
      const free = working.minutesBudget - dayMinutes(working, chosen.day);
      const domain = chosen.h.domain.replace('_', ' ');
      out.push({
        kind: 'add',
        habitId: chosen.h.id,
        headline: chosen.h.name,
        detail: chosen.h.start + ' → ' + chosen.h.target + ' ' + chosen.h.unit + ', from day ' + chosen.day,
        startDay: chosen.day,
        reasons: [
          counts[chosen.h.domain] === 0 ? 'nothing in ' + domain + ' yet'
            : counts[chosen.h.domain] + ' in ' + domain + ', the least of the three',
          ph.name + ' allows ' + ph.max + '; day ' + chosen.day + ' runs ' + activeOn(working, chosen.day).length,
          Math.round(free) + ' of your ' + working.minutesBudget + ' min is free that day',
          'you have kept ' + Math.round(diagnosis.overallRate * 100) + '% of the last two weeks'
        ]
      });
      working = withAdded(working, chosen.h.id, chosen.day);
    }

    return out.slice(0, limit);
  }

  /**
   * Take one up. Refuses rather than repairs.
   *
   * Re-checked here rather than trusted: the run may have been patched, or the
   * day moved, between a recommendation being made and being tapped. Running
   * `repair` to force it through would be the app quietly charging the user for
   * its own stale advice.
   */
  function applyRecommendation(run, rec, today) {
    if (rec.kind === 'add') {
      if (rec.startDay == null) return { run: run, notes: ['declined ' + rec.habitId + ': no start day'] };
      const after = withAdded(run, rec.habitId, rec.startDay);
      const problems = validate(after);
      if (problems.length) return { run: run, notes: ['declined ' + rec.habitId + ': ' + problems[0].kind] };
      return { run: after, notes: ['added ' + rec.habitId + ' from day ' + rec.startDay] };
    }
    const after = resumed(run, rec.habitId, today);
    if (!after) return { run: run, notes: ['declined resume on ' + rec.habitId + ': no longer safe'] };
    return { run: after, notes: ['resumed ' + rec.habitId] };
  }

  /**
   * Diagnose, then do exactly one of: step in, or offer more. Never both.
   *
   * Not the same rule as the `add` gate inside `recommend`. Only `add` is gated
   * on `needsIntervention`; `advance` is gated on a *per-habit* rate, so a user
   * holding one habit at 100% while the rest collapse qualifies for both at
   * once. `recommend` alone offers it; this is what does not.
   *
   * Outside the run there is nothing to decide — adapting a finished run
   * softens one the user has already completed.
   */
  function checkIn(run, today) {
    if (!(today >= 1 && today <= RUN_DAYS)) {
      return { run: run, patched: false, notes: [], recommendations: [],
               diagnosis: { perHabit: {}, overallRate: 1, needsIntervention: false } };
    }
    const diagnosis = diagnose(run, today);
    if (diagnosis.needsIntervention) {
      const patched = adapt(run, diagnosis, today);
      return { run: patched.run, patched: true, notes: patched.notes, recommendations: [], diagnosis: diagnosis };
    }
    return { run: run, patched: false, notes: [], recommendations: recommend(run, today), diagnosis: diagnosis };
  }

  Object.assign(R, {
    HABITS, PHASES, RUN_DAYS, LAST_INTRO_DAY, MAX_NEW_PER_WEEK, MIN_HABITS, MAX_HABITS,
    MAX_PATCH_HABITS, TRAILING_DAYS, INTERVENTION_RATE, INTERVENTION_MISSES, PROTECTED_RATE,
    ADD_READY_RATE, ADVANCE_READY_RATE, MIN_EVIDENCE_DAYS,
    DEFAULT_PICKS, habit, isKnown, isItemHabit, itemsFor, toggleItem, phaseFor, doseOn, minutesOn, activeOn, dayMinutes, dayIndex,
    where, runDay, recordDay, fractionOf, dayMark, journey, validate, repair, buildRun,
    applyPatch, diagnose, adapt, recommend, applyRecommendation, checkIn
  });

  A.Run = R;
})(window);
