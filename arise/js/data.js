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

  /* Empty on purpose. A daily habit is a tick that asks the same thing forever,
     and every one this app used to ship duplicated something it now tracks
     properly: water and sleep are things to measure rather than tick, reading is
     a goal with a summary gate, and "no junk food" is a rule rather than a
     practice. The concept stays — More adds one in a tap, and `habitToGoal`
     promotes it the moment it deserves a ladder — but nothing is seeded, because
     a habit nobody chose is a tick nobody meant. */
  const SEED_HABITS = [];

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
   *
   * These are the practices the app is FOR — the trackable half of the owner's
   * own "things I want to improve" list, each measured in minutes a day and
   * stepping up when it is earned rather than when a week passes.
   *
   * Three things on that list are deliberately absent.
   *
   *   "Become more mature" and "improve interpersonal skills" are outcomes, not
   *   practices. A daily number invented for either would be the app's own
   *   invention sitting above the user's real record, which is the one thing
   *   "This Is Not A Game" in knowledge/project.md forbids. What moves them is
   *   already here: writing, reading and gratitude.
   *
   *   Basketball, volleyball and swimming are in GOAL_TEMPLATES rather than
   *   seeded, because a seed cannot know which days somebody plays and guessing
   *   would put a missed session on the record for a day they were never on a
   *   court. The template asks.
   *
   * The numbers are starting points and the app says so — see the "These are
   * starting numbers, not yours" banner. Rule 1 is that a goal runs from where
   * the user actually is, and only they know that.
   */
  const SEED_GOALS = [
    {
      key: 'english', name: 'English', icon: '🗣️', section: 'craft',
      unit: 'minutes', direction: 'up', baseline: 15, target: 45, step: 5,
      schedule: { type: 'daily' }, track: 'value',
      blurb: 'Speaking, listening or writing — whichever you did least of yesterday.'
    },
    {
      key: 'ai', name: 'AI practice', icon: '🤖', section: 'craft',
      unit: 'minutes', direction: 'up', baseline: 15, target: 45, step: 5,
      schedule: { type: 'daily' }, track: 'value',
      blurb: 'Time spent building something with it, not time spent reading about it.'
    },
    {
      key: 'read', name: 'Read', icon: '📖', section: 'reading',
      unit: 'minutes', direction: 'up', baseline: 10, target: 45, step: 5,
      schedule: { type: 'daily' }, track: 'value', gate: 'summary',
      blurb: 'Write what you took from it — that is where the learning sticks.'
    },
    {
      key: 'gratitude', name: 'Gratitude', icon: '🙏', section: 'mind',
      unit: 'minutes', direction: 'up', baseline: 2, target: 10, step: 2,
      schedule: { type: 'daily' }, track: 'value',
      blurb: 'Name them rather than think them. Two minutes is a real practice.'
    },
    {
      key: 'geology', name: 'Geology software', icon: '🛠️', section: 'craft',
      unit: 'minutes', direction: 'up', baseline: 20, target: 60, step: 10,
      schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] }, track: 'value',
      blurb: 'Weekdays. This one is the trade, not the evening.'
    },
    {
      key: 'earning', name: 'Earning work', icon: '💹', section: 'craft',
      unit: 'minutes', direction: 'up', baseline: 20, target: 60, step: 10,
      schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] }, track: 'value',
      blurb: 'Time on the thing that might pay. The money is the outcome; this is the input.'
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

  /* ---------- lines worth keeping ----------

     The app's own test for a feature is in knowledge/project.md: does this tell
     the user something TRUE about their life, or does it only move a counter the
     app invented? A generic motivational quote fails it — it says nothing about
     anybody's life and it is the decoration this app is built against.

     A line the user chose to keep passes, because choosing it is the fact. So
     this list is theirs: `addLine` is the only way one appears, and every seeded
     entry below can be deleted.

     What IS seeded is short, real and attributed — the principles from the
     "Can't Hurt Me" analysis the owner brought to this app, not invented
     encouragement and never a sentence about the user. If it reads as a slogan
     rather than a claim you could argue with, it does not belong here. */

  const SEED_LINES = [
    { text: 'Stress plus recovery equals adaptation. Stress without recovery equals damage.', source: 'Can’t Hurt Me' },
    { text: 'Discipline is architecture, not heroism — consistent people have removed decisions, not won them.', source: 'Can’t Hurt Me' },
    { text: 'Fault and responsibility are different. Take the second regardless of the first.', source: 'Can’t Hurt Me' },
    { text: 'Confidence follows evidence. Build the record.', source: 'Can’t Hurt Me' },
    { text: 'Avoidance inflates difficulty; contact deflates it.', source: 'Can’t Hurt Me' },
    { text: 'Rehearse the obstacle, not the trophy.', source: 'Can’t Hurt Me' },
    { text: 'Your perception of your limit arrives long before your limit does.', source: 'Can’t Hurt Me' },
    { text: 'You cannot improve from a position you refuse to state accurately.', source: 'Can’t Hurt Me' }
  ];

  /* ---------- rewards ---------- */

  // Streak milestones. xp is granted on claim.
  /* No `icon` either. The medal is one drawn trophy now: eleven different
     glyphs was eleven decisions, it re-used the flame that means "streak"
     everywhere else, and the locked state depended on `grayscale()` treating a
     colour emoji the same way on every platform, which it does not. */
  const MILESTONES = [
    { id: 'm3', days: 3, name: 'Ignition', xp: 50, blurb: 'Three days in. The hardest part is behind you.' },
    { id: 'm7', days: 7, name: 'One Week Warrior', xp: 120, blurb: 'A full week. This is becoming a rhythm.' },
    { id: 'm14', days: 14, name: 'Fortnight Forged', xp: 220, blurb: 'Two weeks. Your body is starting to expect it.' },
    { id: 'm21', days: 21, name: 'Habit Formed', xp: 320, blurb: '21 days — the classic habit threshold, cleared.' },
    { id: 'm30', days: 30, name: 'Monthly Machine', xp: 500, blurb: 'A month of showing up. Rare air.' },
    { id: 'm50', days: 50, name: 'Half Century', xp: 800, blurb: 'Fifty days. Discipline over motivation.' },
    { id: 'm75', days: 75, name: 'Iron Will', xp: 1100, blurb: 'Seventy-five. Nothing knocks you off now.' },
    { id: 'm100', days: 100, name: 'Centurion', xp: 1600, blurb: 'One hundred days. You are the discipline.' },
    { id: 'm150', days: 150, name: 'Relentless', xp: 2400, blurb: '150 days of relentless forward motion.' },
    { id: 'm200', days: 200, name: 'Unbreakable', xp: 3200, blurb: '200 days. Unbreakable.' },
    { id: 'm365', days: 365, name: 'Year of Arising', xp: 6000, blurb: 'A full year. You rewrote who you are.' }
  ];

  /* No `icon` here. There were nine, read nowhere — `progress()` renders the
     name only — and a dead field is an invitation to render it. */
  const RANKS = [
    { at: 1, name: 'Awakened' },
    { at: 4, name: 'Apprentice' },
    { at: 8, name: 'Fighter' },
    { at: 13, name: 'Hunter' },
    { at: 19, name: 'Knight' },
    { at: 26, name: 'Elite' },
    { at: 34, name: 'Champion' },
    { at: 45, name: 'Monarch' },
    { at: 60, name: 'Sovereign' }
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
    SECTIONS, sectionById, MODES, MODE_IDS, UNITS, formatValue, READING_PROMPTS, promptForDay, SEED_LINES,
    key, fromKey, addDays, weekday, daysBetween, prettyDate, weekStart, uid,
    todayKey, minutesLeftToday, hhmmToMin, minToHhmm, prettyTime,
    xpForLevel, levelFromXp, rankFor
  });
})(window);
