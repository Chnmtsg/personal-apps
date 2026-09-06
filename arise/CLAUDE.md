# Discipline

## Purpose

Discipline is an offline-first training log. A weekly training plan, and a
record of every set you actually did: the exercise, the weight, the reps, and
what it was last time.

It was a personal-development tracker until 2026-09 — goals, reading, a journal,
a 66-day habit run, XP and a rank ladder. All of that was removed at the user's
request in favour of one subject done properly. Nothing was deleted from anybody's
stored data; see the second invariant below.

The goal is long-term maintainability, reliability, and clean architecture.

Never sacrifice maintainability for short-term speed.

**The product is named Discipline; the code is still `arise`.** The rename in
2026-08 covered what the user sees — the title, the manifest, the brand mark and
every string in the app. Three things deliberately did **not** move, and moving
any of them later would be a breaking change, not a tidy-up:

- `localStorage` key `arise.state.v1` — renaming it orphans every user's plan,
  logs, sets and streaks, with no recovery. It is the one thing that must
  never change.
- the `window.Arise` / `window.Store` / `window.UI` globals, and the `arise/`
  folder itself.
- filenames inside `sw.js` ASSETS.

---

# Layout

All paths in this file are relative to `arise/`.

- `index.html` — the app shell
- `styles.css` — design tokens and every view
- `manifest.webmanifest` — PWA manifest
- `sw.js` — service worker, offline app shell
- `js/` — the application, loaded in this order:
  `data.js` → `program.js` → `photos.js` → `store.js` → `ui.js` → `app.js`
  (`goals.js` and `run.js` were deleted in 2026-09 with the features they held)
- `icons/` — generated PNG and SVG icons
- `knowledge/` — project references for this app
- `tools/` — test and utility scripts
- `serve.cmd` — local HTTP server

There is no build step, no bundler and no framework. The `js/` files are classic
scripts hanging off `window.Arise` / `window.Store` / `window.UI`.

---

# Development Philosophy

Always think before coding.

Prefer analysis before implementation.

Never modify unrelated files.

Never introduce unnecessary complexity.

Always preserve backward compatibility — stored user data especially, since
goals, logs, streaks and journals live only on the user's device and are never
uploaded anywhere.

---

# Workflow

Every significant change should follow this order.

1. Read the relevant knowledge files
2. Review the current behaviour
3. Prioritize the work
4. Decide the smallest safe implementation
5. Implement
6. Verify

---

# Knowledge

Always use these project references.

- `knowledge/project.md` — what the app is for, the three rules, hard constraints
- `knowledge/coding-standards.md` — layers, migrations, rendering, tests
- `knowledge/ui-guidelines.md`
- `knowledge/colour-direction-plumage.md` — why the palette is what it is
- `knowledge/review-conventions.md` — the vocabulary for any review of this app

---

# Verifying

Run from `arise/`. Never report a change as done without these.

```bash
node tools/smoke.js
node tools/render.js
node tools/wire.js
```

or `npm test`, which runs all three.

`smoke.js` loads `js/` into a sandbox with a fake `localStorage` and asserts the
data layer: the set log, volume, prefill from the last session, unit conversion,
streaks, freezes, frozen history, the training programme, and every state
migration — including that nothing the removed features stored has been thrown
away.

`render.js` renders every view, every sheet and every programmed day against a
stub DOM, failing on anything that renders `undefined`, `NaN` or
`[object Object]`. It also carries the token, emoji and escaping guards, and
asserts that every state class the views emit is actually styled.

`wire.js` drives `js/app.js` through its real click router: typing a weight and
some reps and pressing Log set has to arrive in the store, and the emitted
`data-act` names are cross-checked against the handled ones so a control wired to
a handler that does not exist fails the build.

There is no typechecker. These three scripts are the whole safety net, so a
change they cannot cover needs saying so out loud.

Two things they cannot catch.

- `render.js` uses a hand-rolled stub DOM. `document.activeElement`,
  `document.contains`, `getClientRects` and `isConnected` do not exist on it.
  Guard any new DOM API so the stub degrades instead of throwing.
