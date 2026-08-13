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
  - `src/index.css` — the design tokens. The palette is ink on warm paper with
    one accent; screens name tokens (`bg-paper`, `text-ink-soft`,
    `border-rule`) and never Tailwind palette steps.
  - `src/lib/importEntries.ts` — pure decision logic for restoring an exported
    backup (Settings): additive, idempotent, never overwrites an existing id.
  - `src/dev/` — **dev-only** demo data, so the Feedback screen can be looked
    at without a live model call. Reached from one `import.meta.env.DEV`
    branch in `main.tsx`, so Rollup drops it from every production build;
    a build is grepped for demo strings to prove it. Seeding goes through
    `importEntries`, so it validates, skips existing ids and never deletes —
    it cannot damage real writing. Run `seedDemo()` in the console or open
    `/?seed=demo`. **Never put a seed file in `app/public/`: everything
    there ships.**
  - `vite.config.ts` — PWA manifest, the woff2 precache glob, **and** the
    production env guard
- `worker/` — Cloudflare Worker proxy running the pipeline
  - `src/index.ts` — the request handler; routes `/analyze` and `/health`
  - `src/pipeline.ts` — the per-entry flow: split (code) → pattern matcher
    (code) → THE TEACHER (the one runtime agent: risk check, minimal
    correction, ambiguity, per-change notes, teacher message) → diff (code)
    → labelling (code). See `docs/adr/0001`. Not pure — same
    untested-fetch-handler gap as `index.ts`.
  - `src/patterns.ts` — pure deterministic matcher over the Top-100 checklist:
    regex fixes applied before the agent, labelled from the taxonomy with no
    model call.
  - `src/diff.ts` — pure word-level diff (LCS-based). This is what makes a
    correction's `original`/`corrected` text provably correct, computed from
    the two texts rather than asserted by a model.
  - `src/sentences.ts` — pure sentence splitting and reassembly.
  - `src/alternatives.ts` — pure bounding of the teacher's two unverified,
    model-asserted free-text outputs, the one other control besides the
    prompt for either — there is deliberately no verification stage for
    either one. `attachAlternatives` bounds the optional "You could also
    say…" phrasings (ADR 0002 Part B): drops an out-of-range `for`, a
    phrasing attached to a pattern-sourced correction, and an over-long
    phrasing (never truncated); caps the list at 3. `boundNaturalPhrasings`
    bounds the optional "How an English speaker might say it" phrasing (ADR
    0004): drops an out-of-range or duplicate sentence index, a sentence
    that produced any correction (disjointness enforced here, not left to
    the prompt), an empty or over-long phrasing (never truncated), a
    phrasing that is not actually different from the learner's own
    sentence, and a bad or over-long note (drops the note only); caps at 1
    and supplies `original` itself from the Worker's own sentence array,
    never from the model.
  - `src/learner.ts` — pure assembly of the per-user blocks (level, l1 notes
    and bridges) that go in USER messages, never in system prompts.
  - `src/policy.ts` — pure request-policy decisions (origin, key, body)
  - `wrangler.toml` — `ALLOWED_ORIGIN`, `GLOBAL_HOURLY_CEILING`, KV binding,
    observability
- `shared/` — imported by both sides
  - `schema.ts` — Zod schemas for stored feedback and the agent's output, the
    teacher prompt (mirror of `prompts/teacher.md`), `MODEL_ID`,
    `PROMPT_VERSION`
  - `taxonomy.ts` — error taxonomy v2 (25 categories) with rules, Mongolian
    contrast notes and bridges, plus the legacy 20-name map. Mirror of
    `knowledge/error_taxonomy.yaml`.
  - `patterns.ts` — the Top-100 error patterns. Mirror of
    `knowledge/top_100_patterns.yaml`.
- `prompts/` — runtime prompt sources, frontmatter-versioned. Today: one,
  `teacher.md`.
- `knowledge/` — the source documents: `error_taxonomy.yaml`,
  `top_100_patterns.yaml`, `agent_prompts.md` (the full 9-agent library the
  pipeline grows back into), `integration.md`. **Edit these first, then
  mirror into the TS ports**; the app cannot read them at runtime.
