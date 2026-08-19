# Discipline

## Purpose

Discipline is an offline-first personal-development tracker: goal progression,
streaks, a weekly training program, reading and journal.

The goal is long-term maintainability, reliability, and clean architecture.

Never sacrifice maintainability for short-term speed.

**The product is named Discipline; the code is still `arise`.** The rename in
2026-08 covered what the user sees — the title, the manifest, the brand mark and
every string in the app. Three things deliberately did **not** move, and moving
any of them later would be a breaking change, not a tidy-up:

- `localStorage` key `arise.state.v1` — renaming it orphans every user's goals,
  logs, streaks and journal, with no recovery. It is the one thing that must
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
  `data.js` → `program.js` → `goals.js` → `run.js` → `photos.js` → `store.js` →
  `ui.js` → `app.js`
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
- `knowledge/review-conventions.md` — the vocabulary for any review of this app

---

# Verifying

Run from `arise/`. Never report a change as done without these.

```bash
node tools/smoke.js
node tools/render.js
node tools/wire.js
```

or `npm test`, which runs both.

`smoke.js` loads `js/` into a sandbox with a fake `localStorage` and asserts the
data layer and progression engine: ladder maths, earned advancement, step-back,
streaks, freezes, the reading gate, frozen history, and every state migration.

`render.js` renders every view, every sheet and every programmed day against a
stub DOM, failing on anything that renders `undefined`, `NaN` or
`[object Object]`.

There is no typechecker. These two scripts are the whole safety net, so a change
they cannot cover needs saying so out loud.

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
starts empty; the user's goals, logs and journal do not follow. Export from
More → Export on the old origin and import on the new one before using it.

---

# Invariants

These are the rules the app is built on. Breaking one is a Critical finding.
`knowledge/project.md` states them as product constraints; this is the
engineering form.

**A day you have lived is never re-judged.** Every goal entry stores the target
it was judged against, every day's log freezes its own exercise list, and every
goal keeps a `scheduleHistory`, an `activeHistory` (when it was paused) and a
`baselineHistory` (which baseline it ran from). Editing a goal, switching
difficulty, moving a baseline, pausing it or changing a schedule must never reach
back and change what a past day meant. Resolve a past day from those dated
histories, never from the goal's current value — see
`knowledge/coding-standards.md`.

**Day status is derived, never stored.** Every number is recomputed from the
logs, so nothing can drift out of sync. This is why `commit()` must stay O(1),
why the best-streak high-water mark is maintained on read, and why day status and
goal timelines are memoised per revision.

**State is local and versioned.** Everything lives in `localStorage` under
`arise.state.v1`, described by `STATE_VERSION` in `js/store.js`. Every migration
must be additive and must tolerate state written by an older version. Never
delete or overwrite user data in a migration; a one-time change must be guarded
by its own flag, not by the version number alone. Read an incoming flag before
merging seed defaults over it, or the default will mask the real value.

`arise.state.v1.unreadable` is the one deliberate exception to the single-key
rule. It is a lifeboat, not state: nothing in the normal read path touches it. It
holds the raw bytes of a state that failed to parse, written once and verified by
read-back, so that seeding a fresh start can never be the thing that destroys the
user's only copy. If that copy cannot be made, `store.js` blocks writes instead.

**Escape all user text.** Goal, exercise and habit names and journal text are
user-controlled. Everything reaching `innerHTML` goes through `esc()` — toasts
included, not just views.

**Adding a `js/` file touches four places.** `index.html`, `sw.js` ASSETS, and
the load lists in `tools/smoke.js` and `tools/render.js`.
`tools/package.js` cross-checks the first two against each other, so a file the
shell loads but the worker never precaches fails the build instead of vanishing
the first time the user is offline.

**A render never writes.** `renderRun` called the store's check-in, which is a
write during a render *and* a hang: `commit` notifies the view, the view
re-renders, the render checks in again — and softening does not change the logs,
so `needsIntervention` never clears. It froze the Run screen for exactly the user
the check-in exists to help. The daily check-in is an event owned by `js/app.js`
(boot and the day rollover), guarded to once a day; a render reads
`run.lastPatchDay` and calls `A.Run.recommend`, both pure. `tools/render.js`
asserts the store is byte-identical across two renders of every run state.