- `tools/wire.js` drives `js/app.js` through its real click router against a
  stub DOM. It exists because a stray newline inside a string literal once left
  `app.js` unparseable while both other suites reported green — a syntax error
  takes the whole file with it, so nothing wired up and the app was dead on
  open. It cannot tell you a button is reachable, visible or styled, only that
  tapping it does what the handler says. Real taps still need a browser.

Serve over `http://`, never `file://` — service workers and install are blocked
on `file://`.

```bash
serve.cmd          # http://localhost:8123
```

The service worker caches the shell and is cache-first, so while testing a change
you must clear it or you will be reading stale assets:

```js
(async () => {
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  for (const k of await caches.keys()) await caches.delete(k);
  location.reload();
})()
```

---

# Shipping it to a phone

The app is static, so it deploys by drag-and-drop — no build, no git, no CLI.
**It must be served over HTTPS**: service workers and install-to-home-screen
only run on a secure context or `localhost`, so a LAN address like
`http://192.168.x.x:8123` shows the app but silently loses offline caching and
install, which is most of the point.

What ships is exactly the runtime set — `index.html`, `styles.css`, `sw.js`,
`manifest.webmanifest`, `_headers`, `js/`, `icons/`, `fonts/`. Everything else
in this folder is development scaffolding and must not be uploaded: `tools/`,
`knowledge/`, `.claude/`, `CLAUDE.md`, `README.md`, `serve.cmd`,
`node_modules/`.

```bash
npm run package        # → dist/, exactly the list above
```

**`package.js` is not a build step and must never become one.** It copies files
byte for byte; nothing is bundled, minified or inlined, and `arise/` stays
servable as-is. It exists because a publish directory is a whole folder, so
pointing a host at `arise/` uploads `knowledge/` and `CLAUDE.md` with the app.

It also runs the two pre-upload checks this file used to ask a person to
remember, and exits non-zero on either, so a broken package cannot deploy:

- every asset named in `sw.js` ASSETS exists in what is being shipped — a
  missing precache entry makes `cache.add` fail silently for that one file, the
  app still installs, and the gap only shows up the first time the user is
  offline;
- `index.html` still links every `js/` file `sw.js` precaches, carries no inline
  script, and still has its `Content-Security-Policy` meta above the first
  `<link>` it governs — the 440KB self-extracting bundle caught by the one place
  that can see it.

## GitHub Pages

Published at **https://chnmtsg.github.io/personal-apps/** by
`.github/workflows/pages.yml`, on every push to `master`. The workflow runs
`npm test` and then `node tools/package.js`, and uploads `arise/dist` — so the
two pre-upload checks and all three suites stand between a commit and the live
site. Netlify was dropped in 2026-08; `netlify.toml` is gone from the tree and
recoverable from history if it is ever wanted back.

Pages serves at a **sub-path** (`/personal-apps/`). Nothing needed rewriting for
that: every path in the app is relative — `./styles.css`, `./js/…` — and the
manifest declares `"scope": "./"` with `"start_url": "./index.html"`. Keep it
that way. A single leading `/` anywhere would resolve against the domain root
and 404 on the live site while working perfectly on `localhost:8123`.

**`_headers` no longer does anything.** It is a Netlify file, and Pages ignores
it. It still ships because it costs nothing and documents the intent, but two
things it used to buy are now the platform's decision:

- *Cache policy.* Pages serves assets with a ten-minute max-age rather than the
  `must-revalidate` `_headers` asked for, so a VERSION bump can take that long
  to be seen by a browser that has just fetched the old file. Ten minutes, not
  the year a misconfigured CDN could hold — tolerable, but it is why "I bumped
  the version and nothing happened" can be true for a few minutes now.
- *The `Content-Security-Policy`.* Restored as a `<meta http-equiv>` at the top
  of `index.html` — the one exception to "nothing is inlined into the shell",
  because a meta tag is not a script and the alternative was no enforcement at
  all. `tools/package.js` fails the build if it goes missing, loses a
  load-bearing directive, or sinks below a `<link>` it is meant to govern; all
  four of those were checked by breaking them. Verified live in a browser too:
  it blocks a foreign-origin image, and raises zero violations against the app's
  own fonts, data-URL pictures and export blob.

  **`frame-ancestors` could not come with it.** That directive and
  `X-Frame-Options` are both ignored in a meta tag, so clickjacking protection
  is genuinely gone until the app is behind a host that sends headers.

