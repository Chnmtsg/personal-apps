# Apps

## Purpose

This repository holds **Discipline** — an offline-first training log. A weekly
training plan, and a record of every set you actually did: the exercise, the
weight, the reps, and what it was last time. Vanilla HTML/CSS/JS, no build step,
no server, no account.

It was a personal-development tracker until 2026-09 — goals, reading, a journal,
a 66-day habit run, XP and a rank ladder. All of that was removed at the user's
request in favour of one subject done properly. **Nothing was deleted from
anybody's stored data**: the app stopped reading those keys, it did not drop
them. See the invariants in `arise/CLAUDE.md`.

The goal is long-term maintainability, reliability, and clean architecture.

Never sacrifice maintainability for short-term speed.

---

# Repository Layout

```
arise/          the application — see arise/CLAUDE.md
reports/        HANDOFF.md, the map for whoever picks this up next
.github/        the Pages workflow — tests, packages and publishes on push
.claude/        launch config
```

**`arise/` is self-contained.** It carries its own `CLAUDE.md`, its own
`knowledge/` set and its own `.claude/` review roles, and those are the files to
read before changing anything. This file exists only to point at them.

**The app is called Discipline; the folder is called `arise`.** So are the
`window.Arise` globals and the `arise.state.v1` storage key. That is deliberate
and permanent — renaming the storage key would orphan every user's plan, logs,
sets and streaks, with no recovery. See `arise/CLAUDE.md`.

## What used to be here

`where-am-i/` lived here briefly in 2026-08 — a goal *measurement* PWA that
refuses to store a goal until it has been converted into numbers. It was split
out at the user's request into its own repository, which is where any work on it
belongs now:

- **https://github.com/Chnmtsg/where-am-i** — published at
  https://chnmtsg.github.io/where-am-i/

It shared nothing with `arise/` — no code, no storage, no build — which is what
made the split clean. The commit that added it and the commit that removed it
are both on `master`. Do not restore it here.

This repository also held two older projects, deleted in 2026-08 at the user's
request: `english-feedback-app/` (a React + Vite writing-feedback PWA with a
Cloudflare Worker proxy) and `life-reset/` (a Python engine for a 66-day habit
programme), along with the `knowledge/` set and review reports that belonged to
the first.

**Neither is lost.** Both are in this repository's history, on `master`, and
pushed. To bring one back:

```bash
git log --oneline --diff-filter=D -- english-feedback-app | head -1
git checkout <that-commit>~1 -- english-feedback-app
```

`arise/js/run.js` was a port of the `life-reset` engine. It was deleted in
2026-09 with the 66-day run, and is recoverable from history the same way.

---

# Development Philosophy

Always think before coding.

Prefer analysis before implementation.

Never modify unrelated files.

Never introduce unnecessary complexity.

Always preserve backward compatibility — stored user data especially. The user's
data lives only on their device and is never uploaded, so a careless migration is
the one mistake with no recovery.

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

All of it lives under `arise/`:

- `arise/CLAUDE.md` — the working guide, and the invariants
- `arise/knowledge/project.md` — what the app is for, and its hard constraints
- `arise/knowledge/coding-standards.md` — vanilla JS, layers, migrations, tests
- `arise/knowledge/ui-guidelines.md`
- `arise/knowledge/colour-direction-plumage.md` — the palette decision record
- `arise/knowledge/review-conventions.md`

---

# Publishing

Live at **https://chnmtsg.github.io/personal-apps/**, deployed by
`.github/workflows/pages.yml` on every push to `master`. It runs the three
suites and `tools/package.js` first, so a broken package cannot reach the site.
Netlify was dropped in 2026-08.

**Each origin is its own storage.** Data on `localhost:8123` does not follow the
app to the published URL — `localStorage` is per-origin. Export from More →
Export on the old origin and Import on the new one.

---

# Verifying

Run from `arise/`. Never report a change as done without these.

```bash
npm test          # smoke.js, render.js, wire.js
npm run package   # → dist/, exits non-zero if the package is unshippable
```

`smoke.js` loads `js/` into a sandbox with a fake `localStorage` and asserts the
data layer and the set log. `render.js` renders every view and sheet against a
stub DOM, failing on anything that renders `undefined`, `NaN` or
`[object Object]`. `wire.js` drives `js/app.js` through its real click router,
because neither of the others loads that file at all.

There is no build step and no typechecker. These three scripts are the whole
safety net, so a change they cannot cover needs saying so out loud.

Serve over `http://`, never `file://`, and use `serve.cmd` rather than
`python -m http.server` — the latter sends no cache headers, so the browser
caches `sw.js` and never notices a new build.

```bash
serve.cmd          # http://localhost:8123
```

Full detail, and the invariants, are in `arise/CLAUDE.md`.

---

# Review Roles

| Responsibility | Subagent |
|---|---|
| UI Review | `ui-review` |
| Code Review | `code-review` |
| Engineering Manager | `engineering-manager` |
| Chief Architect | `chief-architect` |

Defined in `arise/.claude/agents/`. Run the full review with `/review`, in that
order, never skipping a role. Reviews do not implement — fixing findings is a
separate task that needs the user's approval first.

---

# General Rules

Always explain major architectural decisions.

Always recommend the smallest safe implementation.

Never implement multiple unrelated features in one task.

Always keep the application production ready.

Never put a secret in client code. This app has none and must stay that way.