**A run day counts toward the streak, from its record and never from the
programme.** `computeDayStatus` reads `run.log[day]` — the entries frozen when
that day opened — so easing a habit in week five cannot change what week two was
scored out of. Re-deriving it from the run as it stands demotes a complete day to
a partial one, which `tools/smoke.js` asserts by name. A day with no run record
contributes nothing, deliberately: a day the user never opened the app on is one
we know nothing about, and must not become a day the run retroactively decided
they failed. The daily check-in opens today's record, so *tapping* the run is
never worse than ignoring it. `runCountsTowardDay` turns it off, the way
`goalsCountTowardDay` does.

**One function owns what today asks.** The app has two answers to that question:
the screens draw the day from the programme (`A.Run.runDay` → `activeOn`) and
every score reads the record (`runEntriesOn` → `computeDayStatus`). `runCheckIn`
freezes the record when the day opens, so any edit made after that opens a gap,
and each gap was its own bug — a removed habit left a row nothing could tick and
the day could never be completed; an edited checklist changed nothing until
tomorrow. `store.reconcileToday()` is the single owner: membership from the
programme, the ask from the record wherever it already has one, rows for habits
no longer live today dropped. Every run-editing verb goes through it. It reads
`runToday()` itself and can touch no other day, which is what keeps the
frozen-history rule a rule rather than a comment — there is a test by that name.

**A run habit must be the only place a thing is tracked.** Eleven were removed
in 2026-08 — `read`, `meditate`, `deep_work`, `water`, `sleep_window`,
`pushups`, `squats`, `plank`, `run`, `strength` and `journal` — because each
repeated a seed goal, a daily habit, an exercise in the weekly plan or the
journal itself, and Today was showing the same commitment up to three times with
three separate ticks. The catalog is fourteen habits now and holds what nothing
else does: skincare, vitamins, floss, brush teeth, cold finish, daylight,
screens-off, walk, mobility, stretch, language, course, write. Shrinking it was safe
only because an unknown id is already a designed state — a stored run keeps the
habit, hides it from the day, and the run screen says so.

**A custom run habit carries its own definition, on its own entry.** The catalog
is still closed and still the default; a habit the user writes is not added to
it. It lives on the run habit entry as `custom: { name, unit, start, target,
step, min, friction }`, with an id prefixed `c_`, so it exists inside that run
and nowhere else and nothing outside can reference it. That shape is why it cost
almost nothing: every function in `run.js` already received the entry it was
working on and only ever asked the catalog for the definition behind it, so one
resolver — `defOf(p)` — serves both. Use `defOf(entry)` when you have the entry
and `habitIn(run, id)` when you only have an id; plain `habit(id)` is the
catalog and cannot see a custom habit.

**A run can be built from habits the catalog does not have, and that route has
to be on the START screen.** The catalog is fourteen and closed, so writing your
own is the only way a run holds anything else — and for a long time
`run-custom-open` appeared in exactly one place, the mid-run "Add a habit" sheet.
The one screen where the user decides what their 66 days will be was the one
screen that could not reach it, and it does not even fix itself afterwards: a
habit added to a live run cannot begin before day two, because `legalStartDays`
counts from `today + 1`. Written on the start screen it begins on day one.

Before a run exists there is nothing to add a habit TO, so the picker holds them
as drafts — `UI.draftCustoms`, the same shape of answer `draftItems` already
gives for checklists — and `startRun` places them after `buildRun`, which takes
catalog ids only and `filter(isCatalogId)`s anything else. Each is offered to the
run one at a time through `firstLegalStart(run, entry, 0)`; one that does not fit
is DROPPED and named in the toast, never squeezed in, which is the contract
`buildRun` already had for a selection too big for the budget.

`S.takeRunRefusals()` carries that report, and it is module-local rather than on
`state`: it describes one start, not the run it produced, and anything put on
`state` is persisted, exported and migrated forever.

**Asking where one more habit fits is a binary search, not a scan.**
`firstLegalStart` answers "the earliest day this run could take this habit", and
three callers use it — the add-habit sheet, `runAddHabit` and
`runAddCustomHabit`. It binary-searches the legal start days because feasibility
is *monotone* in the start day: every rule `validate` can fail on is either
indifferent to the start day or improved by moving it later. The argument is
written out in full above the function, and `tools/smoke.js` asserts the search
agrees with a linear scan for every catalog habit at four budgets — the argument
is why it is correct, the test is what keeps it true. If you add a rule to
`validate` that a *later* start day can make worse, that test is the one that
will catch you, and the search has to go.

