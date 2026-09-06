/* Discipline — seed data, constants and pure helpers.
   Loaded as a classic script; everything hangs off window.Arise. */
(function (root) {
  'use strict';

  const Arise = (root.Arise = root.Arise || {});

  /* ---------- dates ---------- */

  const DAY_MS = 86400000;
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /** Local-time YYYY-MM-DD. Never use toISOString(): it shifts to UTC. */
  function key(date) {
    const d = date || new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function fromKey(k) {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /** The day the user is *living in* right now.
      Habits finished at 01:00 belong to the night before, so the calendar day
      only rolls over at `boundaryHour` (default 04:00). This is the grace window. */
  function todayKey(boundaryHour) {
    const h = boundaryHour == null ? 4 : boundaryHour;
    return key(new Date(Date.now() - h * 3600000));
  }

  /** Minutes remaining in the logical day — used to warn before the boundary. */
  function minutesLeftToday(boundaryHour) {
    const h = boundaryHour == null ? 4 : boundaryHour;
    const now = new Date();
    const end = fromKey(addDays(todayKey(h), 1));
    end.setHours(h, 0, 0, 0);
    return Math.max(0, Math.round((end - now) / 60000));
  }

  function addDays(k, n) {
    const d = fromKey(k);
    d.setDate(d.getDate() + n);
    return key(d);
  }

  function weekday(k) {
    return fromKey(k).getDay();
  }

  function daysBetween(a, b) {
    return Math.round((fromKey(b) - fromKey(a)) / DAY_MS);
  }

  function prettyDate(k) {
    const d = fromKey(k);
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }

  /** Monday-first start of the ISO week containing k. */
  function weekStart(k) {
    const wd = weekday(k);
    return addDays(k, wd === 0 ? -6 : 1 - wd);
  }

  /* ---------- ids ---------- */

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  /* ---------- exercise library ---------- */

  // unit: 'reps' (sets x reps), 'time' (minutes), 'distance' (km)
  const SEED_EXERCISES = [
    { name: 'Push-ups', category: 'Strength', unit: 'reps', sets: 3, reps: 15, icon: '💪', muscles: ['chest','front_delts','triceps','abs'] },
    { name: 'Pull-ups', category: 'Strength', unit: 'reps', sets: 3, reps: 8, icon: '🧗', muscles: ['lats','biceps','forearms'] },
    { name: 'Squats', category: 'Strength', unit: 'reps', sets: 4, reps: 20, icon: '🦵', muscles: ['quads','glutes'] },
    { name: 'Lunges', category: 'Strength', unit: 'reps', sets: 3, reps: 12, icon: '🚶', muscles: ['quads','glutes','hamstrings'] },
    { name: 'Deadlift', category: 'Strength', unit: 'reps', sets: 4, reps: 6, icon: '🏋️', muscles: ['lower_back','hamstrings','glutes','traps','forearms'] },
    { name: 'Bench Press', category: 'Strength', unit: 'reps', sets: 4, reps: 8, icon: '🏋️', muscles: ['chest','front_delts','triceps'] },
    { name: 'Shoulder Press', category: 'Strength', unit: 'reps', sets: 3, reps: 10, icon: '🏋️', muscles: ['front_delts','side_delts','triceps'] },
    { name: 'Bicep Curls', category: 'Strength', unit: 'reps', sets: 3, reps: 12, icon: '💪', muscles: ['biceps','forearms'] },
    { name: 'Plank', category: 'Core', unit: 'time', minutes: 2, icon: '🧘', muscles: ['abs','front_delts'] },
    { name: 'Crunches', category: 'Core', unit: 'reps', sets: 3, reps: 25, icon: '🔥', muscles: ['abs'] },
    { name: 'Leg Raises', category: 'Core', unit: 'reps', sets: 3, reps: 15, icon: '🔥', muscles: ['abs'] },
    { name: 'Russian Twists', category: 'Core', unit: 'reps', sets: 3, reps: 30, icon: '🌀', muscles: ['obliques','abs'] },
    { name: 'Running', category: 'Cardio', unit: 'distance', km: 3, icon: '🏃', muscles: ['quads','calves','cardio'] },
    { name: 'Cycling', category: 'Cardio', unit: 'distance', km: 10, icon: '🚴', muscles: ['quads','calves','cardio'] },
    { name: 'Jump Rope', category: 'Cardio', unit: 'time', minutes: 10, icon: '🪢', muscles: ['calves','cardio'] },
    { name: 'Burpees', category: 'Cardio', unit: 'reps', sets: 3, reps: 12, icon: '⚡', muscles: ['full','cardio'] },
    { name: 'Swimming', category: 'Cardio', unit: 'time', minutes: 30, icon: '🏊', muscles: ['lats','rear_delts','cardio'] },
    /* Court sports. The built-in programme is dumbbells-only and fills the week,
       so these exist to be dropped into a day by hand — a session you play is
       not a session a programme can prescribe the sets and reps of. */
    { name: 'Basketball', category: 'Cardio', unit: 'time', minutes: 60, icon: '🏀', muscles: ['quads','calves','glutes','cardio'] },
    { name: 'Volleyball', category: 'Cardio', unit: 'time', minutes: 60, icon: '🏐', muscles: ['quads','calves','front_delts','cardio'] },
    { name: 'Walking', category: 'Cardio', unit: 'time', minutes: 30, icon: '🚶', muscles: ['calves','cardio'] },
    { name: 'Yoga Flow', category: 'Mobility', unit: 'time', minutes: 20, icon: '🧘', muscles: ['full'] },
    { name: 'Stretching', category: 'Mobility', unit: 'time', minutes: 10, icon: '🤸', muscles: ['full'] },
    { name: 'Foam Rolling', category: 'Mobility', unit: 'time', minutes: 10, icon: '🎯', muscles: ['full'] }
  ];

  const CATEGORIES = ['Warm-up', 'Strength', 'Core', 'Cardio', 'Mobility', 'Stretch', 'Other'];

  /* What an exercise works, as opposed to what kind of thing it is. `category`
     answers "is this strength or cardio"; this answers "did I train legs twice
     this week", which is the question a training plan is actually built around.

     A list, not a single value, because one is a lie: a deadlift is back and
     legs, a bench press is chest and triceps and front delts. Anything that
     counts these has to accept that the totals overlap — see the muscle
     breakdown in Stats, which bars against the busiest group rather than
     against a sum that would be meaningless. */
  const MUSCLES = [
    { id: 'upper_chest', name: 'Upper chest', group: 'Chest' },
    { id: 'chest', name: 'Chest', group: 'Chest' },
    { id: 'lats', name: 'Lats', group: 'Back' },
    { id: 'traps', name: 'Traps', group: 'Back' },
    { id: 'lower_back', name: 'Lower back', group: 'Back' },
    { id: 'front_delts', name: 'Front delts', group: 'Shoulders' },
    { id: 'side_delts', name: 'Side delts', group: 'Shoulders' },
    { id: 'rear_delts', name: 'Rear delts', group: 'Shoulders' },
    { id: 'biceps', name: 'Biceps', group: 'Arms' },
    { id: 'triceps', name: 'Triceps', group: 'Arms' },
    { id: 'forearms', name: 'Forearms', group: 'Arms' },
    { id: 'quads', name: 'Quads', group: 'Legs' },
    { id: 'hamstrings', name: 'Hamstrings', group: 'Legs' },
    { id: 'glutes', name: 'Glutes', group: 'Legs' },
    { id: 'calves', name: 'Calves', group: 'Legs' },
    /* Added in 2026-08 with the SITE programme, which trains adductors directly
       (Copenhagen plank) and had nowhere honest to record it — tagging that as
       obliques would have put work in the breakdown where it was not done.
       Purely additive: `cleanMuscles` accepts a new id, nothing stored changes,
       and no migration is needed. It is the twentieth group, not a re-split of
       the nineteen v6 made. */
    { id: 'adductors', name: 'Adductors', group: 'Legs' },
    { id: 'abs', name: 'Abs', group: 'Core' },
    { id: 'obliques', name: 'Obliques', group: 'Core' },
    { id: 'full', name: 'Full body', group: 'Other' },
    { id: 'cardio', name: 'Cardio', group: 'Other' }
  ];

  /* v5 shipped nine coarse groups for a few hours before this replaced them.
     Anything stored against the old ids is widened to the new ones rather than
     dropped — `back` becomes lats, `arms` becomes biceps AND triceps — which
     over-credits slightly but never loses a tag. An exercise whose name is still
     in the catalog is re-derived from it instead, because the catalog's list is
     the more precise answer and nobody had time to disagree with it. */
  const MUSCLE_UPGRADE = {
    chest: ['chest'],
    back: ['lats', 'traps'],
    shoulders: ['front_delts', 'side_delts'],
    arms: ['biceps', 'triceps'],
    legs: ['quads', 'hamstrings'],
    glutes: ['glutes'],
    core: ['abs'],
    full: ['full'],
    cardio: ['cardio']
  };

  const MUSCLE_NAME = {};
  MUSCLES.forEach((m) => { MUSCLE_NAME[m.id] = m.name; });

  /** Only ids the catalog knows, de-duplicated, order preserved. */
  function cleanMuscles(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((x) => String(x == null ? '' : x).trim().toLowerCase())
      .filter((x, i, all) => MUSCLE_NAME[x] && all.indexOf(x) === i);
  }

  /* ---------- clock values ---------- */

  /** Human clock, respecting the device's 12/24-hour preference. */
  function prettyTime(v) {
    const n = ((Math.round(v) % 1440) + 1440) % 1440;
    const d = new Date(2000, 0, 1, Math.floor(n / 60), n % 60);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  /* ---------- what a set is ----------

     The one record this app is built to keep. A plan item says what was ASKED
     ("3 x 15"); an entry in `log.perf` says what was DONE, and the two are
     separate objects on purpose — the same rule the rest of the record already
     runs on. Editing the plan tomorrow must never rewrite what a set weighed
     last Tuesday.

     A set stores the number the user typed AND the unit it was typed in:

         { w: 60, u: 'kg', r: 8 }

     Storing kilos and converting on the way in would be tidier by one field and
     wrong by rounding: 60 kg becomes 132.3 lb becomes 60.01 kg, and a set the
     user entered as a round number stops reading as one. Carrying the unit also
     means switching the display unit is a display change and nothing else — no
     stored day is re-judged, which is the invariant that governs everything
     else in here.

     `w` is null for a bodyweight set. That is a real answer, not a missing one:
     a pull-up set is 8 reps and no load, and writing 0 would put it into the
     volume total as if it were a zero-kilo barbell. */

  const WEIGHT_UNITS = {
    kg: { id: 'kg', label: 'Kilograms', short: 'kg', perKg: 1 },
    lb: { id: 'lb', label: 'Pounds', short: 'lb', perKg: 2.2046226218 }
  };

  const round1 = (n) => Math.round(Number(n) * 10) / 10;

  /** A weight in `from` units, expressed in `to` units. */
  function convertWeight(w, from, to) {
    if (w == null || !isFinite(w)) return null;
    const a = WEIGHT_UNITS[from] || WEIGHT_UNITS.kg;
    const b = WEIGHT_UNITS[to] || WEIGHT_UNITS.kg;
    if (a.id === b.id) return Number(w);
    return (Number(w) / a.perKg) * b.perKg;
  }

  /** '60 kg', or 'bodyweight' — never '0 kg', which would be a different claim. */
  function fmtWeight(w, unit) {
    if (w == null || !isFinite(w)) return 'bodyweight';
    const u = (WEIGHT_UNITS[unit] || WEIGHT_UNITS.kg).short;
    return round1(w) + ' ' + u;
  }

  /** One set, as it reads on a row: '60 kg x 8', or '8 reps' with no load. */
  function fmtLoad(set, unit) {
    if (!set) return '';
    const reps = Math.max(0, Math.round(Number(set.r) || 0));
    if (set.w == null || !isFinite(set.w)) return reps + ' reps';
    const shown = convertWeight(set.w, set.u || 'kg', unit || set.u || 'kg');
    return fmtWeight(shown, unit || set.u || 'kg') + ' × ' + reps;
  }

  /** Load x reps, in `unit`. A bodyweight set contributes nothing — see above. */
  function setVolume(set, unit) {
    if (!set || set.w == null || !isFinite(set.w)) return 0;
    const w = convertWeight(set.w, set.u || 'kg', unit || 'kg');
    return w * Math.max(0, Math.round(Number(set.r) || 0));
  }

  /** Everything lifted in one exercise entry, in `unit`. */
  function entryVolume(perf, unit) {
    if (!perf || !Array.isArray(perf.sets)) return 0;
    return perf.sets.reduce((sum, s) => sum + setVolume(s, unit), 0);
  }

  /** Did anything actually get recorded here? */
  function isLogged(perf) {
    if (!perf) return false;
    if (Array.isArray(perf.sets) && perf.sets.length) return true;
    return (perf.min != null && perf.min > 0) || (perf.km != null && perf.km > 0);
  }

  /**
   * How an exercise is logged, which is a property of the exercise and not of
   * the plan item — a plan item may change its sets and reps, never its shape.
   *
   *   'reps'      set rows of weight x reps
   *   'time'      minutes
   *   'distance'  kilometres, and minutes if you want them
   */
  const logShape = (ex) => {
    const u = ex && ex.unit;
    return u === 'time' || u === 'distance' ? u : 'reps';
  };

  /** What the plan ASKED for on this row. Never read from a log. */
  function targetPhrase(item, ex) {
    const shape = logShape(ex);
    if (shape === 'time') {
      const m = item && item.minutes != null ? item.minutes : ex && ex.minutes;
      return m ? Math.round(m) + ' min' : 'as long as it takes';
    }
    if (shape === 'distance') {
      const km = item && item.km != null ? item.km : ex && ex.km;
      return km ? round1(km) + ' km' : 'any distance';
    }
    const sets = (item && item.sets) || (ex && ex.sets) || 0;
    const reps = (item && item.reps) || (ex && ex.reps) || 0;
    const max = item && item.repsMax != null ? item.repsMax : ex && ex.repsMax;
    const rangeText = max && max > reps ? reps + '–' + max : String(reps);
    if (!sets || !reps) return 'as prescribed';
    return sets + ' × ' + rangeText;
  }

  /** What was DONE, in one line. Empty string when nothing was recorded. */
  function describeEntry(perf, ex, unit) {
    if (!isLogged(perf)) return '';
    /* Read the ENTRY, not the exercise. An exercise that used to be measured in
       reps and is measured in minutes now still has rep sets on the days it was
       logged, and asking the current shape for `perf.min` there prints 'NaN
       min'. What was written down is what gets read back. */
    const parts = [];
    if (perf.km != null && perf.km > 0) parts.push(round1(perf.km) + ' km');
    if (perf.min != null && perf.min > 0) parts.push(round1(perf.min) + ' min');
    if (parts.length) return parts.join(' in ');
    const sets = perf.sets || [];
    if (!sets.length) return '';
    const reps = sets.map((s) => Math.max(0, Math.round(Number(s.r) || 0)));
    const loads = sets.filter((s) => s.w != null && isFinite(s.w));
    if (!loads.length) return sets.length + ' × ' + reps.join(', ');
    const top = loads.reduce((a, b) => (convertWeight(b.w, b.u || 'kg', unit) > convertWeight(a.w, a.u || 'kg', unit) ? b : a));
    return fmtWeight(convertWeight(top.w, top.u || 'kg', unit), unit) + ' · ' + sets.length + ' × ' + reps.join(', ');
  }

  /* ---------- the rest between sets ----------

     Read out of the plan item's `note`, never out of a field of its own. The
     programme already writes it there — 'rest 90 s', 'rest 2–3 min' — and a
     second place to keep the same number in step is a second place to get it
     wrong. No new field also means no migration.

     A range takes its LOWER bound. That is the moment the rest is over and you
     may start again; the upper bound is how long you are ALLOWED to take, not
     how long you must wait, and counting down to it would hold somebody at the
     rack for a minute the programme never asked of them.

     The number has to follow the word `rest` immediately. That is what keeps
     'rest the top of the rear foot on it' and '2 × 20 s per side, knee on the
     bench · rest 45 s' from being read as intervals — the first has no number
     and the second has the wrong one first. */

  const REST_RE = /\brest\s+(\d+(?:\.\d+)?)\s*(?:[\u2013\u2014-]\s*(\d+(?:\.\d+)?)\s*)?(min|minutes?|s|secs?|seconds?)\b/i;

  /**
   * @returns {{seconds:number, upper:number|null, text:string}|null}
   *   null when the note prescribes no interval, which is a real answer: the
   *   app must not invent a rest nobody wrote down.
   */
  function restFromNote(note) {
    const m = REST_RE.exec(String(note == null ? '' : note));
    if (!m) return null;
    const per = /^m/i.test(m[3]) ? 60 : 1;
    const seconds = Math.round(Number(m[1]) * per);
    if (!isFinite(seconds) || seconds <= 0) return null;
    const upper = m[2] == null ? null : Math.round(Number(m[2]) * per);
    return {
      seconds: seconds,
      upper: upper != null && upper > seconds ? upper : null,
      text: m[0].replace(/\s+/g, ' ').trim()
    };
  }

  /** Seconds as a clock: 105 -> '1:45'. Never negative — the caller signs it. */
  function fmtClock(seconds) {
    const n = Math.max(0, Math.round(Number(seconds) || 0));
    return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  }

  Object.assign(Arise, {
    DAY_MS, DAY_NAMES, DAY_SHORT, CATEGORIES, MUSCLES, MUSCLE_NAME, MUSCLE_UPGRADE, cleanMuscles,
    SEED_EXERCISES,
    key, fromKey, addDays, weekday, daysBetween, prettyDate, weekStart, uid,
    todayKey, minutesLeftToday, prettyTime,
    WEIGHT_UNITS, convertWeight, round1, fmtWeight, fmtLoad, setVolume, entryVolume,
    isLogged, logShape, targetPhrase, describeEntry, restFromNote, fmtClock
  });
})(window);
