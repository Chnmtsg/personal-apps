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
  `data.js` → `program.js` → `goals.js` → `run.js` → `store.js` → `ui.js` → `app.js`
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
- `index.html` still links six `js/` files and carries no inline script, which
  is the 440KB self-extracting bundle caught by the one place that can see it.

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

**The run and the goals share nothing.** `js/run.js` is a port of the
`life-reset` Python engine and sits beside `js/goals.js`: a goal ramps a target
the user chose from a baseline they set and earns each step by performing; a run
picks from a closed 14-habit catalog, ramps on the calendar, and is
feasible-by-construction on all 66 days. Neither reads the other's data, a user
may have both, and merging them would mean migrating every custom goal onto a
catalog id it does not have.


**`index.html` is a shell. Nothing is inlined into it.** It links
`./styles.css` and the six `./js/*.js` in fixed order, plus the manifest and
icon links. A tooling export once replaced it with a 440KB self-extracting
bundle that served `js/` and `styles.css` from `blob:` URLs decoded from a gzip
payload — a snapshot taken mid-sprint. The app ran three fixes behind the tree
for as long as it was there, and **both suites stayed green the whole time**,
because they load `js/` from disk. That is the failure mode to watch for: a
bundle makes the safety net measure code nobody runs. It also dropped the
manifest and icon links (breaking PWA install) and added a Google Fonts
`preconnect` to an app whose first constraint is that it makes no network calls.
If a tool offers to inline the app into one file, say no.

**Bump `sw.js` VERSION** after changing `styles.css`, anything in `js/`, or
anything in `fonts/`. Currently `discipline-v48`. Without it an installed copy keeps
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