It replaced a linear scan in all three places. The sheet ran one per candidate
habit, so opening it cost 220-390 full validations — 160-270ms in desktop Node
and several times that on a phone — and the slowest case was "no room left in
this run", because nothing short-circuited it. That case is one validation now.

**The guarantee is kept by validating the definition, not the id.** A closed
catalog used to be what stopped `doseOn` producing NaN on day 41. A custom habit
is checked when it is written — name, positive step, target not below start,
finite numbers — and the whole 66 days are walked before it is stored. A
definition that later becomes corrupt is reported as `unknown_habit` and hidden
from the day, exactly like a retired catalog id, rather than rendered.

**The built-in programme reaches an existing account by a tap, never by a
migration.** `js/program.js` holds the library and `PROGRAM_WEEK`, and
`installProgram` runs **exactly once per account**, guarded by
`meta.programInstalled`. That guard is load-bearing: installing replaces
`state.plan` outright, and doing that from a migration would throw away a week
the user had built by hand. So editing `PROGRAM_WEEK` reaches a fresh install and
nobody else, and the way it reaches everybody else is `S.reinstallProgram()`,
behind the confirm on Plan → Training week. The sheet states what goes and what
stays, because both halves matter: the library is additive and nothing is ever
deleted from it, and no logged day moves, since `ensureLog` freezes each day's
exercise list into that day's log the first time it is touched.

`programPlan` resolves each week entry **by name** and `.filter(Boolean)`s what
it cannot find, so one typo in `PROGRAM_WEEK` drops that lift out of the day in
silence — no error, no empty row, just a session one exercise shorter than the
programme says. `tools/smoke.js` asserts every name resolves and that each day's
item count survives into the plan; nothing else in the app can see it.

The programme itself is Context 1 (SITE, dumbbells only): Mon Upper A, Tue
Lower A, Wed rest, Thu Upper B, Fri Lower B, Sat accessory, Sun rest. Day 1 is
read as Monday — nothing in the programme names a weekday and the app stores a
plan per weekday, so the two had to be pinned together somewhere. A plan item's
`note` carries the **prescription** (reps per side, the RIR target, the rest
interval, any tempo); the exercise's `how` carries the **technique**. A cue is
true every time you do the lift, an RIR target is true on this day of this
programme, so they do not live in the same field.

**One commitment, one tick, one place — and a habit crosses to a goal by
moving.** The app tracks daily things in three shapes: a **daily habit** is a
tick that asks the same thing forever; a **goal** ramps from a baseline the user
set to a target they chose and earns each step by *performing*; a **run habit**
ramps on the *calendar* across a fixed 66 days. `S.habitToGoal` turns the first
into the second, because "make this progress slowly, step by step" is what the
goals engine already is.

It is a MOVE, not a copy: the habit is removed in the same commit that creates
the goal. A thing tracked in two places is a thing ticked twice on Today, which
is the duplication the run's catalog was cut from twenty-five habits to fourteen
to remove. The conversion opens the goal editor rather than converting on the tap
— a habit carries no baseline, target or step, and only the user knows where they
actually are today, so the numbers are asked for rather than invented.

Nothing already lived moves: `dayHabits` returns `log.habits` for any day that
has a log, so a day already opened keeps the habit list it froze and is scored
out of the same total. The undo restores the habit under its **own id**;
`addHabit` would mint a new one and every tick already recorded against the old
id would stop belonging to it, with nothing to report that.

What this does NOT do is join the run to anything. The run keeps its closed
catalog and shares no data with goals — see below. Nothing stops a user creating
a goal and a run habit for the same commitment by hand; that is still the rule
above, enforced by the catalog being small rather than by name-matching, which
would fire wrongly.

**A goal can be brought INTO a run, and the bridge lives in the store.** The one
place the two systems meet is `S.runCandidateGoals()`, and it is in `js/store.js`
rather than in either engine on purpose: "the run and the goals share nothing" is
an invariant about those two modules, and the store is the one thing that already
owns both. Neither learns about the other.

