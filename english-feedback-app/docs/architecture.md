# Architecture

Two deployed pieces plus shared code. Entries live only in the learner's
IndexedDB; the Worker holds the API key and never stores anything.

## Per-entry pipeline (worker/src/pipeline.ts)

```
client ── POST /analyze ──▶ policy (code)          validate before spending
                            split (code)           sentences.ts
                            matcher (code)         Top-100 deterministic fixes,
                                                   hits carry pattern ids
                            THE TEACHER (llm)      the one runtime agent:
                                                   risk check · minimal correction
                                                   · ambiguity · per-change notes
                                                   · teacher message
                            diff (code)            edits vs the ORIGINAL text —
                                                   the model never produces the
                                                   error list
                            label (code)           pattern edits from taxonomy;
                                                   model edits from the notes zip
                            assemble ──▶ Feedback (client validates, stores)
```

`risk: acute` short-circuits after the call: no corrections, no teacher
message; the client renders the wellbeing screen with human-written guidance.

## The two agent layers

**Runtime agents** are model calls made per entry. There is exactly ONE
(ADR 0001). The full 9-agent library in `knowledge/agent_prompts.md` is the
growth map; each agent returns by ADR when its cost is justified.

**Build-time subagents** live in `.claude/agents/` and run while developing:
`architect`, `pipeline-engineer`, `prompt-engineer`, `linguistics-curator`,
`eval-runner`, `safety-reviewer`. They hand off through files (ADRs, prompts,
YAML, reports), not conversation.

## Sources and mirrors

| Source (edit first)              | Mirror (runtime)            |
|---|---|
| `knowledge/error_taxonomy.yaml`  | `shared/taxonomy.ts`        |
| `knowledge/top_100_patterns.yaml`| `shared/patterns.ts`        |
| `prompts/teacher.md`             | `shared/schema.ts` prompt   |

A change that lands in only one side of a mirror is a defect.
`tests/patterns.test.ts` holds the round-trip proof for every deterministic
pattern.

## Client (app/)

React PWA. Write → claim → analyse → Feedback card stack; Patterns derives
everything (counts, trend, clean streaks, the pattern map scoped to the 49
deterministically-detectable patterns) from stored entries on read. Offline
queue with bounded, classified retries.