- `docs/` — `architecture.md` and `adr/` (decision records; topology changes
  go through the `architect` subagent and land here first)
- `evals/` — regression set and reports (being built; see `eval-runner`)
- `.claude/agents/` — the six build-time subagents (see **Two agent layers**)
- `tests/` — Node's built-in runner, no framework

This app now has its own `knowledge/` (source documents) and
`.claude/agents/` (build-time subagents). The repository root's `knowledge/`
and review roles still apply to it as well. (`arise/` is fully
self-contained. Never apply one app's standards to the other.)

---

# Two agent layers — do not confuse them

**Runtime agents** are model calls made per entry. There is exactly ONE — the
teacher (`prompts/teacher.md`, ADR 0001). The full 9-agent library in
`knowledge/agent_prompts.md` is the growth map; agents return one at a time,
by ADR, when their cost is justified.

**Build-time subagents** live in `.claude/agents/` and run while developing.
They hand off through files (ADRs, prompts, YAML, reports), not conversation.

| Task | Subagent |
|---|---|
| Add a pipeline stage, change the stored shape, alter routing | `architect` first, then `pipeline-engineer` |
| Implement an accepted ADR | `pipeline-engineer` |
| Change what a runtime agent says | `prompt-engineer` |
| Add a category, rule, bridge, or regex pattern | `linguistics-curator` |
| Measure after any change | `eval-runner` |
| Anything touching distress, wellbeing or minors | `safety-reviewer`, before commit |

When a request says "the teacher agent", it means the runtime one. When it
says "the prompt engineer", it means the subagent.

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

- **The Worker's `fetch` handler and `pipeline.ts`.** `patterns.ts`,
  `diff.ts`, `sentences.ts`, `policy.ts`, `learner.ts` and `alternatives.ts`
  (both `attachAlternatives` and `boundNaturalPhrasings`) are tested; the
  routing, quota charging, and the agent orchestration are not — testing
  them needs Miniflare.
- **Every React component.** There is no DOM testing library. Screens are
  verified by typecheck and by hand.

(`shared/schema.ts`, `shared/taxonomy.ts` and `shared/patterns.ts` are
covered: `tests/schema.test.ts` pins the trust boundary and
`tests/patterns.test.ts` runs every deterministic pattern's own example
through the matcher.)

Say so out loud when a change lands in any of these gaps.

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
it deters abuse rather than authenticating anyone. Above the per-IP limit sits
`GLOBAL_HOURLY_CEILING` (`wrangler.toml`, default 100/hour if unset) — the one
number a per-IP cap behind a forgeable `Origin` header cannot provide: a ceiling
on total spend regardless of how many distinct IPs are calling. Tripping it
returns the existing `429 rate_limited, retryable: true`, never a new error
code — a new code would fall through to `rejected`, which `canRequeue` makes
final, dead-lettering every queued entry on every device during a spend spike.

**An entry is never lost.** It is written to IndexedDB before any network call,
and every failure path leaves the text readable in History. A storage failure
keeps the user on the Write screen with their text still in the textarea, rather
than navigating away from unsaved writing.

**One analysis at a time, and a result never overwrites a newer one.** An entry
carries `status: "analysing"` for the duration of one analysis, taken in a
single IndexedDB `readwrite` transaction so the claim is a real lock across
tabs — two runners cannot both pay to analyse the same text. Results are merged
onto the *stored* record, never onto the caller's snapshot, which by then is up
to nine minutes old and still carries `feedback: null`. A stored analysis is
never downgraded. A claim outlives its holder if a tab is killed, so
`processQueue` releases claims older than `STALE_CLAIM_MS` first. The rules are
pure and live in `app/src/lib/claim.ts`; `db.ts` only supplies the transaction
that makes them atomic. `getQueuedEntries`, `getAnalysingEntries` and
`reclaimStaleAnalysing` read through IndexedDB's `by-status` index (schema
version 2) rather than scanning every stored entry on each poll.

**A dead-lettered entry has a way back.** Only `gave_up` — five transient
failures say nothing about the writing. A refusal, a rejected request and an
over-long entry are verdicts on the text, so they stay final; retrying them
spends money to receive the same answer.

