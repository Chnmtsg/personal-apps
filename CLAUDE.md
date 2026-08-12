# Apps

## Purpose

This repository holds small, self-contained personal applications.

The goal is long-term maintainability, reliability, and clean architecture.

Never sacrifice maintainability for short-term speed.

---

# Repository Layout

All paths in this file are relative to the repository root.

- `english-feedback-app/` — **the active application.** English writing feedback
  PWA (React + TypeScript + Vite) with a Cloudflare Worker proxy that holds the
  Anthropic API key. See `english-feedback-app/CLAUDE.md` — the working guide
  for that app, carrying its layout, invariants and known gaps — and its
  `README.md` for setup and deployment.

- `arise/` — a separate personal-development tracker PWA: goal progression,
  streaks, a weekly training program, reading and journal. Vanilla HTML/CSS/JS,
  no build step, no server, no account. `arise/` is self-contained: it has its
  own `CLAUDE.md`, knowledge set and `.claude/`. See `arise/README.md`.
  **The app is called Discipline; the folder, the `window.Arise` globals and the
  `arise.state.v1` storage key keep the old name deliberately** — renaming the
  storage key would orphan every user's data. See `arise/CLAUDE.md`.

- `life-reset/` — a Python engine for a 66-day habit programme: a closed habit
  catalog, a deterministic ramp, and validate/repair that makes any Architect
  output feasible. Not an app and not a PWA — a library with demos and no UI.
  See `life-reset/CLAUDE.md` and `life-reset/STATUS.md`, which records what is
  built against a specification (`README.md`, `AGENTS.md`) that describes more.

**Three live codebases. They share nothing.** Never couple them, never apply one
project's standards to another, and never let a change in one reach into
another's directory. When a request does not name a project, infer it from what
was last worked on and **say which you assumed** — do not silently pick. Ask
outright if guessing wrong would be costly to redo.

- `knowledge/` — project references for `english-feedback-app`.

- `arise/knowledge/` — project references for `arise`.

- `life-reset/` has no knowledge set. Its `README.md` and `AGENTS.md` are a
  *specification written before the code*, so read them as intent, not as a
  description of what exists — `STATUS.md` is the honest inventory.

- `.claude/agents/` — the four review role definitions

- `.claude/commands/` — workflow definitions

- `reports/` — generated review reports, overwritten by each `/review` run

---

# Development Philosophy

Always think before coding.

Prefer analysis before implementation.

Never modify unrelated files.

Never introduce unnecessary complexity.

Always preserve backward compatibility — stored user data especially. In both
apps the user's data lives only on their device and is never uploaded, so a
careless migration is the one mistake with no recovery.

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

Each application has its own references. Read the set that belongs to the app you
are changing, and never apply one app's standards to the other.

For `english-feedback-app` — see also `english-feedback-app/CLAUDE.md`, which is
the working guide for that app:

- `knowledge/project.md` — the vision, hard constraints, and the model behaviour
  that constrains the code
- `knowledge/coding-standards.md` — TypeScript, React, Worker, pure logic
- `knowledge/ui-guidelines.md`
- `knowledge/review-conventions.md`

For `arise` — see also `arise/CLAUDE.md`, which is the working guide for that app:

- `arise/knowledge/project.md` — what the app is for, the three rules, hard constraints
- `arise/knowledge/coding-standards.md` — vanilla JS, layers, migrations, tests
- `arise/knowledge/ui-guidelines.md`
- `arise/knowledge/review-conventions.md`

The two review-conventions files share a format but score against different
standards. Use the one belonging to the app under review.

---

# Verifying `english-feedback-app`

Run from `english-feedback-app/` — **not** from `app/` or `worker/`, where the
root scripts do not exist. Never report a change as done without this.

```bash
npm run verify
```

That typechecks `app`, `worker` and `tests`, then runs the test suite.
`npm run build` and `npm run deploy:worker` both run it first, so a broken build
cannot ship.

The suite covers the pure logic only — retry policy, statistics, text matching
and the Worker's request policy. The Worker's `fetch` handler and every React
component are uncovered; say so out loud when a change lands there.

Full detail, and the invariants for this app, are in
`english-feedback-app/CLAUDE.md`.

---

# Verifying `arise`

Run from `arise/`. Never report a change as done without these.

```bash
node tools/smoke.js
node tools/render.js
```

`smoke.js` loads `js/` into a sandbox with a fake `localStorage` and asserts the
data layer and progression engine: ladder maths, earned advancement, step-back,
streaks, freezes, the reading gate, frozen history, and every state migration.

