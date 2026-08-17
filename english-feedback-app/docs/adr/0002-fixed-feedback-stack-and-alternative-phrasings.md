# 0002. A fixed four-card Feedback stack, and alternative phrasings that never enter the record

## Status: accepted 2026-08-12 — **Part A superseded by 0003** (same day). Part B stands.

Part A (the fixed four-card stack) shipped in `48eba47` and Part B (alternative
phrasings) in `646763d`, both on 2026-08-12. Later the same day ADR 0003
replaced Part A's card stack with a single scrolling page: the fixed stack cured
the card-per-correction problem but left the screen carrying two navigation
models at once — swipe between cards and scroll inside them — and the owner
still read the result as messy. Everything Part A settled about *order and
content* survives in 0003 (message → changes → corrected text → closing, diff
order, `ambiguous` trailing, legacy fields grouped and subordinate); only the
container changes.

**Part B is untouched and remains in force**: alternatives ride the teacher's
existing note, live in a parallel `alternatives` array outside `Correction`,
are bounded in code by `worker/src/alternatives.ts`, render as passive reading
inside the taught row, and are counted nowhere. `PROMPT_VERSION` 8 stands.

Read Part A below as history: it is why the app stopped putting one correction
on one card, and why 0003 did not simply revert to that.

## Context

The app's owner — its first learner — reports that feedback "looks messy" and
is "too long", and that a new user would not come back after one session. That
is a first-session retention complaint, and it is the only user signal the app
has.

The prose is not the problem. `prompts/teacher.md:41,44` already caps the
teacher's message at 160 words and at most 3 corrections, with the stated
reason that an overwhelmed learner stops writing.

The mess is the card stack. `app/src/screens/Feedback.tsx:52` pushes one
swipeable card per correction, unbounded:

```
fb.corrections.forEach((_, index) => cards.push({ kind: "correction", index }));
```

A 200-word entry with 12 diff-confirmed edits becomes 12 correction cards plus
summary, corrected text and closing — 15+ cards, met one swipe at a time. The
learner discovers how bad the entry was serially, with a progress bar counting
up. The prompt's "at most 3" discipline is honoured in the message and then
contradicted by the UI three cards later. `ui-guidelines.md`'s "one idea per
card" was read as "one correction per card"; the idea is actually "here is what
this entry cost you", and it currently has no card at all.

Two directions are settled by the owner and are not reopened here:

1. Corrections become one scannable list, in a fixed four-card stack. Every
   correction stays visible; the swiping stops.
2. Each taught correction gains alternative correct phrasings — "You could also
   say…". Passive reading. Explicitly **not** multiple choice or any other
   drill; the retired drills agent does not return under this ADR.

(2) collides with an invariant. `CLAUDE.md`: *a correction's
`original`/`corrected` text is computed, never asserted* — `worker/src/diff.ts`
produces every span and the model may only label a span the diff already found.
An alternative phrasing is, by definition, model-asserted free text that no
diff can verify. It cannot be allowed to become indistinguishable from a
verified correction, and it must never reach a statistic, because the whole
reason this app exists rather than a chat window is that its memory is real.

## Decision

Two changes, deliberately separable. **Part A ships alone and first.**

### Part A — the fixed stack (client only, no schema, no prompt, no cost)

> **Superseded by ADR 0003 on 2026-08-12.** The stack is now one scrolling
> page. The table below records what shipped in `48eba47`; its order and
> content carried over to 0003's sections, its navigation model did not.

The Feedback stack is exactly four cards for every entry the current pipeline
produces:

| # | Card | Content |
|---|---|---|
| 1 | The message | date · word count · correction count eyebrow, then `teacher_feedback`. Legacy fallbacks (`one_thing_to_fix`, `what_went_well`) stay as they are for entries with no `teacher_feedback`. |
| 2 | Every change | the whole of `corrections` as one vertical list, scrollable. Headed with the count, so the shape of the entry is visible before the first row. `ambiguous` renders as a trailing block under a rule, headed "We did not guess". |
| 3 | Your writing, put right | `corrected_text` with the existing `buildSegments` highlighting. Unchanged. |
| 4 | Done | per-100 rate, prior-entry comparison, legacy `scores` / `cefr_estimate` / `coach_reply`, the two actions. Unchanged. |

