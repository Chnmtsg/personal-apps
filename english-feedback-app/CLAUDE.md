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
  - `src/components/` — ErrorBoundary, ErrorNote, EditSpan (a before/after
    pair, handling the empty-`original`/empty-`corrected` edge cases a
    diff-derived edit can have)
  - `src/lib/` — all logic; see **Pure logic** below
  - `vite.config.ts` — PWA manifest **and** the production env guard
- `worker/` — Cloudflare Worker proxy
  - `src/index.ts` — the request handler
  - `src/pipeline.ts` — orchestrates the analysis pipeline: corrector →
    (diff, in code) → synthesize, with a coach reply in parallel. Not pure —
    same untested-fetch-handler gap as `index.ts`, see Known Gaps.
  - `src/diff.ts` — pure word-level diff (LCS-based; Node has no `difflib`).
    This is what makes a correction's `original`/`corrected` text provably
    correct, computed from the two texts rather than asserted by a model.
  - `src/sentences.ts` — pure sentence splitting and reassembly.
  - `src/policy.ts` — pure request-policy decisions (origin, key, body,
    including the client-supplied `history` field)
  - `wrangler.toml` — `ALLOWED_ORIGIN`, KV binding, observability
- `shared/schema.ts` — Zod feedback schema, category taxonomy, the pipeline's
  system prompts (`CORRECTOR_SYSTEM_PROMPT`, `SYNTHESIZE_SYSTEM_PROMPT`,
  `COACH_SYSTEM_PROMPT`), `MODEL_ID`, `PROMPT_VERSION`. Imported by both sides.
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
`PROMPT_VERSION` whenever a pipeline system prompt changes.

**A correction's `original`/`corrected` text is computed, never asserted.**
`worker/src/diff.ts` diffs the corrector's output against the submitted text;
the model is only ever asked to label a span the diff already found, never to
invent one. This is what replaced the old design's exact-substring risk (the
client's `FeedbackSchema` substring check in `api.ts` is now a regression
guard, not an active risk).

**Every system prompt is a byte-identical cached prefix.** `CORRECTOR_SYSTEM_PROMPT`,
`SYNTHESIZE_SYSTEM_PROMPT`, and `COACH_SYSTEM_PROMPT` each get their own cache
entry. Never interpolate anything into any of them. Anything per-request or
per-user (the entry text, the diffed edits, the learner's recurring
categories) belongs in the user message, after the cached block, or prompt
caching silently stops working for that call and its input cost roughly
triples.

**`max_tokens` bounds thinking *and* response, for every call.** `claude-opus-5`
thinks by default. Sizing `max_tokens` for the response alone truncates a call
into `stop_reason: "max_tokens"`. Truncation is reported as a *permanent*
failure for the whole entry, because it is deterministic for a given call.

**A refusal is a verdict, not an outage.** `stop_reason: "refusal"` arrives on an
HTTP 200. Keep the entry, never retry it. A refusal from the corrector or
synthesize call fails the whole entry, since `corrections`/`scores`/etc. are
required fields; a refusal from the coach call degrades to an absent
`coach_reply` instead, since it's the one optional field and needs only the
raw text — losing it isn't worth discarding grammar teaching that already
succeeded.

**Derived data is computed on read, never stored.** Error counts, the trend, and
per-category examples are recomputed from entries. They live in
`app/src/lib/stats.ts`, re-exported through `db.ts` so callers keep one import
site.

**Pure logic has no runtime browser or Worker imports.** No IndexedDB, no
`fetch`, no `import.meta.env` — type-only imports are fine, since they are
erased. A *value* import from `shared/schema.ts` (not `import type`) needs an
explicit `.ts` extension so Node's runtime resolves it directly, which is why
`allowImportingTsExtensions` is on in `app/` and `worker/`'s tsconfigs — see
`worker/src/policy.ts`'s import of `countWords`/`MIN_WORDS` for the pattern.
This is what lets `tests/` run under bare Node with no DOM shim.
`lib/highlight.ts`, `lib/retry.ts`, `lib/failure.ts`, `lib/stats.ts`,
`worker/src/policy.ts`, `worker/src/diff.ts` and `worker/src/sentences.ts` all
obey it. Keep it that way when adding logic.

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
  `worker/src/pipeline.ts` — the orchestration of up to 5 Anthropic calls per
  entry — shares this gap; only the pure pieces it calls (`diff.ts`,
  `sentences.ts`, `policy.ts`) are tested.
- The bundle is ~635 KB (188 KB gzipped), dominated by Recharts. Fine behind a
  warm service worker; worth code-splitting if first load matters.
- Rate limiting is per-IP and read-then-write, so two simultaneous requests can
  overshoot by one. It caps sustained spend; it is not a security boundary.
- **The teaching prompt is hard-coded for one learner** — a native Mongolian
  speaker working as a geologist. Corrections would still be right for anyone
  else, but the "why you made this error" explanations would be confidently
  wrong. This blocks sharing the app beyond Mongolian speakers until the learner
  profile is made configurable.
- **Cost and latency for the multi-call pipeline are unmeasured.** The old
  ~$0.023/entry figure predates thinking being active and predates this
  pipeline entirely — it's now a real over-estimate in one direction (each
  call's prompt is narrower than the old monolithic one) and an under-estimate
  in another (2–5 calls instead of 1). Measure real entries before relying on
  a number. `app/src/lib/api.ts`'s client timeout (540s) was sized from the
  Worker's per-call timeout × the theoretical worst case, not from
  observation — if real latency runs much lower, both are worth tightening.
- **The corrector's over-rewrite threshold (`MAX_REWRITE_RATIO = 0.45` in
  `worker/src/diff.ts`) is untuned against this learner's actual writing.** At
  IELTS 4.0–4.5, a legitimately dense entry could need close to half its words
  touched — watch whether the retry-with-a-hint path fires often in practice,
  which would mean the threshold is miscalibrated rather than the correction
  being wrong.
- **Every pipeline call uses `MODEL_ID` (`claude-opus-5`).** The narrower
  calls (labelling an edit, the coach reply) likely don't need its full
  reasoning power. Worth splitting into a cheaper/faster tier once real cost
  is measured — deliberately not done in this pass, see the working notes on
  this change.

---

# General Rules

Always explain major architectural decisions.

Always recommend the smallest safe implementation.

Never implement multiple unrelated features in one task.

Always keep the application production ready.

Never put a secret in client code.