**Each origin is its own storage.** Moving from `localhost:8123` to a hosted URL
starts empty; the user's plan, logs and sets do not follow. Export from
More → Export on the old origin and import on the new one before using it.

---

# Invariants

These are the rules the app is built on. Breaking one is a Critical finding.
`knowledge/project.md` states them as product constraints; this is the
engineering form.

**Discipline is a training log. It tracks exercises, sets, weight and reps, and
nothing else.** In 2026-09 the goal engine, the reading gate, the journal, the
66-day habit run, the daily-habit list, the XP/level/rank system, the milestone
ladder and the weekly chest were all removed at the user's request. What is left
is one subject: the weekly plan, the session, and the record of what was
actually lifted. A feature that does not answer *"what did I train, with what,
and is it going up"* does not belong here.

**Nothing that was removed was deleted from anybody's data.** `migrate()` stops
LOOKING at `goals`, `goalLogs`, `reading`, `journal`, `lines`, `cookies`,
`challenges`, `run`, `habits`, `claimed` and `weeklyClaims`; it does not touch
them. They ride along in `arise.state.v1` and in every export, forever, because
deleting a year of somebody's journal in a migration is the one mistake with no
recovery. There is a test by name (`a goal from the old app is still in the
state`). **Do not "tidy" them out later.** The code for the removed features is
on `master` in the commit before this one if any of it is ever wanted back.

**A day you have lived is never re-judged.** Every day's log freezes its own
exercise list the first time the day is opened (`ensureLog`), and every set
stores the weight, the unit and the reps ON ITSELF. So renaming an exercise,
changing its prescription, editing the weekly plan or switching the display unit
cannot reach back and change what last Tuesday weighed. This is the single
easiest rule in the app to break without anybody noticing; `tools/smoke.js`
asserts it by name under 'history is never rewritten'.

**A set carries its own unit.** `{ w: 60, u: 'kg', r: 8 }`. Storing kilos and
converting on the way in would be tidier by one field and wrong by rounding —
60 kg becomes 132.3 lb becomes 60.01 kg, and a round number the user typed stops
reading as one. Carrying the unit also makes `settings.weightUnit` a *display*
choice: switching it re-reads history rather than re-valuing it, so no stored day
moves. A mixed history reads correctly in either unit, which is the whole point.

**`w: null` is a bodyweight set, and it is a real answer.** A chin-up set is
eight reps and no load. Writing `0` would put it in the volume total as a
zero-kilo barbell, and a bodyweight day would report "0 kg moved" — a different
and false claim. `setVolume` returns 0 for it, the reps still count, and the
session line falls back to reps rather than printing a zero. Tested both in the
engine and on the screen.

**Logging can complete an exercise. It can never un-complete one.**
`maybeComplete` ticks the row when the last prescribed set is filled in (or the
prescribed minutes or kilometres are reached). Nothing in the set log ever
removes that tick — correcting a mistyped set must not quietly retract a session
the user knows they did. Taking it back is the user's own tap on the tick.

**Day status is derived, never stored.** Every number is recomputed from the
logs, so nothing can drift out of sync. This is why `commit()` must stay O(1),
why the best-streak high-water mark is maintained on read, and why day status is
memoised per revision.

**State is local and versioned.** Everything lives in `localStorage` under
`arise.state.v1`, described by `STATE_VERSION` in `js/store.js` (7: the
performance record). Every migration must be additive and must tolerate state
written by an older version. Never delete or overwrite user data in a migration;
a one-time change must be guarded by its own flag, not by the version number
alone. Read an incoming flag before merging seed defaults over it, or the default
will mask the real value.

`arise.state.v1.unreadable` is the one deliberate exception to the single-key
rule. It is a lifeboat, not state: nothing in the normal read path touches it. It
holds the raw bytes of a state that failed to parse, written once and verified by
read-back, so that seeding a fresh start can never be the thing that destroys the
user's only copy. If that copy cannot be made, `store.js` blocks writes instead.