`render.js` renders every view, every sheet and every programmed day against a
stub DOM. It fails on anything that renders `undefined`, `NaN` or
`[object Object]`.

There is no build step and no typechecker. These two scripts are the whole
safety net, so a change that cannot be covered by them needs saying so out loud.

Two things the suites cannot catch.

- `render.js` uses a hand-rolled stub DOM. `document.activeElement`,
  `document.contains`, `getClientRects` and `isConnected` do not exist on it.
  Guard any new DOM API so the stub degrades instead of throwing.
- Neither suite loads `js/app.js`, so click routing and event wiring have no
  automated coverage. Drive those by hand in a browser.

Serve over `http://`, never `file://` — service workers and install are blocked
on `file://`.

```bash
serve.cmd          # http://localhost:8123
```

---

# Verifying `life-reset`

Run from `life-reset/`. All three run on a bare interpreter — no key, no
network, no third-party packages.

```bash
python tests.py            # unit tests, the layer the harness cannot cover
python eval_harness.py     # 2,000 synthetic users x 66 days, 12 hostile Architects
python demo_program.py     # end to end, offline
```

**Run both `tests.py` and `eval_harness.py`. They catch different things, and
the harness alone is not a safety net.** The harness verifies `dose_for` by
calling `dose_for` — its checks are built from the same primitives as the code
under test, so an arithmetic error is simply consistent with itself. A wrong
dose once survived ~165,000 day-renders reporting zero violations. `tests.py`
computes expected values from the catalog directly, as an independent oracle.

---

# `arise` Invariants

These are the rules the app is built on. Breaking one is a Critical finding.

**A day you have lived is never re-judged.** Completed days stay completed. Each
goal entry stores the target it was judged against, each day's log freezes its
own exercise list, and each goal keeps a `scheduleHistory`. Editing a goal,
switching difficulty, moving a baseline or changing a schedule must never reach
back and change what a past day meant.

**Day status is derived, never stored.** Every number is recomputed from the
logs, so nothing can drift out of sync. This is why `commit()` must stay O(1)
and why day status and goal timelines are memoised per revision.

**State is local and versioned.** Everything lives in `localStorage` under
`arise.state.v1`, described by `STATE_VERSION` in `js/store.js`. Every migration
must be additive and must tolerate state written by an older version. Never
delete or overwrite user data in a migration; a one-time change must be guarded
by its own flag, not by the version number alone.

**Load order is fixed.** `js/` files are classic scripts hanging off
`window.Arise` / `window.Store` / `window.UI`, loaded in this order:
`data.js` → `program.js` → `goals.js` → `store.js` → `ui.js` → `app.js`.
A new file must be added to `index.html`, `sw.js` ASSETS, and both test
harnesses' load lists.

**`index.html` is a shell, and nothing may be inlined into it.** It links
`./styles.css` and the six `./js/*.js`, and that is all. A tooling export once
replaced it with a 440KB self-extracting bundle serving `js/` from `blob:` URLs
built from a stale snapshot: the app silently ran code three fixes behind the
tree while **both suites passed**, because they load `js/` from disk. If a tool
offers to inline the app into one file, the answer is no. A design change
belongs in `styles.css` and `js/ui.js`, where the suites and the next reader can
both see it.

**The service worker caches the shell.** After changing `styles.css`, anything
in `js/`, or anything in `fonts/`, bump `VERSION` in `sw.js` (currently
`discipline-v26`). Without it an installed copy keeps serving the old assets.
`fonts/` holds three Archivo `.woff2` cuts, split by `unicode-range` and
precached in `sw.js` ASSETS — the app ships its typeface rather than fetching
one, because it makes no network calls.

**The app is fully offline.** No network calls, no accounts, no telemetry, no
secrets. If a change needs a server, stop and raise it first.

---

# Review Roles

When reviewing software use the following responsibilities.

Each role is a subagent. Invoke it by name.

Every review role follows the shared output contract in
`knowledge/review-conventions.md` — or `arise/knowledge/review-conventions.md`
when `arise` is the app under review.

| Responsibility | Subagent |
|---|---|
| UI Review | `ui-review` |
| Code Review | `code-review` |
| Engineering Manager | `engineering-manager` |
| Chief Architect | `chief-architect` |

---

# Review Workflow

Run the full review with `/review`.

The workflow is defined in `.claude/commands/review.md`.

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

Never put a secret in client code. `arise` has none and must stay that way; in
`english-feedback-app` the Anthropic API key belongs to the Worker and must
never appear in client code or in `[vars]`.
