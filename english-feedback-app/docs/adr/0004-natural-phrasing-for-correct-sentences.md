# 0004. Natural phrasing for sentences the learner got right

## Status: proposed (2026-08-12)

Additive to ADR 0002 Part B and ADR 0003. Neither is reopened. The correction
philosophy in `prompts/teacher.md` `<correction_rules>` 1 and 3 is **confirmed
unchanged** — see "Decision 0" below, which is the load-bearing ruling of this
record.

## Context

The owner — the app's first learner — reports: *"Our feedback app gives the
formal english sentences. Like I want to, the english speakers say I'd like to
etc."* They want to sound like an English speaker, not merely be correct.

The formality they are seeing is deliberate and correct behaviour.
`prompts/teacher.md` `<correction_rules>` #3 forbids fixing style, tone or
register, and #1 requires an already-correct sentence to come back
byte-identical, *"learners notice when correct sentences get changed, and it
teaches them their correct English was wrong."* "I want to go" is correct
English. Returning it as a **correction** would tell the learner their correct
sentence was a mistake, which is precisely the harm rule #1 exists to prevent —
and it would put an error in `corrections`, where it would be counted by
`getErrorCounts`, `per100`, the trend and the pattern map. A style preference
must never become a statistic in an app whose entire claim is that its memory of
the learner's errors is real.

So the gap is not that the rules are wrong. The gap is that the app has **no
channel at all for a sentence that is correct**. Every path through
`pipeline.ts` is anchored to a diff-confirmed edit:

- `corrections` — computed by `worker/src/diff.ts`, requires an edit.
- `alternatives` (ADR 0002 Part B) — the right *shape*: model-asserted text kept
  in a top-level array outside `CorrectionSchema`, carrying no `category`,
  `severity` or `pattern_id`, so it cannot reach a statistic. But it is keyed
  `{ for: <index into corrections> }` and the prompt restricts it to the ≤3
  changes the teacher actually teaches. With no correction there is no index to
  key to. That is the concrete structural obstacle.
- `ambiguous` — requires a sentence the model refused to correct.

A learner can therefore write a whole entry of correct, stiff, textbook English
and the app has nothing to say about it beyond praise. That is the owner's case
exactly.

**The register category is not the answer, and the boundary needs stating.**
`shared/taxonomy.ts` has `register` ("Register and politeness"), whose `ruleB1`
is literally *"English softens requests. 'I want' sounds blunt; 'I'd like' or
'Could you' is normal."*, with a curated Mongolian contrast note and
`gate: "B1"`. It is tempting to route the owner's request through it. That would
be wrong in a journal: a diary sentence "I want to visit my sister" is not blunt,
is addressed to nobody, and misfires with no one. Labelling it `register` would
file a non-error in the taxonomy and inflate the learner's error counts with
matters of taste. `gate: "B1"` is an advisory field no code reads today; this
ADR does not wire it up.

**The cheapest option was considered and rejected.** The teacher already writes a
≤160-word message; a sentence of it could carry "an English speaker would more
often say…" with zero schema change, zero new field and zero backward-compat
surface. It is rejected because it is unbounded free prose: code could not cap
its length, drop a duplicate, or stop it from reading as a correction, and the
UI could not render it as passive reading distinct from the teaching voice. This
project bounds model text in code rather than trusting a prompt
(`worker/src/alternatives.ts` is the precedent). It would also spend part of a
160-word budget that was capped to stop overwhelm.

Three commits on 2026-08-12 removed a boxed rule panel, two chips and a card
carousel, and a fourth deduplicated repeated rules, because the screen read as
cluttered. Anything added here starts from a presumption against being seen.

## Decision

### 0. The correction philosophy does not change. Confirmed, not overruled.

Minimal edits stand. `<correction_rules>` 1 and 3 are unchanged in letter and in
intent: a correct sentence still comes back byte-identical, and the corrector
still never fixes style, tone, register or repetition. Nothing in this ADR may be
implemented by loosening them. This ADR is **purely additive**: it adds a second,
clearly-labelled channel that sits outside `corrections` and is counted nowhere.

