# English Feedback

## Purpose

English Feedback is a writing-feedback PWA that stores every correction with a
category, so error *patterns* become visible over months. Correcting a piece of
writing is the means; making the learner's recurring systems visible is the end.

The goal is long-term maintainability, reliability, and clean architecture.

Never sacrifice maintainability for short-term speed.

---

# Layout

All paths in this file are relative to `english-feedback-app/`.

- `app/` — React + TypeScript + Vite PWA
  - `src/screens/` — Write, Feedback, ErrorLog, History, Settings
  - `src/components/` — ErrorBoundary, ErrorNote
  - `src/lib/` — all logic; see **Pure logic** below
  - `vite.config.ts` — PWA manifest **and** the production env guard
- `worker/` — Cloudflare Worker proxy
  - `src/index.ts` — the request handler
  - `src/policy.ts` — pure request-policy decisions (origin, key, body)
  - `wrangler.toml` — `ALLOWED_ORIGIN`, KV binding, observability
- `shared/schema.ts` — Zod feedback schema, category taxonomy, teaching prompt,
  `MODEL_ID`, `PROMPT_VERSION`. Imported by both sides.
- `tests/` — Node's built-in runner, no framework

This app has **no** `knowledge/` or `.claude/` of its own. It uses the ones at
the repository root — those describe this app. (`arise/` is the opposite: fully
self-contained. Never apply one app's standards to the other.)

---

# Development Philosophy

Always think before coding.

Prefer analysis before implementation.

Never modify unrelated files.

Never introduce unnecessary complexity.

Always preserve backward compatibility — stored user data especially, since
entries and feedback live only on the user's device and are never uploaded.

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

Always use these project references, at the repository root.

- `../knowledge/project.md` — the vision, what ships, the hard constraints
- `../knowledge/coding-standards.md` — TypeScript, React, Worker, pure logic
- `../knowledge/ui-guidelines.md`
- `../knowledge/review-conventions.md` — the vocabulary for any review

---

# Verifying

Run from `english-feedback-app/` — the repository root of this app, **not** from
`app/` or `worker/`. Never report a change as done without this.

```bash
npm run verify
```

That is `npm run check` (typechecks `app`, `worker`, and `tests` separately)
followed by `npm test` (Node's runner over `tests/*.test.ts`). `npm run build`
and `npm run deploy:worker` both run it first, deliberately — a broken build
cannot ship.

**Scripts live in two places.** `dev:app`, `dev:worker`, `verify`, `check`,
`test`, `build` and `deploy:worker` are in the root `package.json`. The
sub-packages only have `dev`, `deploy` and `check`. Running a root script from
inside `worker/` fails with `Missing script`.

Node 24 strips TypeScript types natively, which is why `tests/` needs no build
step and no test framework. Test imports must carry explicit `.ts` extensions.

## What the tests do not cover

- **The Worker's `fetch` handler.** Only `worker/src/policy.ts` is tested. The
  routing, quota charging, and Anthropic call have no automated coverage —
  testing them needs Miniflare.
- **Every React component.** There is no DOM testing library. Screens are
  verified by typecheck and by hand.

Say so out loud when a change lands in either gap.

---

# Invariants

These are the rules the app is built on. Breaking one is a Critical finding.
`../knowledge/project.md` states them as product constraints; this is the
engineering form.

**The API key never reaches the client.** Not in source, not in `[vars]`, not in
a `VITE_` variable, not in a bundled artifact. It is a Worker secret and nothing
else. `grep -ri "sk-ant" app/src` must stay empty.

**The deployed Worker is not an open proxy.** `ALLOWED_ORIGIN` is enforced
server-side and the matched origin is echoed back — never `*`. A request is fully
validated *before* it charges quota, so malformed or rejected requests cost
nothing. Optional `APP_KEY` adds a second gate; it ships in a public bundle, so
it deters abuse rather than authenticating anyone.

**An entry is never lost.** It is written to IndexedDB before any network call,
and every failure path leaves the text readable in History. A storage failure
keeps the user on the Write screen with their text still in the textarea, rather
than navigating away from unsaved writing.

**Failures are classified, and retries are bounded.** The Worker returns
`retryable` alongside every error; the client honours it. A permanent failure
(refusal, rejected request, truncation) marks the entry failed immediately. A
transient one requeues, up to `MAX_ATTEMPTS`. Rate limiting deliberately does
*not* spend the retry budget. Without this the app retried deterministic failures
on every launch and every reconnect, forever, billing each attempt.

**The category taxonomy is versioned data.** The 20 categories in
`shared/schema.ts` are stored inside every past entry. Renaming or removing one
silently rewrites history — treat any change as a migration. Each entry also
records the `modelId` and `promptVersion` it was judged under; bump
`PROMPT_VERSION` whenever `TEACHING_SYSTEM_PROMPT` changes.

**The teaching prompt is a byte-identical cached prefix.** Never interpolate
anything into it. Anything per-request or per-user belongs in the user message,
after the cached block, or prompt caching silently stops working and input cost
roughly triples.

**`max_tokens` bounds thinking *and* response.** `claude-opus-5` thinks by
default. Sizing `max_tokens` for the response alone truncates longer entries into
`stop_reason: "max_tokens"`. Truncation is reported as a *permanent* failure,
because it is deterministic for a given entry.

**A refusal is a verdict, not an outage.** `stop_reason: "refusal"` arrives on an
HTTP 200. Keep the entry, never retry it.

**Derived data is computed on read, never stored.** Error counts, the trend, and
per-category examples are recomputed from entries. They live in
`app/src/lib/stats.ts`, re-exported through `db.ts` so callers keep one import
site.

**Pure logic has no runtime browser or Worker imports.** No IndexedDB, no
`fetch`, no `import.meta.env` — type-only imports are fine, since they are
erased. This is what lets `tests/` run under bare Node with no DOM shim.
`lib/highlight.ts`, `lib/retry.ts`, `lib/failure.ts`, `lib/stats.ts` and
`worker/src/policy.ts` all obey it. Keep it that way when adding logic.

**`VITE_API_URL` is inlined at build time.** A wrong value is not a startup
error — it is baked into an installed PWA that silently fails every analysis.
`vite.config.ts` fails the build if it is missing, not `https`, or localhost. Do
not remove that guard. Local config lives in `app/.env.development`; production
in `app/.env.production` (git-ignored). **Never create `app/.env`** — a plain
`.env` applies to every mode and is exactly how localhost reached production.

**The Worker logs counts, codes, and categories — never entry text.**

---

# Review Roles

When reviewing software use the following responsibilities.

Each role is a subagent. Invoke it by name.

Every review role follows the output contract in
`../knowledge/review-conventions.md`.

| Responsibility | Subagent |
|---|---|
| UI Review | `ui-review` |
| Code Review | `code-review` |
| Engineering Manager | `engineering-manager` |
| Chief Architect | `chief-architect` |

---

# Review Workflow

Run the full review with `/review`, defined in `../.claude/commands/review.md`.
Reports are written to `../reports/`.

Run the roles in that order.

Never skip a role.

Reviews do not implement. Fixing findings is a separate task that needs the
user's approval first.

---

# Known Gaps

Current, honest state. Update this list rather than letting it rot.

- The `/review` workflow has been prepared but **never actually run** against
  this codebase.
- The Worker's `fetch` handler has no integration test (see **Verifying**).
- The bundle is ~635 KB (188 KB gzipped), dominated by Recharts. Fine behind a
  warm service worker; worth code-splitting if first load matters.
- Rate limiting is per-IP and read-then-write, so two simultaneous requests can
  overshoot by one. It caps sustained spend; it is not a security boundary.
- **The teaching prompt is hard-coded for one learner** — a native Mongolian
  speaker working as a geologist. Corrections would still be right for anyone
  else, but the "why you made this error" explanations would be confidently
  wrong. This blocks sharing the app beyond Mongolian speakers until the learner
  profile is made configurable.
- Cost per entry has not been measured since thinking became active. The old
  ~$0.023/entry figure predates it.

---

# General Rules

Always explain major architectural decisions.

Always recommend the smallest safe implementation.

Never implement multiple unrelated features in one task.

Always keep the application production ready.

Never put a secret in client code.
