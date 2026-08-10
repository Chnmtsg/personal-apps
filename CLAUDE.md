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

Both are live codebases and they share nothing. Never couple them, and never
apply one app's standards to the other. When a request does not name an app,
assume `english-feedback-app` — but ask if the work would be costly to redo.

- `knowledge/` — project references for `english-feedback-app`.

- `arise/knowledge/` — project references for `arise`.

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

**The service worker caches the shell.** After changing `styles.css` or anything
in `js/`, bump `VERSION` in `sw.js`. Without it an installed copy keeps serving
the old assets.

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