**Failures are classified, and retries are bounded.** The Worker returns
`retryable` alongside every error; the client honours it. A permanent failure
(refusal, rejected request, truncation) marks the entry failed immediately. A
transient one requeues, up to `MAX_ATTEMPTS`. Rate limiting deliberately does
*not* spend the retry budget. Without this the app retried deterministic failures
on every launch and every reconnect, forever, billing each attempt.

**The category taxonomy is versioned data.** The 25 v2 category ids in
`shared/taxonomy.ts` are stored inside every past entry. Renaming or removing
one silently rewrites history — treat any change as a migration. Entries from
before v2 carry the legacy 20-name taxonomy; `normalizeCategory` /
`normalizeSeverity` map them at read time, and `LEGACY_CATEGORY_MAP` must
never lose an entry. Each entry also records the `modelId` and
`promptVersion` it was judged under, plus the `taxonomyVersion`
(`shared/taxonomy.ts`'s `TAXONOMY_VERSION`) in force when it was analysed —
optional, absent on entries written before the field existed, never
backfilled, and the last defence against a future v3 rename becoming
undecidable for entries that predate it. Bump `PROMPT_VERSION` whenever any
system prompt changes.

**A crisis is never a grammar lesson.** The risk check runs inline in the one
agent call: on `acute` the Worker returns no corrections and no teacher
message, and the client shows human-written crisis guidance (no invented
phone numbers; it points to local emergency services and findahelpline.com).
Any change in this path goes through the `safety-reviewer` subagent before
commit.

**A correction's `original`/`corrected` text is computed, never asserted.**
`worker/src/diff.ts` diffs the corrector's output against the submitted text;
the model is only ever asked to label a span the diff already found, never to
invent one. This is what replaced the old design's exact-substring risk (the
client's `FeedbackSchema` substring check in `api.ts` is now a regression
guard, not an active risk).

**No unverified model text may live inside a `Correction`.** ADR 0002 Part B's
alternative phrasings ("You could also say…") are, by definition, model-
asserted free text no diff can verify — the opposite of the invariant above.
They ride the note the teacher already writes per change, but `shared/schema.ts`
keeps them in a parallel top-level `alternatives: [{ for, phrasings }]` array,
never inside `CorrectionSchema` or `StoredCorrection`. An alternative therefore
carries no `category`, `severity` or `pattern_id`, so there is no route by
which one could reach the taxonomy, `getErrorCounts`, `getPatternMap`,
`per100`, the trend, or `formatErrorLog` — not a discipline to remember, a
shape those functions cannot reach because they only ever iterate
`corrections`. `worker/src/alternatives.ts` bounds what the model returns in
code before it reaches `FeedbackSchema`: an out-of-range `for`, a phrasing
attached to a pattern-sourced correction, and an over-long phrasing are all
dropped — never truncated, since a phrasing cut mid-word is broken English
shown to a learner as a model of good English. The UI renders them as passive
reading only, visually subordinate to the correction they ride (no `EditSpan`,
no accent rule bar, no tick) — never anything interactive.

ADR 0004's `natural_phrasings` is the second array riding this same rule, for
a sentence the learner did NOT get corrected on rather than one they did: also
top-level in `FeedbackSchema` (`natural_phrasings: [{ original, phrasing,
note? }]`), also never inside `CorrectionSchema` or `StoredCorrection`, also
carrying no `category`, `severity` or `pattern_id` and so reaching no
statistic. `boundNaturalPhrasings` (same file, `worker/src/alternatives.ts`)
enforces disjointness in code — a sentence with any correction, pattern- or
model-sourced, is never eligible — and supplies `original` itself from the
Worker's own sentence array; the sentence index the model returned is
discarded the moment that lookup is done, so nothing downstream can join a
phrasing back onto a position in the entry. Rendered passive, in its own
section, never inside "Every change."

**A claim about the learner's history is computed, never asserted.** The same
rule as the one above, applied to time rather than text. `cleanStreak` comes
from `stats.ts`, counted over stored entries; `pattern_watch.entries_clean`
echoes it back. The model is told the numbers and forbidden from inventing
one. This matters more than it looks: a fabricated "you had three clean
lessons" is indistinguishable from a real one to the learner, and the whole
reason this app exists rather than a chat window is that its memory is real.
For the same reason the app cites categories by name and never invents a rule
number — a citation that looks precise and points at nothing is worse than no
citation.