The boundary implementers and `prompt-engineer` must both hold:

| | It is a `register` **correction** | It is a **natural phrasing** |
|---|---|---|
| When | The sentence, in the form the writer is clearly using (a request, an instruction, an email opener), would be received as rude or wrong — "I want you to send me the report" to a manager. | The sentence is fine as written, and a fluent speaker would simply more often say it another way — "I want to visit my sister" in a diary. |
| Produced by | A diff-confirmed edit + a note. | Nothing in `corrections`. |
| Carries | `category`, `severity`, `explanation`, counts toward every statistic. | No category, no severity, no `pattern_id`. Counted nowhere. |
| Learner reads | "This was a mistake." | "Both are correct. This is what people say more often." |

If the model judges a sentence to be a genuine register error, it corrects it and
this channel never sees that sentence (see the disjointness rule below). There is
exactly one channel per sentence, always.

### 1. Where it lives: a new top-level array, keyed to nothing

`FeedbackSchema` gains a second parallel array, sibling to `alternatives`, never
inside `CorrectionSchema` or `StoredCorrection`:

```ts
/** "How an English speaker might say it" — ONE more idiomatic way to write a
 * sentence the learner already got right (ADR 0004). Model-asserted free text,
 * NOT diff-verified, exactly like AlternativeSchema — which is why it lives
 * here and not inside a Correction. `original` is the learner's own sentence,
 * copied by the Worker from its own sentence split; it is never model text. */
const NaturalPhrasingSchema = z.object({
  original: z.string(),
  phrasing: z.string().max(120),
  note: z.string().max(100).optional(),
});
// natural_phrasings: z.array(NaturalPhrasingSchema).max(1).optional()
```

Three rulings inside that shape, each deliberate:

**It is not keyed to a correction, and it is not keyed to a sentence index
either.** Extending `alternatives`'s `for` into a discriminated union (correction
index *or* sentence index) was considered and rejected: it reopens a field that
shipped hours ago, forces every existing stored `alternatives` entry through a
new read-time branch, and makes one array mean two things. A separate array with
a separate name and a separate render site costs nothing and keeps both readable.

**The sentence index exists only inside the Worker.** The model returns an index
into the sentences it was given; the Worker uses it to look up `sentences[i]` and
stores the *text*, then throws the index away. Nothing downstream can join a
natural phrasing back onto a position in the entry, which is what keeps it out of
`buildSegments`, out of the corrected-text highlighting, and out of any future
temptation to align it with a correction. It also means the learner's own
sentence is quoted back verbatim from the Worker's own array — the model cannot
misquote what the learner wrote, only assert a rephrasing of it.

**`note` is optional and subordinate.** One sentence saying *why* speakers say it
that way ("English softens wants with 'would like'"). Without it the learner
memorises one sentence; with it they get a portable rule, which is this app's
entire premise. It is asserted text like the phrasing, bounded the same way, and
it is not an `explanation`: it has no category and reaches no rule card.

`AgentOutputSchema` gains the model-side form, loose so a bad value degrades
instead of failing a parse and costing a retry (the `alternatives` precedent):

```ts
natural: z.array(z.object({
  index: z.number().int().min(0),
  phrasing: z.string(),
  note: z.string().optional(),
})).max(1).optional()
```

### 2. The cap is ONE per entry, and zero is the normal answer

One number — `1` — in the prompt, in `AgentOutputSchema`, in the code constant
and in `FeedbackSchema`. It does not appear in four places with three values.

Rationale. The app's whole teaching discipline is "at most 3 corrections,
silently ignore the rest"; one natural phrasing a day is memorable, cannot
clutter, and accumulates over months, which is what this app is for. A suggestion
on every correct sentence would undo three commits of decluttering, cost real
output tokens, and produce content nobody reads past the third line — ADR 0002
already made that argument for `alternatives` and it applies harder here, because
correct sentences are the *majority* of sentences.