**A stored record is read defensively, never trusted.** `normalisePerf` runs on
every load: an unreadable weight becomes bodyweight, unreadable reps become zero,
an unknown unit falls back to kilos, a null set is dropped, a garbage entry
becomes an empty one. It repairs and never invents. The alternative on a
half-written entry is a `NaN` on a screen, and a number the user cannot explain
is worse than a blank.

**Escape all user text.** Exercise names, plan notes, per-exercise notes and
reward names are user-controlled. Everything reaching `innerHTML` goes through
`esc()` — toasts included, not just views.

**Adding a `js/` file touches four places.** `index.html`, `sw.js` ASSETS, and
the load lists in `tools/smoke.js` and `tools/render.js`. `tools/package.js`
cross-checks the first two against each other, so a file the shell loads but the
worker never precaches fails the build instead of vanishing the first time the
user is offline.

**A render never writes.** A view reads the store and returns a string. Anything
that mutates is an event owned by `js/app.js`. The rule exists because a write
during a render is also a hang: `commit` notifies the view, the view re-renders,
the render writes again. `suggestSet` is the one that looks like it might break
this and does not — it SUGGESTS and stores nothing, so an exercise the user
skipped leaves no trace claiming otherwise. There is a test by name.

**One place asks, one place records.** The plan item says what was ASKED
(`targetPhrase`); `log.perf` says what was DONE (`describeEntry`). They are
separate objects and are never derived from each other. `describeEntry` reads
the ENTRY and not the exercise, so an exercise that used to be measured in reps
and is measured in minutes now still reads back correctly on the days it was
logged — asking the current shape for `perf.min` there printed `NaN min`.

**Asking "what did I lift last time" is keyed on the exercise, not the plan
item.** The same lift on Monday and on Thursday is two plan items with two ids,
and the question does not care which day of the week it was.
`lastPerformance(exerciseId, before)` walks the logs; `suggestSet` prefers the
set already typed today, then last session, then the plan's own prescription,
and says which of the three it used so the screen can say so too.

**Token discipline is asserted, not reviewed.** `tools/render.js` fails on a
pixel-sized icon outside the `*-plate` rules, on any off-scale `font-size`
outside the named glyph boxes, on a literal `font-size` or `padding` in a
`style=` attribute in `js/ui.js`, and on a control strip that scrolls sideways.
Each of those was found by a review rather than by a test, having drifted into
exactly the literals the scale and the spacing system were introduced to end.

An icon beside a label is sized in `em` so it grows when the reader raises their
system text size — eleven were pinned to pixels, which left a 12px flame beside
15px text. And `--fs-4xl` / `--fs-5xl` exist because the scale stopped at 26
while the day counter is 54: a scale that cannot express the largest thing on
the screen invites the next literal.

**Nothing in this app types an emoji, and `tools/render.js` enforces it.** Chrome
icons are drawn from the table in `js/ui.js` — one stroke weight, one grid,
`currentColor`. `exGlyph` decides "the user chose this glyph" by testing
membership in the SET of every stock icon, never by a lookup keyed on the
exercise NAME. Keyed by name it was defeated by an ordinary rename:
`stockExIcon('Press-ups')` returns nothing for a renamed 'Push-ups', so the
seed's own glyph — which nobody chose — passed both tests and rendered. There is
a test that renames a seeded exercise before asserting, and another that a glyph
the user really typed still survives one.

The guard is a route sweep plus an editor-sheet sweep for pictographs. The tick,
the cross, the arrows and the chevrons are carved OUT of the range on purpose:
they take `currentColor` and read as typography. The stored `icon` key stays on
every exercise — deleting a stored field is the one thing the migration rules
forbid — and `exGlyph` still honours a glyph chosen before the field was removed.

**The built-in programme reaches an existing account by a tap, never by a
migration.** `js/program.js` holds the library and `PROGRAM_WEEK`, and
`installProgram` runs **exactly once per account**, guarded by
`meta.programInstalled`. That guard is load-bearing: installing replaces
`state.plan` outright, and doing that from a migration would throw away a week
the user had built by hand. So editing `PROGRAM_WEEK` reaches a fresh install and
nobody else, and the way it reaches everybody else is `S.reinstallProgram()`,
behind the confirm on Plan. The sheet states what goes and what stays, because
both halves matter: the library is additive and nothing is ever deleted from it,
and no logged day moves, since `ensureLog` freezes each day's exercise list into
that day's log the first time it is touched.