Two rules decide what can cross, and both come from the run engine rather than
from taste. A run's dose only ever RISES toward its target — `doseOn` clamps
upward and `validate` enforces `dose_monotonic` — so a ladder that counts down
cannot exist in a run at all; that rules out every "less than" goal, unhappily
including the two a 66-day run looks most made for, an earlier wake-up and an
earlier bedtime. And a clock reading is not a dose: "06:15" is a point in the
day, not an amount you can do more of, so a `time` goal has no ramp to walk.
Ineligible goals are LISTED WITH THEIR REASON rather than hidden, the same way
the add-habit sheet shows a habit with no legal day left.

A goal carries no minutes cost, and the budget check is built on one. It is asked
for rather than invented — the form asks the answerable form of the question,
"minutes a day once you reach the target", and divides. That field also fixed the
hand-written custom habit, which hardcoded one minute per unit: right for a habit
measured in minutes, wrong for one measured in reps.

**A goal the run takes over is PAUSED, in the same commit that starts the run.**
Leaving it active puts the same commitment on Today twice — a goal row and a run
row, two ticks for one act — which is the duplication the catalog was halved to
remove. Paused, never deleted: everything already earned stays, `activeHistory`
records the day it stopped so no past day is re-judged, and Plan's Paused section
resumes it with one tap. A goal whose habit did NOT fit the budget is left
running, because the run never took it.

**The run and the goals share nothing.** `js/run.js` is a port of the
`life-reset` Python engine and sits beside `js/goals.js`: a goal ramps a target
the user chose from a baseline they set and earns each step by performing; a run
picks from a closed 14-habit catalog, ramps on the calendar, and is
feasible-by-construction on all 66 days. Neither reads the other's data, a user
may have both, and merging them would mean migrating every custom goal onto a
catalog id it does not have.


**The six screens are drawn from one design brief, and it is on disk.**
`Arise Redesign (standalone).html` is a design-canvas export, gitignored, in this
folder. It unpacks to eight artboards: `1a`/`1b`/`1c` are three directions for
Today and `2a`–`2e` are Plan, Read, Stats, Rewards and More. The app is `1c` plus
`2a`–`2e`. **Read it, never merge it** — it is a 1.3MB React bundle referencing
three external origins, which is the artefact the inlining rule below is about.
Decode it with:

```js
JSON.parse(fs.readFileSync('Arise Redesign (standalone).html','utf8').split('\n')[388])
```

The system it draws: a charcoal header with a 26px-radius base on every screen,
11px letterspaced section labels, cards with a 38px icon plate, and three colours
with fixed jobs — teal for the live action and for anything done, amber for
anything that pays out or is waiting on you, and **ember for a block whose
subject is progress through a fixed length of time, and for nothing else**. Ember
is on exactly three things: Today's header while a countdown runs, the strip
carrying today's next ask, and the run screen's header. See
`knowledge/ui-guidelines.md`.

An artboard is a picture, not an authority. Two of its decisions were not taken,
and both are written down where they were made: the value column keeps its
direction in words (`targetPhrase`), because a bare "4 h" does not say which side
of four hours you want; and More's header does not claim a last-export date,
because no such timestamp exists in the state and inventing one is a migration.

**There is no top bar.** Every screen carries its own header, so a persistent
brand bar would be a second one. The streak and days-kept chips it held are in
Today's header and on Stats, which is where they linked to.

**`index.html` is a shell. Nothing is inlined into it.** It links
`./styles.css` and the eight `./js/*.js` in fixed order, plus the manifest and
icon links, and one `<meta http-equiv="Content-Security-Policy">`.

A tooling export once replaced it with a 440KB self-extracting
bundle that served `js/` and `styles.css` from `blob:` URLs decoded from a gzip
payload — a snapshot taken mid-sprint. The app ran three fixes behind the tree
for as long as it was there, and **both suites stayed green the whole time**,
because they load `js/` from disk. That is the failure mode to watch for: a
bundle makes the safety net measure code nobody runs. It also dropped the
manifest and icon links (breaking PWA install) and added a Google Fonts
`preconnect` to an app whose first constraint is that it makes no network calls.
If a tool offers to inline the app into one file, say no.

**Bump `sw.js` VERSION** after changing `styles.css`, anything in `js/`, or
anything in `fonts/`. Currently `discipline-v62`. Without it an installed copy keeps
serving the old shell.

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