**Every system prompt is a byte-identical cached prefix.** The teacher prompt
in `shared/schema.ts` (mirror of `prompts/teacher.md`) is one cache entry.
Never interpolate anything into it. Anything per-request or per-user (the
entry, the learner's level, l1 notes, recurring categories, pattern-fix
summaries) belongs in the user message, or prompt caching silently stops
working and input cost roughly triples.

**`max_tokens` bounds thinking *and* response, for every call.** `claude-opus-5`
thinks by default. Sizing `max_tokens` for the response alone truncates a call
into `stop_reason: "max_tokens"`. Truncation is reported as a *permanent*
failure for the whole entry, because it is deterministic for a given call.

**A refusal is a verdict, not an outage.** `stop_reason: "refusal"` arrives on an
HTTP 200. Keep the entry, never retry it. With one runtime agent (ADR 0001) a
refusal fails the whole entry — there is no second call left to degrade
gracefully into. (The 9-agent era's separate coach call, which degraded to an
absent `coach_reply` on refusal rather than failing the entry, is retired; the
field stays valid on entries that carry it.)

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
`lib/claim.ts`, `lib/importEntries.ts`, `worker/src/policy.ts`,
`worker/src/diff.ts` and `worker/src/sentences.ts` all obey it. Keep it that
way when adding logic.

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

- **Cost and latency of the single-agent pipeline are unmeasured.** One entry
  is 1–3 Anthropic calls (one teacher call, plus up to 2 in-request retries
  on an over-rewrite), all on `claude-opus-5`. Measure real entries, then
  tighten `app/src/lib/api.ts`'s 540s client timeout, which was sized for the
  old multi-call worst case and is now far too generous. **`PROMPT_VERSION` 9
  (ADR 0004's natural phrasing) is unmeasured too, and outstanding:**
  `eval-runner` has not yet measured 9 against 8 on the same entry set, no
  live Anthropic call has been made under `PROMPT_VERSION` 9 at all, and ADR
  0004's stated thinking-token risk (the model now considers the *correct*
  sentences too, which are the majority) is exactly as unverified as the
  response-token estimate. Do not report either as measured until
  `eval-runner` actually runs.
- **The trust surface has grown to 8 pieces of unverifiable model text at the
  ceiling, and there is deliberately no verification stage for any of it.**
  ADR 0002 Part B's `alternatives` (3 corrections × 2 phrasings) plus ADR
  0004's `natural_phrasings` (1 phrasing + 1 note) is 8 free-text claims one
  entry can carry that no diff checks — the prompt is the only control on
  whether any of them is genuinely correct, or genuinely more natural. If
  `eval-runner` finds phrasings unreliable, ADR 0004 is explicit about which
  lever moves first: **lower ADR 0002's `alternatives` cap, do not raise ADR
  0004's cap of 1.** Watching this is now overdue on both fronts, not just
  the newer one.
- **The notes→edits zip is an order heuristic.** The agent labels its own
  changes in reading order and the pipeline zips them onto diff-confirmed
  model edits per sentence. If the diff finds a different number of changes
  than the agent declared, the leftovers get `category: "other"` with a
  pair-based explanation — never invented, but unlabelled. Watch how often
  "other" appears in real entries; a high rate means the zip needs work or
  the tutor agent should return. Alternative phrasings (ADR 0002 Part B) now
  ride the same zip — a mis-zip can only move an alternative onto a
  different edit *within the same sentence*, never onto the wrong sentence,
  so the blast radius stays bounded.
- The Worker's `fetch` handler and `worker/src/pipeline.ts` have no
  integration test — testing them needs Miniflare. Only the pure pieces
  (`patterns.ts`, `diff.ts`, `sentences.ts`, `policy.ts`, `learner.ts`,
  `alternatives.ts`, `importEntries.ts`) are tested. Every React screen is
  also untested (no DOM
  library); the acute wellbeing screen, the pattern grid, the drill MCQ and
  the Settings import path have all been verified by typecheck and by hand,
  not by an automated suite.