`programPlan` resolves each week entry **by name** and `.filter(Boolean)`s what
it cannot find, so one typo in `PROGRAM_WEEK` drops that lift out of the day in
silence — no error, no empty row, just a session one exercise shorter than the
programme says. `tools/smoke.js` asserts every name resolves and that each day's
item count survives into the plan; nothing else in the app can see it.

**There are two contexts, and nothing in either is drafted any more.**
`A.PROGRAM_CONTEXTS` is a list of `{id, name, blurb, week}`;
`programPlan(exercises, contextId)` picks one and `S.reinstallProgram(id)` lays
it down. The app stores ONE weekly plan, which is the right shape — you are on
site or you are at home, never both — so a context is an alternative, not a
second plan. `meta.programContext` records which is on and Plan marks it.
`A.PROGRAM_WEEK` still exports the site week under its old name so nothing
downstream had to change.

The programme was rewritten in 2026-09 from a full document the athlete
supplied: push / pull / legs, twice over, in both contexts. Saturday's accessory
session and the whole home context had been DRAFTED for this app because the
source named one and never described the other; both arrived, so both labels are
gone and `tools/smoke.js` asserts they stay gone — a label saying a session was
invented is a lie once the real one is in the file.

**Volume follows the lagging quality, and the lagging quality is upper body.**
The athlete squats 1.67x bodyweight and benches 0.92x, which is legs well ahead
of everything else. So chest, back, side delts and arms sit at the top of the
volume range and quads and hamstrings sit in the middle — enough to regain what
was already held, which retraining makes cheap, without widening a gap that is
already there. Distributing volume evenly would preserve the imbalance. If a
future edit "balances" the week, it is undoing the whole point of it.

**The set counts are asserted against the source document, session by session.**
`programPlan` resolves week entries BY NAME and `.filter(Boolean)`s what it
cannot find, so one typo drops a lift out of a day in silence — no error, no
empty row, just a session one exercise shorter than the coach wrote. A mistyped
`sets:` is worse: nothing anywhere reports it and the screen simply asks for one
set fewer, forever. `DOC_SETS` in `tools/smoke.js` is the document's own numbers,
and it is the only thing in the tree that can see either failure. **When the
programme changes, that table changes with it** — it is not scaffolding, it is
the transcription being checked against its source.

**A prescribed rest interval must stay machine-readable.** The notes carry
`rest 90 s` and `rest 2–3 min`, and `A.restFromNote` parses them to run the timer
between sets. Keep the number immediately after the word "rest". A smoke test
walks every item in both contexts and fails if one prescribes a rest the parser
cannot read, because the failure mode is silent: the timer just counts up
instead.

**What the weekday grid cannot hold, and it says so.** The site block is written
as a ROLLING cycle — push, pull, legs, rest, repeat — and the source says in as
many words "do not use a fixed weekly calendar on site". A four-day cycle does
not tile a seven-day week; drifting is the point of it. This app stores a plan
per WEEKDAY, so it cannot express one at all.

What ships is the closest weekly expression: the six sessions in order with
Thursday as the rest day. That is one rest day rather than two per eight, and it
runs Friday through Wednesday unbroken where the rolling version would stop —
which on camp food and camp sleep is the exact failure the rolling cycle exists
to prevent. The context blurb says so, the week comment says so, and the user is
told to move days by hand as the cycle drifts. **Do not quietly "fix" this by
inventing a seventh rest day the document does not have.** A real fix is a plan
indexed by cycle-day rather than weekday, which is a change to the frozen-history
rules and needs raising first.