Widening later is backward-compatible: raising the schema max still validates
every entry stored under max 1. If, after roughly 20 real entries, one per entry
reads as too few, widening to 2 is a one-line change in four places plus a
`PROMPT_VERSION` bump — and it is a decision to make on evidence, not now.

**Selection rule (prompt-side).** The single phrasing must be the most
*portable* one — a difference the learner will reuse, not a one-off word swap.
In order of preference: the fixed politeness/modal channel (`want to` → `'d like
to`, `can you` → `could you`, bare imperative → `could you`), then a conventional
collocation or fixed expression, then a structure a speaker would reliably choose
instead. Explicitly **not** eligible: a sentence that is merely short, simple,
plain or repetitive. Plain correct English is not a defect, and treating it as
one is the style-critique failure mode this ADR exists to avoid.

**Disjointness (code-side).** A sentence that produced *any* correction —
pattern-sourced or model-sourced — is ineligible. A corrected sentence already
has a channel: ADR 0002 Part B's `alternatives` ride its taught note. This one
exists for the sentences that have nothing. Enforced in the Worker from
`edits.map(e => e.sentIdx)`, not left to the prompt.

### 3. How it stays honest: bounded in code, and no verification stage

A natural phrasing is model-asserted free text that no diff can verify — the same
trust problem as ADR 0002 Part B, now attached to sentences the learner got
right, which makes it slightly worse: there is no error to anchor it to, so a
hallucinated "speakers say X" has nothing contradicting it on screen.

