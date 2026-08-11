# 0001. Collapse the runtime pipeline to a single agent

## Status: accepted

## Context

The 9-agent library (`knowledge/agent_prompts.md`) was implemented in full:
distress classifier, corrector, error tutor, fluency, human coach, teacher
voice, drills, level estimator, weekly review — up to 8 Anthropic calls per
entry across two model tiers, plus two extra routes. Cost and latency were
unmeasured, the app is not yet deployed, and there are zero real users. The
user directed: one runtime agent for now; the agent *library* stays as the
map of where the pipeline grows back, and the build-time subagents in
`.claude/agents/` own how we work on it.

## Decision

One model call per entry — "the teacher" (`prompts/teacher.md`, mirrored into
`shared/schema.ts`). Everything deterministic stays in code and runs exactly
as before: request policy, sentence split, the Top-100 pattern matcher
(before the call), the word-level diff (after it), taxonomy labelling of
pattern-sourced edits, statistics on the client.

The one agent, in a single structured output, does what previously took four
calls:

- an inline risk check (acute → everything else empty; the Worker returns a
  no-grammar response and the client shows the wellbeing screen)
- the minimal correction of the pattern-patched sentences, with ambiguity
  flagged instead of guessed
- one `note` (category + one-sentence rule) per change it made, in reading
  order per sentence — the diff still produces the edit list; notes are only
  labels, zipped onto diff-confirmed model edits in order
- the teacher message (≤3 corrections mentioned, recurring counts, checklist
  numbers for pattern fixes)

Cut from runtime, kept in the library for later: dedicated distress
classifier, error tutor, fluency, human coach (and wellbeing variant),
drills, level estimator, weekly review — and with them `SMALL_MODEL_ID`, the
`/level` and `/review` routes, and the client's level/review storage and UI.
The stored `Feedback` shape is unchanged (those fields were already
optional), so nothing about old entries moves.

## Consequences

- Cheaper and faster by construction: 1 call instead of up to 8, one cache
  prefix, one failure domain. Measurable before scaling up.
- The error-list invariant holds: spans still come only from the diff. The
  zip of notes→edits is order-based; a mismatch degrades that edit's label to
  `other` with a pair-based explanation rather than inventing anything.
- The risk gate is weaker than a dedicated classifier (same call, same
  prompt, fails open on upstream error). `safety-reviewer` guards this path;
  restoring the dedicated gate is the first candidate when agents return.
- No coach reply, drills, fluency notes or weekly review on new entries. The
  screens already render their absence.
- Grammar and empathy stay unmixed by omission: the teacher does not perform
  comfort; there simply is no comfort voice until the coach returns as its
  own agent.

## Stage contract

`runTeacher` (worker/src/pipeline.ts) — reads: patched sentences, learner
context, recurring categories, entry number, pattern-fix summary; writes:
`risk`, `corrected[]`, `ambiguous[]`, `notes[]`, `feedback`; tier: strong
(`MODEL_ID`); failure: refusal/truncation fail the entry (classified), parse
failure retryable; retry: up to 2 in-request attempts on over-rewrite, as
before.