**Charts are inline SVG drawn from the record, and the mark colour is a
VALIDATED step rather than a UI token.** `--chart-did` and `--chart-ask` exist
because a mark on a dark surface has to sit inside OKLCH L 0.48-0.67, and the UI
tokens sit outside it — bright enough to glare at chart scale. Both pairs were
run through the dataviz palette validator in both modes and pass all six checks.
The light-mode jade is more saturated than `--accent` because the hue runs out of
chroma at that lightness and would otherwise read as grey. **Do not tidy them
back to the UI tokens** — that reintroduces a failure the eye does not catch.
`--chart-ask` currently has no mark on it and stays anyway: it is a validated
step, and re-deriving one later is exactly the work this note exists to prevent.

The form was picked before the colour, which is the order that matters. The
question on Stats is "is the bar going up", which is change over time on an
uneven calendar — so it is one column per SESSION and nothing at all for the days
between. A line would invent a continuous climb across days nothing was
recorded, which is the one thing this app must never draw. The baseline is the
lightest session shown rather than zero, because 60 to 65 kg on a 0-65 axis is
four pixels; the label states both ends so nothing is hidden by that. **One axis,
ever.** One series, so there is no legend box — the label above the chart names
it, and a legend for a single series is ink with no job.

Stats uses **small multiples, one hue**, never a multi-line chart. Eight lifts
would need eight validated categorical hues; this palette has three colours with
fixed jobs, and generating five more would put indistinguishable hues on screen
under CVD. Faceting lets the label carry identity instead.

**Stress plus recovery equals adaptation; stress without recovery equals damage.**
Every feature in this app that raises the standard is only safe underneath that
sentence, so the recovery half is a first-class thing rather than a footnote.

`S.deloadWeek()` derives where a week sits in the cycle from `historyStart()`,
counted in whole weeks — stable, no stored anchor, cannot drift. It deliberately
does NOT rewrite the plan: `ensureLog` freezes a day's exercise list the first
time the day is opened, so reducing sets here would put the screen and the record
in disagreement. What it does honestly is name the week and say what to do.

`settings.deloadEveryWeeks` is 0 (off) by default and must be registered in
`NUMERIC_SETTINGS` in `js/app.js` — a select hands back a string, and `'4' < 2`
is false, so an unregistered value would silently never switch the cycle off.

**The rest between sets is read out of the plan's own note, and the app invents
none.** `A.restFromNote` parses `rest 90 s` / `rest 2–3 min` out of a plan item's
`note`, which is where the programme already writes it. No new field, so no
migration, and no second copy of the same number to keep in step. A range counts
down to its LOWER bound — that is when the rest is over and you may start; the
upper bound is how long you are ALLOWED to take, and counting to it would hold
somebody at the rack for a minute nobody asked of them. An exercise whose note
prescribes nothing counts UP instead, because a rest the app made up is exactly
the invented number this project refuses to show. `tools/smoke.js` walks every
item in both programmes and asserts each prescribed interval parses — nothing
else in the app can see a rest that silently failed to.

**The rest timer is view state and is never stored.** It lives in `js/ui.js` as
one module-local object and dies with the page. Persisting it would mean telling
somebody who reopened the app on the bus that they have forty seconds left of a
rest they took at the gym. It is derived from `Date.now()` rather than counted in
ticks, so a throttled or backgrounded tab comes back with the right number.

`js/app.js` owns the heartbeat, because an interval is an event. It runs only
while a rest runs and stops itself the moment there is none. **The rest is
started BEFORE the store write**, and that ordering is load-bearing: the write
commits, the commit notifies the view, the view repaints — so a rest started
after it is one the screen does not learn about until something unrelated
repaints. Both stub suites were happy with it the wrong way round; a real browser
was not. `tools/wire.js` now watches what the tap's LAST paint contained.

The block is drawn once per render and then written into a field at a time by
`paintRest`. A full re-render every second would rebuild the weight and reps
inputs and take whatever the user was part-way through typing with them.
`paintRest` returns true exactly once, on the tick the rest runs out, so the
device buzzes once rather than every half-second until somebody looks at it.

**The training screen states a stopping rule, because the source material gives
none.** Sharp pain, joint pain, chest symptoms, dizziness and numbness stop the
session; performance falling while effort rises, three broken nights, an injury
that will not resolve, or loss of interest mean the block gets reassessed. That
text is the safety brief and is not decoration — if the push features are ever
extended, this is the half that has to grow with them.