List rows keep the current correction card's content — category label,
`EditSpan` before/after pair, the one-sentence rule (`c.explanation ?? c.rule`),
the `#N on your checklist` chip for pattern-sourced edits, and the legacy
`patterns[]` explanation and `highlighted` badge where an old entry has them.
Rows stay in diff order — the reading order of the learner's own text — so the
list corresponds line for line with card 3. They are **not** re-sorted by
severity.

Legacy-only sections that no current entry can produce (`fluency_notes`,
`vocabulary`, `drills`, `pattern_watch`) move into **one** appendix card
inserted before card 4, shown only when the entry actually carries them. Legacy
drills render there as a vertical list of the existing `Drill` component,
untouched. A pre-ADR-0001 entry is therefore five cards; nothing analysed today
is ever more than four. Card count stays a pure function of stored data.

`ui-guidelines.md`'s rule is amended rather than broken: **a card carries one
idea, and may scroll to repeat that idea, but never to reveal a different kind
of content.** "Every change in this entry" is one idea repeated twelve times.
The appendix card is the named exception, and it is a legacy artefact that
disappears from the app as those entries age out.

The acute branch (`Feedback.tsx:233`) returns before any of this. It builds no
cards, has no card counter, and is excluded from `isNormalEntry` so focus is
never moved onto a crisis screen. Part A does not touch it.

### Part B — alternative phrasings

**They ride the existing note, and they cost no new call.** The teacher already
emits one `note` per change it made, zipped onto diff-confirmed model edits in
reading order per sentence (ADR 0001). A note gains an optional
`alternatives: string[]` (at most 2), and the agent is instructed to attach
them **only to the changes it actually teaches in `feedback` — at most 3 per
entry**, the same cap the message already obeys.

Consequences of riding the note, all of them deliberate:

- Pattern-sourced corrections never consume a note, so they never get
  alternatives. Deterministic fixes are the mechanical ones; "you could also
  say" adds nothing to *go → went*.
- Notes are queued per sentence index, so a mis-zip can only move an
  alternative onto a different edit **within the same sentence**. Since an
  alternative is a rephrasing of that corrected sentence, the worst case is
  "attached to a less interesting edit in the right sentence". It cannot land
  on the wrong sentence.
- On `risk: "acute"` the agent returns empty `notes`, so there is nothing for
  alternatives to ride. The acute branch in `pipeline.ts:216` builds its
  feedback as an explicit object literal and must stay that way.

**They live outside the correction, not inside it.** `FeedbackSchema` gains a
parallel optional array:

```ts
const AlternativeSchema = z.object({
  /** Index into `corrections`, assigned by the same reading-order zip. */
  for: z.number().int().min(0),
  /** 1–2 model-written rephrasings. NOT diff-verified. Never a correction. */
  phrasings: z.array(z.string().max(120)).min(1).max(2),
});
// alternatives: z.array(AlternativeSchema).max(3).optional()
```

This is the point of the whole design. `StoredCorrection` is the type every
statistic consumes — `getErrorCounts`, `getExamples`, `getPatternMap`,
`topCategories`, `cleanStreakFor`, `getRecurringCategories`, `formatErrorLog`.
Keeping asserted text structurally out of that type turns "do not count
alternatives" from a discipline every future contributor must remember into a
shape they cannot reach. An alternative carries no `category`, no `severity`
and no `pattern_id`, so there is no route by which one could enter the taxonomy,
the pattern map, `per100` or the trend even if someone tried.

This becomes an invariant in `CLAUDE.md`: **no unverified model text may live
inside a `Correction`.**

**The Worker bounds them in code, not by trusting the prompt.** Before
assembling `feedback`, the pipeline drops any entry whose `for` is out of
range, any phrasing that is empty or over the length cap, and any entry left
with no phrasings; then truncates the array to 3. Over-long phrasings are
**dropped, never truncated** — a phrasing cut mid-word is broken English shown
to a learner, which is worse than no phrasing. `AgentOutputSchema` declares
`alternatives` as optional and unconstrained beyond `max(2)`, so a bad value
degrades to nothing rather than failing a parse and costing a retry; the strict
bounds live on `FeedbackSchema`, downstream of the Worker's own normalisation.

