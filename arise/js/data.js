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

  const SEED_HABITS = [
    { name: 'Drink 3L water', icon: '💧' },
    { name: 'Sleep 7+ hours', icon: '😴' },
    { name: 'Read 10 pages', icon: '📖' },
    { name: 'No junk food', icon: '🥗' }
  ];

  /* ---------- clock values ---------- */

  /** '06:30' → 390 minutes past midnight. */
  function hhmmToMin(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    return (Number(m[1]) % 24) * 60 + Math.min(59, Number(m[2]));
  }

  function minToHhmm(v) {
    const n = ((Math.round(v) % 1440) + 1440) % 1440;
    return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  }

  /** Human clock, respecting the device's 12/24-hour preference. */
  function prettyTime(v) {
    const n = ((Math.round(v) % 1440) + 1440) % 1440;
    const d = new Date(2000, 0, 1, Math.floor(n / 60), n % 60);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  /* ---------- goals: sections, modes, units ---------- */

  const SECTIONS = [
    { id: 'sleep', name: 'Sleep & rhythm', icon: '🌙' },
    { id: 'fitness', name: 'Fitness', icon: '💪' },
    { id: 'mind', name: 'Mind', icon: '🧠' },
    { id: 'reading', name: 'Reading', icon: '📖' },
    { id: 'health', name: 'Health', icon: '🥗' },
    { id: 'craft', name: 'Skill & craft', icon: '🛠️' },
    { id: 'custom', name: 'Custom', icon: '✨' }
  ];

  const sectionById = (id) => SECTIONS.find((s) => s.id === id) || SECTIONS[SECTIONS.length - 1];

  /**
   * Difficulty changes the *size of each step*, never the rules for earning one.
   * You always advance by performing, so hard mode moves faster only if you keep up.
   */
  const MODES = {
    easy: { id: 'easy', name: 'Easy', icon: '🌱', mult: 0.5, blurb: 'Half-size steps. Slow, and very hard to fall off.' },
    normal: { id: 'normal', name: 'Normal', icon: '⚖️', mult: 1, blurb: 'The standard step. Noticeable but fair.' },
    hard: { id: 'hard', name: 'Hard', icon: '🔥', mult: 2, blurb: 'Double steps. You reach the target in half the time.' }
  };
  const MODE_IDS = ['easy', 'normal', 'hard'];

  /** unit → how a value is written and read. */
  const UNITS = {
    time: { id: 'time', label: 'Time of day', format: prettyTime, parse: hhmmToMin, input: 'time' },
    minutes: { id: 'minutes', label: 'Minutes', format: (v) => `${Math.round(v)} min`, parse: Number, input: 'number' },
    count: { id: 'count', label: 'Count', format: (v) => `${Math.round(v)}`, parse: Number, input: 'number' },
    pages: { id: 'pages', label: 'Pages', format: (v) => `${Math.round(v)} pages`, parse: Number, input: 'number' },
    km: { id: 'km', label: 'Kilometres', format: (v) => `${(Math.round(v * 10) / 10)} km`, parse: Number, input: 'number' },
    litres: { id: 'litres', label: 'Litres', format: (v) => `${(Math.round(v * 10) / 10)} L`, parse: Number, input: 'number' },
    seconds: { id: 'seconds', label: 'Seconds', format: (v) => `${Math.round(v)}s`, parse: Number, input: 'number' }
  };

  const formatValue = (unit, v) => ((UNITS[unit] || UNITS.count).format)(v);

  /* ---------- goal templates ----------

     The SHAPE of a practice, not the practice itself. A template fills in the
     things that are true of the activity — what it is measured in, which way it
     goes, how big a step is, which area it belongs to — and leaves the two
     numbers that are true of the PERSON to be typed in.

     Those two are deliberately suggestions rather than answers. Rule 1 of
     knowledge/project.md is that a goal runs from where the user actually is,
     and the app already learned this the expensive way: it shipped five seed
     goals as instructions, and somebody who really wakes at 09:00 was asked for
     07:30 on their first morning and missed. The sheet says so in as many words.

     There is no template for "become more mature" or "get better with people".
     They are outcomes rather than practices, and a daily number invented for
     them would be exactly the thing "This Is Not A Game" forbids — the app's own
     invention sitting above the user's real record. What moves them is on this
     list already: writing, reading, gratitude, and time spent with people. */

  const GOAL_TEMPLATES = [
    { key: 't_english', name: 'English practice', icon: '🗣️', section: 'craft',
      unit: 'minutes', direction: 'up', baseline: 15, target: 60, step: 5,
      schedule: { type: 'daily' },
      blurb: 'Speaking, listening or writing — whichever you did least of yesterday.' },
    { key: 't_ai', name: 'AI practice', icon: '🤖', section: 'craft',
      unit: 'minutes', direction: 'up', baseline: 15, target: 60, step: 5,
      schedule: { type: 'daily' },
      blurb: 'Time actually building something with it, not time reading about it.' },
    { key: 't_geo', name: 'Geology software', icon: '🛠️', section: 'craft',
      unit: 'minutes', direction: 'up', baseline: 20, target: 90, step: 10,
      schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] },
      blurb: 'Weekdays, because this one is your trade rather than your evening.' },
    { key: 't_income', name: 'Earning work', icon: '💹', section: 'craft',
      unit: 'minutes', direction: 'up', baseline: 20, target: 90, step: 10,
      schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] },
      blurb: 'Time on the thing that might pay. The money is the outcome; this is the input.' },
    { key: 't_gratitude', name: 'Gratitude', icon: '🙏', section: 'mind',
      unit: 'count', direction: 'up', baseline: 1, target: 3, step: 1,
      schedule: { type: 'daily' },
      blurb: 'Things named, not minutes spent. Three is a ceiling, not a beginning.' },
    { key: 't_basketball', name: 'Basketball', icon: '🏀', section: 'fitness',
      unit: 'minutes', direction: 'up', baseline: 45, target: 120, step: 15,
      schedule: { type: 'weekdays', days: [2, 6] },
      blurb: 'Set the days you actually play — the two here are a guess.' },
    { key: 't_volleyball', name: 'Volleyball', icon: '🏐', section: 'fitness',
      unit: 'minutes', direction: 'up', baseline: 45, target: 120, step: 15,
      schedule: { type: 'weekdays', days: [4] },
      blurb: 'Set the days you actually play — the one here is a guess.' },
    { key: 't_swimming', name: 'Swimming', icon: '🏊', section: 'fitness',
      unit: 'minutes', direction: 'up', baseline: 20, target: 60, step: 5,
      schedule: { type: 'weekdays', days: [3, 0] },
      blurb: 'Set the days you actually swim — the two here are a guess.' }
  ];

  /* ---------- seed goals ---------- */

  /**
   * Every goal carries a baseline AND a target, so no progression can run away.
   * steps are per level, in the goal's unit, at normal difficulty.
   */
  const SEED_GOALS = [
    {
      key: 'wake', name: 'Wake up', icon: '⏰', section: 'sleep',
      unit: 'time', direction: 'down', baseline: 450, target: 360, step: 15,
      schedule: { type: 'daily' }, track: 'value',
      blurb: 'Earlier mornings, earned one step at a time.'
    },
    {
      key: 'sleep', name: 'Lights out', icon: '🌙', section: 'sleep',
      unit: 'time', direction: 'down', baseline: 1410, target: 1350, step: 15,
      schedule: { type: 'daily' }, track: 'value',
      blurb: 'An earlier wake-up only works if bedtime moves too.'
    },
    {
      key: 'read', name: 'Read', icon: '📖', section: 'reading',
      unit: 'minutes', direction: 'up', baseline: 10, target: 45, step: 5,
      schedule: { type: 'daily' }, track: 'value', gate: 'summary',
      blurb: 'Write what you took from it — that is where the learning sticks.'
    },
    {
      key: 'meditate', name: 'Meditate', icon: '🧘', section: 'mind',
      unit: 'minutes', direction: 'up', baseline: 5, target: 20, step: 2,
      schedule: { type: 'daily' }, track: 'value',
      blurb: 'Attention is a muscle.'
    },
    {
      key: 'deepwork', name: 'Deep work', icon: '🛠️', section: 'craft',
      unit: 'minutes', direction: 'up', baseline: 25, target: 120, step: 10,
      schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] }, track: 'value',
      blurb: 'One unbroken block on the thing that matters.'
    },
    {
      key: 'cold', name: 'Cold shower', icon: '🚿', section: 'health',
      unit: 'seconds', direction: 'up', baseline: 15, target: 180, step: 15,
      schedule: { type: 'daily' }, track: 'value', enabled: false,
      blurb: 'Voluntary discomfort, in measured doses.'
    },
    {
      key: 'water', name: 'Water', icon: '💧', section: 'health',
      unit: 'litres', direction: 'up', baseline: 1.5, target: 3, step: 0.25,
      schedule: { type: 'daily' }, track: 'value', enabled: false,
      blurb: 'Boring, and it works.'
    }
  ];

  /* ---------- reading journal ---------- */

  /** Rotating prompts. Guidance, never a word count — a minimum length only buys you "asdf". */
  const READING_PROMPTS = [
    'What is the single idea you want to keep from today?',
    'Explain what you read as if to a curious twelve-year-old.',
    'What did the author claim, and do you actually believe it?',
    'What will you do differently because of this?',
    'What surprised you, or contradicted something you thought?',
    'Which sentence was worth the whole session?',
    'What question are you left with?',
    'How does this connect to something you already know?'
  ];

  const promptForDay = (dateKey) => {
    const n = Math.abs(daysBetween('2024-01-01', dateKey));
    return READING_PROMPTS[n % READING_PROMPTS.length];
  };

  /* ---------- rewards ---------- */

  // Streak milestones. xp is granted on claim.
  const MILESTONES = [
    { id: 'm3', days: 3, name: 'Ignition', icon: '🔥', xp: 50, blurb: 'Three days in. The hardest part is behind you.' },
    { id: 'm7', days: 7, name: 'One Week Warrior', icon: '🗡️', xp: 120, blurb: 'A full week. This is becoming a rhythm.' },
    { id: 'm14', days: 14, name: 'Fortnight Forged', icon: '⚔️', xp: 220, blurb: 'Two weeks. Your body is starting to expect it.' },
    { id: 'm21', days: 21, name: 'Habit Formed', icon: '🧠', xp: 320, blurb: '21 days — the classic habit threshold, cleared.' },
    { id: 'm30', days: 30, name: 'Monthly Machine', icon: '🏅', xp: 500, blurb: 'A month of showing up. Rare air.' },
    { id: 'm50', days: 50, name: 'Half Century', icon: '🥇', xp: 800, blurb: 'Fifty days. Discipline over motivation.' },
    { id: 'm75', days: 75, name: 'Iron Will', icon: '🛡️', xp: 1100, blurb: 'Seventy-five. Nothing knocks you off now.' },
    { id: 'm100', days: 100, name: 'Centurion', icon: '👑', xp: 1600, blurb: 'One hundred days. You are the discipline.' },
    { id: 'm150', days: 150, name: 'Relentless', icon: '💎', xp: 2400, blurb: '150 days of relentless forward motion.' },
    { id: 'm200', days: 200, name: 'Unbreakable', icon: '🗿', xp: 3200, blurb: '200 days. Unbreakable.' },
    { id: 'm365', days: 365, name: 'Year of Arising', icon: '🌟', xp: 6000, blurb: 'A full year. You rewrote who you are.' }
  ];

  const RANKS = [
    { at: 1, name: 'Awakened', icon: '🌱' },
    { at: 4, name: 'Apprentice', icon: '🪶' },
    { at: 8, name: 'Fighter', icon: '🥊' },
    { at: 13, name: 'Hunter', icon: '🏹' },
    { at: 19, name: 'Knight', icon: '🛡️' },
    { at: 26, name: 'Elite', icon: '⚡' },
    { at: 34, name: 'Champion', icon: '🏆' },
    { at: 45, name: 'Monarch', icon: '👑' },
    { at: 60, name: 'Sovereign', icon: '🌟' }
  ];

  const XP = { exercise: 10, habit: 5, dayBonus: 25, weeklyGoal: 150, goal: 12, summary: 20, levelUp: 40 };

  /** Total XP required to *reach* a level (level 1 = 0). Gentle quadratic curve. */
  function xpForLevel(level) {
    if (level <= 1) return 0;
    const n = level - 1;
    return Math.round(50 * n * (n + 1) * 0.5 + 60 * n);
  }

  function levelFromXp(xp) {
    let lvl = 1;
    while (lvl < 200 && xp >= xpForLevel(lvl + 1)) lvl++;
    return lvl;
  }

  function rankFor(level) {
    let r = RANKS[0];
    for (const c of RANKS) if (level >= c.at) r = c;
    return r;
  }

  Object.assign(Arise, {
    DAY_MS, DAY_NAMES, DAY_SHORT, CATEGORIES, MUSCLES, MUSCLE_NAME, MUSCLE_UPGRADE, cleanMuscles,
    SEED_EXERCISES, SEED_HABITS, SEED_GOALS, GOAL_TEMPLATES, MILESTONES, RANKS, XP,
    SECTIONS, sectionById, MODES, MODE_IDS, UNITS, formatValue, READING_PROMPTS, promptForDay,
    key, fromKey, addDays, weekday, daysBetween, prettyDate, weekStart, uid,
    todayKey, minutesLeftToday, hhmmToMin, minToHhmm, prettyTime,
    xpForLevel, levelFromXp, rankFor
  });
})(window);