**"Never miss twice" is the one moment the app used to be silent on.**
`S.missedYesterday()` fires only when yesterday broke, today is still open, and
today actually asks for something. A streak counter tells you what you have; it
never tells you that the highest-leverage day of a year is the one straight after
a miss. It is deliberately quiet on a rest day, a frozen day, a day before the
account existed, and the instant today is complete — a warning that fires when
there is nothing to fix is one people learn to ignore.

Written as a fact and a next action, never as a reprimand. Harsh self-criticism
measurably reduces follow-through: somebody who savages themselves after a missed
session abandons the gym, which is the opposite of what the line is for.

**A reward is a promise the user pays themselves, and the app pays nothing.**
`state.customRewards` is the whole of Rewards now. The eleven-milestone ladder,
the XP on each medal and the weekly chest went with the points system: a badge
for fourteen days is the app paying itself, and `knowledge/project.md` says a
reward that costs something real beats one that costs the app nothing. A reward
is earned on the BEST run the streak ever reached, so a slip afterwards cannot
revoke something already won, and collecting one records that the user actually
bought the thing.

**The tape and the scale are a RECORD, never a task.** Nothing in `state.body`
reaches `computeDayStatus`, the streak, or `historyStart`. Standing on the scales
is not a training session; a month nobody measured is not a month missed; and a
weigh-in dated before the account existed must not drag the history back and
manufacture a run of missed days behind it. There are tests in `smoke.js` and
`wire.js` that snapshot the WHOLE day-status object before and after, because the
first version compared `total` alone and sat green while `done` was sabotaged.

**One morning is not a weight.** Day-to-day swing of about a kilo is water and
food, so `weightWeeks` averages by week and `weightTrend` measures the rate
between the first and last week that actually have readings. A single morning is
a data point; the app will not call it a weight. A week with no readings is
ABSENT rather than zero — the same rule the top-set chart runs on — and one week
on the record reports `perWeek: null` rather than a rate of zero, because "no
change" and "we cannot know yet" are different answers and must not look alike.

**The tape is not pre-filled, and that is the whole difference from the set
log.** A set is confirmed as it is performed, so pre-filling from last session
helps. A tape sheet is twenty fields saved in one tap, so pre-filling would
record ten measurements nobody took. The previous reading is shown BESIDE each
field as a hint and never inside it. There is a test by name, and it fails if the
value ever moves into the box.

**A measurement of zero is not a measurement.** A field somebody tabbed through
is dropped rather than stored, and a blank CLEARS rather than being skipped, so a
mistyped reading can be taken back out. `normaliseBody` repairs a half-written
entry on every load and invents nothing, exactly as `normalisePerf` does.

**`tapeHistory` is per FIELD, not per date.** The tape is used sparsely and
unevenly — somebody who measured an arm in March and a calf in May has a first
and a latest for each. Forcing both onto one "baseline date" would either drop a
field or invent a reading for the month it was missed. A field measured once
reports `change: null`, never zero.

**Body weight carries the unit it was typed in**, exactly as a logged set does,
so switching `settings.weightUnit` re-reads the history rather than re-valuing
it. Lengths are centimetres only; offering inches without converting the stored
history would be worse than not offering it, and adding it later is additive.

**Streak freezes are earned and spent by hand.** One per 10 completed days, max
5, applied to a specific past day. A streak that shatters on one bad day teaches
people to quit; a freeze holds the chain without pretending a missed day
happened.

**The six screens are drawn from one design brief, and it is on disk.**
`Arise Redesign (standalone).html` is a design-canvas export, gitignored, in this
folder. **Read it, never merge it** — it is a 1.3MB React bundle referencing
three external origins, which is the artefact the inlining rule below is about.
Decode it with:

```js
JSON.parse(fs.readFileSync('Arise Redesign (standalone).html','utf8').split('\n')[388])
```

The system it draws: a header with a 26px-radius base on every screen, 11px
letterspaced section labels, cards with a 38px icon plate, and three colours
with fixed jobs — the accent for the live action and for anything done, the gold
for anything that pays out or is waiting on you, and ember for a block whose
subject is progress through a fixed length of time.