**In the UI** they render inside the taught row on card 2, under a plain
"You could also say" heading, one per line, in muted serif. No `EditSpan`, no
`<del>`/`<ins>`, no accent rule bar, no tick. They are not counted anywhere:
not in the card-2 heading, not in the card-1 eyebrow, not in `per100`. They are
never passed to `buildSegments` and never appear on card 3.

(ADR 0003 keeps every one of those rules; "card 2" and "card 3" now read as
the changes section and the corrected-text section of one page.)

The presence of alternatives is what makes a row the taught one — that is the
hierarchy the list needs so twelve rows do not read as twelve equal disasters.
No `highlighted` field is revived to mark it.

**`PROMPT_VERSION` 7 → 8**, because the teacher's output contract changes. Both
mirrors — `prompts/teacher.md` first, then the `TEACHER_SYSTEM_PROMPT` string
in `shared/schema.ts` — change together; a change landing in one side only is a
defect. Everything added to the system prompt is static instruction; the ≤3 cap
is a written rule, not a per-request number, so the cached prefix stays
byte-identical.

The prompt contract `prompt-engineer` must satisfy: a phrasing is another
correct way to say *the learner's own corrected sentence*; it adds no facts, no
opinion and no detail; it stays at or barely above the learner's stated level;
it is short enough to read at a glance. Never a translation, never a style
upgrade of an already-correct sentence.

## Consequences

- **The first session gets shorter without costing anything.** Part A removes
  11 swipes from a 12-error entry, needs no schema change, no prompt change, no
  `PROMPT_VERSION` bump and no extra token. It should ship and be lived with
  before Part B is built — there is a real chance the layout was the whole
  complaint, and Part B is the half that spends money and touches the trust
  boundary.
- **The learner sees the shape of the entry at a glance**, which is also the
  honest version: 12 corrections was always the truth, and revealing it one
  card at a time made it feel worse, not smaller.
- **Cost: no new call, no new agent, no new failure domain.** The delta is
  output tokens on the single existing call: at most 6 short phrasings, roughly
  130 output tokens including JSON overhead, against a response that already
  carries the corrected sentences, ~12 notes and a 160-word message — plus
  adaptive thinking, which dominates both. Generating 2 alternatives for *every*
  correction instead would be ~24 phrasings, roughly 4× that delta plus more
  thinking, to produce content the learner will not read past the third one. The
  ≤3 cap is where the money is saved. The absolute per-entry cost is still
  unmeasured (a standing Known Gap); `eval-runner` must measure the same entry
  set under PROMPT_VERSION 7 and 8 and record both, and watch that output growth
  does not move calls toward `MAX_TOKENS` — truncation is a permanent failure
  for the whole entry.
- **`ui-guidelines.md` and `docs/architecture.md` are now wrong** and must be
  updated in the same change: the "Screens" section still describes one card
  per correction as the teaching order, and architecture.md's client paragraph
  still says "card stack". CLAUDE.md gains the new invariant and its Known Gaps
  entry for the notes→edits zip should note that alternatives now ride it.
  (Both files are rewritten again by ADR 0003; the wording that landed for
  Part A stood for a few hours only.)
- **The notes→edits zip carries slightly more weight.** It was already a Known
  Gap. The blast radius is bounded to within-sentence misattachment, as above.
- **Nothing is backfilled.** Entries stored before this ADR have no
  `alternatives` and render without the block. Backfilling would mean re-paying
  for every past entry and re-judging writing under a prompt version it was
  never analysed with.
- **Old stored data keeps rendering, and old clients keep working.** Zod's
  `z.object` strips unknown keys rather than rejecting, so a stale
  service-worker client validating a PROMPT_VERSION 8 response silently drops
  `alternatives` and stores a valid entry. Pre-v2 entries keep their
  `normalizeCategory` path and their `rule`-instead-of-`explanation` fallback
  inside the list rows.