- **The pattern map has no "fixed" state, on purpose.** integration.md's
  `fixed` status requires knowing the learner *attempted* a structure
  correctly, not merely avoided it, and nothing stored today can tell those
  apart. The map stops at unseen/active/fading rather than congratulating
  avoidance. It is also deliberately scoped to the 49 `DETERMINISTIC_PATTERNS`
  rather than the full 96-entry `JOURNAL_PATTERNS` list (WORK-11, ruling C2 in
  `reports/chief-architect.md`): `pattern_id` is only ever written by the
  deterministic matcher, so a wider grid would show a denominator ("N of 96")
  the code can never fill in. The Patterns screen calls it "traps we catch
  automatically", never "the top-100 map".
- **Pattern-edit attribution is a containment heuristic.**
  `findMatchingHit` matches a word-diff edit back to the matcher hit that
  caused it by text containment; a coincidental model edit inside a matched
  phrase can inherit the pattern's label. The label's text is always
  verbatim-correct; only its `source`/`pattern_id` can misattribute. Since
  WORK-30, a claimed hit is spliced out of the sentence's hit list, so two
  edits in one sentence can no longer both claim — and double-count — the
  same hit.
- The Top-100 port deliberately fixes less than the YAML promises in spots:
  pattern 22 fixes the noun and leaves the verb to the corrector; patterns
  whose YAML `replace` was null and needed a lemma table got one only where
  it was closed and safe (26, 33, 35, 75); the rest stay contextual. The
  YAML files are the source documents — edit them first, then mirror the TS.
- **The risk check is inline, not a dedicated gate.** It rides in the same
  call and prompt as the teaching, which is weaker than the library's
  dedicated classifier (no independent verdict, and a failed call fails the
  entry rather than failing open). Restoring the dedicated distress
  classifier is the first candidate when runtime agents are added back —
  route any change here through `safety-reviewer`.
- New entries have no coach reply, drills, fluency notes, level estimate or
  weekly review — those agents are retired for now (ADR 0001). The screens
  render 9-agent-era entries that carry them, and the stored fields remain
  valid.
- The Patterns screen's counts are all-time, so a pattern the learner has
  already fixed outranks a current one forever. (The pattern map's
  active/fading split now covers part of this; the ranked list still doesn't
  decay.) The headline block now says "all time" explicitly (WORK-19) rather
  than implying a current ranking. Ranking the headline over a recent window
  instead is deferred until roughly 50 analysed entries exist (ruling C3);
  when it returns it must reuse `PATTERN_ACTIVE_WINDOW` from `stats.ts`
  rather than invent a second definition of "recent".
- The precache is ~990 KB across 20 entries: the JS bundle (dominated by
  Recharts) plus ~270 KB of self-hosted woff2. Fine behind a warm service
  worker; worth code-splitting Recharts if first load matters.
- Rate limiting is per-IP and read-then-write, so two simultaneous requests
  can overshoot by one. It caps sustained spend; it is not a security
  boundary.
- **Only Mongolian has curated contrast notes** (`shared/taxonomy.ts`,
  ported from the contrastive guide). For every other language the "why you
  made this error" explanation is the model's own contrastive knowledge,
  unverified by us. Adding a language means adding note/bridge fields per
  category — write them only from real contrastive knowledge.
- `knowledge/English-Teacher-Bot-Prompt.md` is the older chat-assistant
  prompt this app grew out of. The agent library and YAML files supersede it
  as the app's source material; it stays only as the user's personal document
  for chat assistants and is no longer kept in sync.
- **The corrector's over-rewrite threshold (`MAX_REWRITE_RATIO = 0.45`) is
  untuned.** It now measures only the model's edits (pattern fixes are
  applied before the corrector runs), which should trip it less often —
  still worth watching the retry-with-a-hint path in practice.
- The Top-100 frequency ordering is predicted from typology, not measured
  from learners. Per integration.md: recompute `priority` from the app's own
  corpus at around 200 entries.

---

# General Rules

Always explain major architectural decisions.

Always recommend the smallest safe implementation.

Never implement multiple unrelated features in one task.

Always keep the application production ready.

Never put a secret in client code.