Ember was on three things and is on one now. The countdown header and the run
header went with the features they belonged to; **Today's strip kept it, and the
rest timer is what makes that honest.** The brief gave the strip ember for
carrying "today's next ask", which was always a stretch of the rule — a next
ask is not elapsed time. A rest countdown is the rule literally: a fixed length,
and your progress through it. If the timer is ever removed, ember has no subject
left, and the strip should go charcoal rather than keep a hue that no longer
means anything. See `knowledge/ui-guidelines.md`.

**The brief's structure survived a repaint; its colours did not.** The palette is
Plumage since 2026-08-21 — a peacock ground, jade accent, saffron gold, magenta
ember — and it adds one concept the brief has no equivalent for. See the invariant
below.

**Hue means one of two things, and the app must never let it mean both.** A
header BAND carries location: one hue per screen, and a band says which screen
you are on and nothing else. Everything else carries meaning. **No meaning hue may
be used as a band and no band hue may be promoted into a meaning** — a hue that
is both "Stats" and a state means neither. It is why the active tab is jade on
every screen rather than the band's hue: nothing but the band may claim to tell
you where you are.

The band costs the view layer nothing. `js/ui.js` already writes the route to
`#view[data-route]` for scroll restoration, so `styles.css` resolves `--band`
from that and no second source of truth exists about which screen is up. Two
things follow and both are in the stylesheet: `--surface` and `--surface-2` are
CARD colours and may not sit on a band — a chip inside a header is transparent
with a `currentColor` hairline — and `--faint` clears AA on no band in either
mode (3.59:1 on the dark teal), so a header steps it up to `--muted` for its own
subtree.

An artboard is a picture, not an authority. More's header does not claim a
last-export date, because no such timestamp exists in the state and inventing one
is a migration.

**There is no top bar.** Every screen carries its own header, so a persistent
brand bar would be a second one. The streak and days-kept chips it held are in
Today's header and on Stats, which is where they linked to.

**`index.html` is a shell. Nothing is inlined into it.** It links
`./styles.css` and the six `./js/*.js` in fixed order, plus the manifest and
icon links, and one `<meta http-equiv="Content-Security-Policy">`.

A tooling export once replaced it with a 440KB self-extracting bundle that served
`js/` and `styles.css` from `blob:` URLs decoded from a gzip payload — a snapshot
taken mid-sprint. The app ran three fixes behind the tree for as long as it was
there, and **both suites stayed green the whole time**, because they load `js/`
from disk. That is the failure mode to watch for: a bundle makes the safety net
measure code nobody runs. It also dropped the manifest and icon links (breaking
PWA install) and added a Google Fonts `preconnect` to an app whose first
constraint is that it makes no network calls. If a tool offers to inline the app
into one file, say no.

**Bump `sw.js` VERSION** after changing `styles.css`, anything in `js/`, or
anything in `fonts/`. Currently `discipline-v76`. Without it an installed copy
keeps serving the old shell.

**`fonts/` ships with the app.** Three Archivo `.woff2` cuts, split by
`unicode-range` exactly as Google Fonts serves them, referenced from
`styles.css` with local `./fonts/…` URLs and precached in `sw.js` ASSETS. A
webfont either ships with this app or is not used — there is no third option,
because there are no network calls.

**The app is fully offline.** No network calls, no accounts, no telemetry, no
secrets. If a change needs a server, stop and raise it first.

---


# Review Roles

When reviewing software use the following responsibilities.

Each role is a subagent. Invoke it by name.

Every review role follows the output contract in
`knowledge/review-conventions.md`.

| Responsibility | Subagent |
|---|---|
| UI Review | `ui-review` |
| Code Review | `code-review` |
| Engineering Manager | `engineering-manager` |
| Chief Architect | `chief-architect` |

---

# Review Workflow

Run the full review with `/review`.

Run the roles in that order.

Never skip a role.

Reviews do not implement. Fixing findings is a separate task that needs the
user's approval first.

---

# General Rules

Always explain major architectural decisions.

Always recommend the smallest safe implementation.

Never implement multiple unrelated features in one task.

Always keep the application production ready.

Never put a secret in client code. This app has none and must stay that way.