- **What we gave up:** the 9-agent-era sections lose their own cards and become
  an appendix. That is a real demotion of stored content the learner can see
  today, accepted because those fields cannot be produced any more and a fixed
  stack is worth more than preserving their prominence. Nothing is deleted from
  storage.

## Stage contract

No new stage. One stage changes and one code step is added.

**`runTeacher`** (`worker/src/pipeline.ts`) — reads: unchanged (patched
sentences, learner context, recurring categories, entry number, pattern-fix
summary). Writes: adds optional `alternatives: string[]` (≤2) per note, on at
most the 3 changes it teaches. Tier: strong (`MODEL_ID`) — unchanged; this is
not a candidate for the cheap tier because it is the same call. Failure:
unchanged — refusal and truncation fail the entry, parse failure retryable.
Alternatives specifically cannot cause a failure: they are optional in
`AgentOutputSchema` and absent is normal. Retry: unchanged, up to 2 in-request
attempts on over-rewrite; the retry hint is not extended to mention
alternatives.

**`attachAlternatives` (code, pure)** — reads: the zipped notes and the final
`corrections` array. Writes: `feedback.alternatives`. Model tier: none. Failure
mode: drops silently — out-of-range `for`, empty or over-long phrasings, and
any entry left with nothing are removed; over 3 entries are truncated to 3;
alternatives attached to a pattern-sourced correction are dropped. Retry: none,
it cannot fail. This is pure logic and belongs beside `diff.ts` /
`sentences.ts`, with its own tests — it is exactly the kind of bounding that is
code, not prompt trust.

## What implementers must not do

(Part A's UI clauses are superseded by ADR 0003's own must-not list, which is
stricter. Every Part B clause below still binds.)

- Do **not** add a second model call, a second agent, or any stage whose job is
  to check the alternatives. If they come back wrong, fix the teacher's prompt.
- Do **not** put alternatives inside `CorrectionSchema` or `StoredCorrection`,
  and do not give one a `category`, `severity` or `pattern_id`.
- Do **not** let alternatives reach `app/src/lib/stats.ts`, `formatErrorLog`,
  the Error Log screen, the pattern map, or `buildSegments`. Do not count them
  in any correction count or in `per100`.
- Do **not** generate alternatives for pattern-sourced corrections, and do not
  raise the ≤3 cap to match the length of the correction list.
- Do **not** extend `api.ts`'s `text.includes(c.original)` regression guard to
  alternatives. An alternative is not a substring of the entry by design; a
  check there would warn on every entry and train everyone to ignore it. Do not
  delete the guard either.
- Do **not** backfill, re-analyse or migrate stored entries.
- Do **not** interpolate anything into `TEACHER_SYSTEM_PROMPT`. Do not change
  `MAX_TOKENS`, `MAX_REWRITE_RATIO` or the retry loop under this ADR.
- Do **not** touch the acute path: not the `risk === "acute"` branch in
  `pipeline.ts`, not the acute branch in `Feedback.tsx`, and not the
  `isNormalEntry` gate on the `stackRef` focus effect. The acute branch's
  feedback object stays an explicit literal — never a spread of agent output.
  Any change that does touch it goes through `safety-reviewer` before commit.
  (ADR 0003 removes `isNormalEntry` and the focus effect along with the
  carousel that needed them, under `safety-reviewer` review; the rule about
  the explicit literal in `pipeline.ts` is permanent.)
- Do **not** delete the legacy render paths (`fluency_notes`, `vocabulary`,
  `drills`, `pattern_watch`, `scores`, `cefr_estimate`, `coach_reply`,
  `highlighted`, `patterns[]`, `one_thing_to_fix`, `what_went_well`). They move;
  they do not go.
- Do **not** build anything interactive out of alternatives. Passive reading
  only — no tap-to-reveal, no choice, no drill. The drills agent does not
  return under this ADR.
- Do **not** ship Part B and Part A in one commit. A is client-only; B changes
  the prompt, the schema and the stored shape.