**There is deliberately no verification stage, and the prompt is the only control
on whether a phrasing is genuinely more natural.** A second call whose only job
is to check the first call's output is forbidden by this project's standing rule
(and by ADR 0002's must-not list): if the phrasings come back wrong, fix the
teacher's prompt. What code *can* check, it does.

`worker/src/alternatives.ts` gains `boundNaturalPhrasings` — same file, because
it is already the one place unverified model text is bounded before it reaches
`FeedbackSchema`, and one trust boundary should have one home and one test file.
Its module header is rewritten to say it holds both. It drops, never truncates:

- an `index` outside the range of the Worker's own sentence array;
- an `index` for a sentence that produced any correction (disjointness);
- an empty or whitespace-only `phrasing`;
- a `phrasing` over 120 characters — **dropped, never truncated**, for ADR 0002's
  reason: a phrasing cut mid-word is broken English shown to a learner as a model
  of good English;
- a `phrasing` that is not actually different: compare it to the learner's
  sentence lowercased, whitespace-collapsed, non-alphanumerics stripped; equal
  means the model returned the learner's own sentence back, which reads as a bug.
  This also kills the "differs only in a comma" case the prompt cannot guarantee;
- a duplicate index (keep the first);
- a bad or over-long `note` — drop **the note only**, keep the phrasing;
- everything past the first surviving entry.

`original` is not read from the model at any point. The function is pure, takes
the sentences and the corrected-sentence-index set as arguments, and cannot fail.

### 4. Where it renders: its own section, invisible on most entries

ADR 0003's page order is preserved. A new `<section>` appears **after "Your
writing, put right" and before the legacy appendix**, and only when
`natural_phrasings` is non-empty — so an entry without one looks exactly like
today. On most entries this feature is invisible. That is the anti-clutter
guarantee, and it is structural, not a matter of taste.

It is not appended to the "Every change" section. That section is headed with the
correction count; putting a non-error under it would be a lie, would make the
learner read it as a thirteenth mistake, and would violate `ui-guidelines.md`'s
rule that a section must never put a different *kind* of content under one
heading.

```
<section> h2  How an English speaker might say it
          p   Both of these are correct — this is just what people say more often.   (static, human-written)
          p   You wrote:  <learner's own sentence>        (muted)
          p   <phrasing>                                  (serif, the emphasis)
          p   <note>                                      (faint, only if present)
```

The static reassurance line is human copy in the client, costs nothing, and is
the single most important guard against the learner reading this as a correction.

No `EditSpan`, no `<del>`/`<ins>`, no arrow between the two sentences, no accent
rule bar, no tick, no badge, no colour, nothing interactive — passive reading
only, exactly as ADR 0002 Part B ruled for `alternatives`. It is counted nowhere:
not in the `h1` correction count, not in `per100`, not in the Error Log, not in
the pattern map.

### 5. Register and level: steered from the user message, never the system prompt

Contractions and "I'd like to" are *less* formal, not more advanced, and
appropriateness is contextual. Two separate inputs, kept on opposite sides of the
cache boundary:

**The context is static and belongs in the system prompt.** This app analyses a
*daily journal*. The system prompt already opens with that fact. The target
register is therefore everyday English between people who know each other, and
that instruction is written into the prompt as static text, identical for every
learner. The suggestion never moves *toward* formality — the whole point is the
other direction — and it never proposes a phrasing that only fits a register the
entry is not in.

**The learner's `level`, `field` and `goal` already travel in the user message**
via `learnerContext()` (`worker/src/learner.ts`), and `l1NotesFor()` carries the
curated Mongolian contrast for `register`, which names exactly this transfer
("Mongolian carries politeness in verb morphology… direct translation reads as
rude"). They steer the phrasing's vocabulary ceiling and word choice. **Nothing
per-user is added to the system prompt, and no language-specific text goes in it
either** — `TEACHER_SYSTEM_PROMPT` stays a byte-identical cached prefix, or input
cost roughly triples, silently.

**No hard CEFR gate**, and this is a deliberate reversal of the obvious move.
Gating this off below B1 (as `register`'s `gate: "B1"` suggests) would switch the
feature off silently based on a self-assessed, optional, free-choice field — and
the app's first learner sits at IELTS 4.0–4.5, right on that boundary, so the
person who asked for this could plausibly never see it and have no way to find
out why. A silent invisibility with a hidden cause is a worse failure than a
slightly early suggestion. The noise this gate would prevent is already prevented
by the cap of one and by the selection rule. `gate` stays unwired.

### 6. `PROMPT_VERSION` 8 → 9, and mirrors

`prompts/teacher.md` is the source and changes **first** (frontmatter `version: 9`),
then the `TEACHER_SYSTEM_PROMPT` string in `shared/schema.ts`, then
`PROMPT_VERSION`, with a new line in its changelog comment:

```
// 9: an optional `natural` phrasing — at most 1 per entry, for a sentence
//    the learner got right. Never a correction (ADR 0004).
```

A change landing on one side of that mirror only is a defect;
`tests/schema.test.ts` rebuilds the prompt from `prompts/teacher.md` and will
catch it. Everything added to the system prompt is static instruction — the cap
of 1 is a written rule, not a per-request number — so the cached prefix stays
byte-identical.

### 7. Cost, stated numerically

One `claude-opus-5` call per entry, up to 3 on the over-rewrite retry. **No new
call, no new agent, no new failure domain.** `MODEL_ID` and the strong tier are
unchanged — this is not a cheap-tier candidate because it is the same call.

- **Response delta: ~70 output tokens, worst case.** One ≤120-char phrasing
  (~30 tokens) + one ≤100-char note (~25 tokens) + JSON keys and the index
  (~15). Typical delta is 0 — the prompt states that no phrasing is a normal
  answer. Against a response that already carries every corrected sentence, up
  to a dozen notes and a 160-word message, that is low single-digit percent.
- **System prompt delta: ~250 tokens of cached prefix.** Read at cache pricing
  (~10% of input), one cache entry for all learners, so the per-entry effect is
  effectively ~25 input-tokens-equivalent. The cache *write* is paid once per
  idle window per prompt version, not per entry.
- **Thinking delta: unbounded and unmeasured, and this is the real cost.** The
  model must now consider the *correct* sentences too, which are the majority.
  `max_tokens` (12,000) bounds thinking **and** response together, and truncation
  is reported as a **permanent** failure for the whole entry — so the risk here
  is not the 70 response tokens, it is thinking growth eating the same budget.
  **`MAX_TOKENS` is not raised under this ADR.** If the truncation rate moves,
  that is its own change with its own measurement.
- **At 1,000 daily active users:** ~1,000 entries/day × ~70 output tokens =
  ~70k extra output tokens/day at the ceiling, ~0 at the typical rate. That is
  not the number to worry about; the thinking delta on 1,000 calls is.
- **Latency:** extra thinking means extra seconds. The client timeout is 540s
  (already far too generous — a standing Known Gap), so there is no timeout risk,
  and this ADR does not tighten it.

`eval-runner` must measure the same entry set under `PROMPT_VERSION` 8 and 9 and
record, per entry: input/output/thinking tokens, wall time, the `stop_reason`
distribution, and **how often a natural phrasing is returned at all**. If it
comes back on nearly every entry, the prompt's "none is normal" is not landing
and the prompt is what gets fixed. If it never comes back, the feature is not
earning its tokens and should be reverted to `PROMPT_VERSION` 8.

### 8. The acute path cannot be reached from here

Confirmed on both sides, structurally rather than by discipline:

- **Worker.** `runPipeline`'s `risk === "acute"` branch returns an explicit
  object literal — `{ risk: "acute", corrected_text: text, corrections: [] }` —
  *before* the diff, the labelling, `attachAlternatives` and
  `boundNaturalPhrasings` exist as executed code. `natural_phrasings` is not
  added to that literal and the literal never becomes a spread of agent output.
- **Prompt.** `<risk_check>` already requires empty notes and empty feedback on
  acute; the new prompt section states in the same breath that there are no
  natural phrasings either.
- **Client.** `Feedback.tsx`'s acute branch is a complete early `return` above
  every line of section rendering (ADR 0003), with its own wrapper and its own
  sections. The new section is added below that return and cannot execute.

Any change that does touch this path goes through `safety-reviewer` before
commit. This one does not touch it.

## Consequences

- **The app gains its first thing to say about a sentence the learner got
  right.** Every other output — corrections, alternatives, ambiguity, the count,
  the trend — is anchored to something that went wrong. That is worth more to a
  learner mid-entry than its token cost suggests.
- **The learner gets one portable, native phrasing a day, and it accumulates.**
  Over 200 entries that is 200 idioms, in their own sentences, on their own
  topics. It is not stored as a pattern and it is not resurfaced — spaced
  repetition remains explicitly unbuilt (`../knowledge/project.md`).
- **Nothing is counted, and structurally cannot be.** `natural_phrasings` carries
  no `category`, `severity` or `pattern_id`, and every statistic
  (`getErrorCounts`, `getExamples`, `getPatternMap`, `topCategories`, `per100`,
  the trend, `formatErrorLog`) only ever iterates `corrections`. This is the same
  shape argument as ADR 0002 Part B: not a discipline the next contributor must
  remember, a place their code cannot reach.
- **The trust surface grows.** An entry can now carry, at the ceiling, 3
  `alternatives` × 2 phrasings + 1 natural phrasing + 1 note = **8 pieces of
  model-asserted, undiffable text**. That is the honest number and it should be
  watched. This ADR does not lower ADR 0002's cap — that would be reopening a
  decision hours old on no evidence — but if `eval-runner` finds the phrasings
  unreliable, lowering 0002's cap is the first lever, not raising this one.
- **`prompts/teacher.md` gets longer**, and it is already a dense prompt doing
  five jobs in one call. The single-agent design (ADR 0001) makes every new
  behaviour a prompt addition rather than a stage, and each addition slightly
  dilutes the others. This is the cost of one agent, accepted knowingly; if the
  corrector's minimality or the risk check degrades under version 9, that is the
  signal that a second agent has become cheaper than a longer prompt.
- **Verification is weaker than the change deserves.** `pipeline.ts` and every
  React screen are untested (no Miniflare, no DOM library). Only
  `boundNaturalPhrasings` gets automated coverage. The implementer must say this
  out loud in the commit and verify the section by hand on: an entry with a
  natural phrasing, an entry without one, an entry where every sentence was
  corrected (must produce none), a legacy 9-agent entry, and the acute branch.
- **Nothing is backfilled, migrated or re-analysed.** Entries stored before this
  ADR have no `natural_phrasings` and render without the section. Backfilling
  would mean re-paying for every past entry and re-judging writing under a prompt
  version it was never analysed with.
- **Old clients keep working.** Zod's `z.object` strips unknown keys, so a stale
  service-worker client validating a `PROMPT_VERSION` 9 response silently drops
  `natural_phrasings` and stores a valid entry.
- **Rollback is one revert.** Revert `prompts/teacher.md`, the mirror and
  `PROMPT_VERSION` to 8. Entries already carrying `natural_phrasings` keep
  rendering — the field stays valid stored data, exactly as `coach_reply` and
  `drills` do.
- **This does not split into parts, unlike ADR 0002.** There, Part A was
  client-only and free while Part B spent money, so shipping A alone tested
  whether layout was the whole complaint. Here every piece rides the same single
  call: shipping the field without the section pays for content nobody sees, and
  shipping the section without the field renders nothing. It lands as one commit,
  and the cap of 1 *is* the small first step — widening is the follow-up.
- **What we gave up:** the guarantee that everything on the Feedback screen is
  either the learner's own text or diff-verified. That guarantee was already
  given up by ADR 0002 Part B; this widens the exception from "attached to a
  taught mistake" to "attached to a sentence that was fine". It is contained by
  the cap of 1, the code bounds, the passive rendering, the static reassurance
  line, and the structural impossibility of reaching a statistic.
- **Records to update in the same commit:** `docs/architecture.md` (the pipeline
  diagram gains the bounding step; the Client paragraph gains the section),
  `../knowledge/ui-guidelines.md` (Screens: the new section and its position),
  `CLAUDE.md` (the "no unverified model text may live inside a `Correction`"
  invariant names `natural_phrasings` alongside `alternatives`; Known Gaps gains
  the unmeasured thinking-cost line). `../knowledge/project.md`'s Feedback row
  still describes "a card per correction" and is already stale from ADR 0003 —
  fix it there or leave it, but do not make it worse.

## Stage contract

No new stage. One stage changes and one pure code step is added.

**`runTeacher`** (`worker/src/pipeline.ts`) — **reads:** unchanged (patched
sentences, learner context, recurring categories, entry number, pattern-fix
summary, known-pattern examples). No new input; `level`, `field` and `goal`
already arrive via `learnerContext()`. **Writes:** adds optional
`natural: [{ index, phrasing, note? }]`, at most 1, only for a sentence it did
not correct. **Model tier:** strong (`MODEL_ID`), unchanged — same call.
**Failure mode:** unchanged. Refusal and truncation fail the entry (permanent);
parse failure and shape mismatch are retryable. A bad `natural` cannot fail
anything: it is optional in `AgentOutputSchema` and absent is normal. **Retry:**
unchanged — up to 2 in-request attempts on over-rewrite; the over-rewrite hint is
**not** extended to mention natural phrasings.

**`boundNaturalPhrasings`** (`worker/src/alternatives.ts`, pure) — **reads:** the
agent's `natural`, the Worker's own `sentences` array, and the set of sentence
indices that produced corrections (`edits.map(e => e.sentIdx)`). **Writes:**
`feedback.natural_phrasings`, with `original` copied from `sentences[index]`.
**Model tier:** none. **Failure mode:** drops silently, per the list in Decision
3; over 1 surviving entry is truncated to 1. It cannot throw and cannot fail.
**Retry:** none.

## What implementers must not do

- Do **not** loosen `<correction_rules>` 1 or 3, and do **not** let a natural
  phrasing become an edit. A correct sentence still comes back byte-identical
  from the corrector. If a diff-confirmed edit appears where a natural phrasing
  was intended, the prompt is broken — fix the prompt, do not accept the edit.
- Do **not** put `natural_phrasings` inside `CorrectionSchema` or
  `StoredCorrection`, and do not give one a `category`, `severity` or
  `pattern_id`. Do not add a new taxonomy category for it, do not route it
  through `register`, and do not wire up `gate: "B1"`.
- Do **not** let it reach `app/src/lib/stats.ts`, `formatErrorLog`, the Error Log
  screen, the pattern map, `buildSegments`, `per100`, the trend, the `h1`
  correction count, or any count anywhere on any screen.
- Do **not** add a second model call, a second agent, or any stage whose only job
  is to check whether a phrasing is really more natural. There is no verification
  stage by design. If they come back wrong, fix the teacher's prompt.
- Do **not** truncate an over-long phrasing or note — drop it. A phrasing cut
  mid-word is broken English shown to a learner as a model of good English.
- Do **not** raise the cap above 1 in this change, and do not let the four places
  it appears (prompt, `AgentOutputSchema`, the code constant, `FeedbackSchema`)
  disagree. Widening is a separate change, after measurement, in all four at once.
- Do **not** emit a natural phrasing for a sentence that produced any correction,
  pattern-sourced or model-sourced. Enforce it in code as well as in the prompt.
- Do **not** store the sentence index in `FeedbackSchema`, and do not read
  `original` from the model. The Worker copies it from its own sentence array.
- Do **not** put the section inside "Every change", inside a correction row, or
  above the teacher's message. Do not render it with `EditSpan`, `<del>`/`<ins>`,
  an arrow, an accent rule bar, a tick, a badge or a colour. Do not make it
  interactive: no tap-to-reveal, no choice, no drill. The drills agent does not
  return under this ADR.
- Do **not** show the section when `natural_phrasings` is empty or absent, and do
  not add an empty state, a placeholder or an explanatory panel for its absence.
  Invisible on most entries is the design.
- Do **not** reintroduce a second navigation model on the Feedback page: no
  accordion, no "show more", no jump link, no sticky anything (ADR 0003).
- Do **not** interpolate the learner's `level`, `field`, `goal`,
  `nativeLanguage`, l1 notes or anything else per-user or per-request into
  `TEACHER_SYSTEM_PROMPT`, and do not put language-specific text in it either. It
  is a byte-identical cached prefix.
- Do **not** let the phrasing or the note react to what the entry *says*. This is
  the grammar voice, not a reply. No sympathy, no encouragement about the
  learner's day, no comment on their content — that is the human-reply path,
  which does not exist yet and is not being merged in here.
- Do **not** touch the acute path: not `pipeline.ts`'s `risk === "acute"` branch
  or its explicit object literal, not `Feedback.tsx`'s early `return`. Do not add
  `natural_phrasings` to the acute feedback object. Any change that does touch it
  goes through `safety-reviewer` before commit.
- Do **not** change `MAX_TOKENS`, `MAX_REWRITE_RATIO`, the retry loop, the 540s
  client timeout, `MODEL_ID`, the taxonomy, `worker/src/patterns.ts`,
  `worker/src/diff.ts` or `worker/src/sentences.ts` under this ADR.
- Do **not** reopen ADR 0002 Part B. `alternatives` keeps its shape, its `for`
  key, its ≤3 × 2 cap and its render site inside the taught row. Do not merge the
  two arrays, and do not render both under one heading.
- Do **not** extend `api.ts`'s `text.includes(c.original)` regression guard to
  `natural_phrasings`, and do not delete it.
- Do **not** backfill, migrate or re-analyse stored entries. Do not delete or
  hide any legacy render path.
- Do **not** ship this without `eval-runner` measuring `PROMPT_VERSION` 8 against
  9 on the same entry set, and do not report it done without saying out loud that
  `pipeline.ts` and the new section have no automated coverage.
