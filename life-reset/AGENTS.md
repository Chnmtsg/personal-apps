# Agents and nodes — reference

Three separate systems. They are not one graph and should not be merged.

| Layer | File | Runs | Purpose |
|---|---|---|---|
| Daily graph | `life_reset/graph.py` | every user interaction | Derive and serve today |
| Program layer | `life_reset/agents.py` | onboarding + failure events | Own the 66-day plan |
| Build factory | `factory.py` | your laptop / CI | Write the app itself |

Column key used throughout: **code** = pure function or subprocess, no model,
deterministic, unit-testable. **LLM** = a model call. **I/O** = touches the store
or filesystem.

---

## 1. Daily graph — 14 nodes

`build_graph(llm, store, checkpointer)` in `life_reset/graph.py`.

```
START → load_context → classify_intent
                        ├─ replan    ─┐
                        ├─ parse_log ─┤
                        ├─ answer → END
                        └─────────────┴→ compute_cycle
                                            ├─ reflect → END
                                            ├─ persist ─┐
                                            └───────────┴→ fitness → self_care
                                                → development → compose_brief
                                                → coach → guardrail → END
```

| # | Node | Kind | Reads | Writes | Notes |
|---|---|---|---|---|---|
| 1 | `load_context` | I/O | `user_id`, `today` | `profile`, `logs`, `memory` | Only node that reads the store |
| 2 | `classify_intent` | LLM + rules | `user_input` | `intent` | Regex fallback when the model is unavailable; constraint words beat "plan" |
| 3 | `replan` | code | `user_input` | `profile` | Constraints edit the *profile*, so one code path serves every case |
| 4 | `parse_log` | LLM | `user_input` | `logs`, `guardrail_flags` | Exercise ids validated against the catalog; unknown ids dropped, not guessed |
| 5 | `compute_cycle` | code | `logs`, `profile` | `week_index`, `adherence`, `deload`, `streaks` | 14-day trailing window |
| 6 | `persist` | I/O | `logs` | `memory_writes` | Promotes PRs, records adherence patterns |
| 7 | `fitness` | code | `profile`, `logs`, `week_index` | `plan.fitness` | Weekday → split → pattern → exercise → load |
| 8 | `self_care` | code | `plan.fitness`, `adherence` | `plan.self_care` | 3 items, matched to today's training load |
| 9 | `development` | code | `profile`, remaining budget | `plan.development` | Rotating deep-work track + micro-habits |
| 10 | `compose_brief` | code | `plan` | `plan.brief_md` | **Source of truth.** Works with the LLM offline |
| 11 | `coach` | LLM | `plan` summary | `coach_message` | Voice only. Receives an already-decided plan |
| 12 | `guardrail` | code | `coach_message`, `plan` | `coach_message`, flags | Drops prose containing any number not in the plan |
| 13 | `reflect` | LLM | computed aggregates | `coach_message` | Weekly review; never counts anything itself |
| 14 | `answer` | LLM | `profile`, question | `coach_message` | General Q&A; defers medical questions |

Routing functions: `_route_intent` (after `classify_intent`), `_route_after_cycle`
(after `compute_cycle`). Both are plain functions on `state["intent"]`.

Supporting pure functions live in `life_reset/engine.py`: `week_index`,
`is_deload`, `adherence`, `streaks`, `pick_exercise`, `progress_load`,
`build_session`, `pick_self_care`, `pick_development`, `render_brief`.

---

## 2. Program layer — 2 agents

`life_reset/agents.py`. Not a graph; two entry points called from your app.

### Architect — `build_program(llm, intake, user_id, start_date, minutes_budget)`

Runs **once per user, ever**. The one place a large model is worth paying for.

| Step | Kind | What happens |
|---|---|---|
| `architect_system_prompt()` | code | Builds the prompt from the live catalog, so adding a habit needs no prompt edit |
| model call | LLM | Selects 6–9 habits, assigns start days 1–56, orders by importance |
| id validation | code | Unknown ids rejected, duplicates dropped |
| `fallback_program()` | code | Used if the model returns <3 valid habits. A working program beats a spinner |
| `repair()` | code | Fixes every constraint violation deterministically |

Returns `(Program, meta)` where `meta` carries `source` (`llm` or `fallback`),
`rejected` ids, `repairs` applied, and `violations_remaining` — which must be empty.

### Adaptation — `diagnose(...)` then `adapt_program(...)`

| Step | Kind | What happens |
|---|---|---|
| `diagnose` | code | Per-habit completion rates, consecutive missed days, `needs_intervention` |
| model call | LLM | Chooses *which* habits to sacrifice, from four fixed operations |
| rule enforcement | code | Strips ops on habits above 70% completion; caps the patch at 2 habits |
| `apply_patch` | code | Applies ops, then repairs, protecting habits already underway |

Operations: `soften`, `freeze`, `defer`, `drop`. **There is no rewrite operation
and the day counter never resets.**

### Deterministic core — `life_reset/program.py`

| Function | Purpose |
|---|---|
| `dose_for` / `minutes_for` | Weekly step ramp, clamped to `[start, target]` |
| `program_day` | Everything committed on a given day |
| `phase_for`, `day_index` | Phase lookup, calendar → day number |
| `validate` | Walks all 66 days: budget, phase caps, spacing, ranges |
| `repair` | Deterministic fix; different sacrifice heuristic per constraint |
| `_respace` | Even ladder of start days, one pass, no search |
| `apply_patch` | The only sanctioned way to change a live program |
| `render_program_day` | Deterministic day view |

---

## 3. Build factory — 8 nodes

`factory.py`. Builds the app; ships nothing to users.

```
idea → spec → plan → ┌─ implement → gate ─┐ → critic → integrate → END
                     └────── fail ────────┘
                                │
                          N failures → escalate → plan
```

| # | Node | Kind | Purpose |
|---|---|---|---|
| 1 | `spec` | LLM | Idea → acceptance criteria. Criteria with no runnable check are dropped and reported |
| 2 | `plan` | LLM | Criteria → ordered tasks, one criterion each |
| 3 | `implement` | LLM + FS | The only node that writes files. Path containment enforced in code |
| 4 | `gate` | **code** | Runs the check, reads the exit code. No model. This node decides |
| 5 | `advance` | code | Move to the next task |
| 6 | `escalate` | code | After 3 failures, replan — repeated failure is evidence the *task* was wrong |
| 7 | `critic` | LLM | Once, at the end. Only what tests cannot detect: intent match, API shape |
| 8 | `integrate` | code | Full suite, not just per-task checks; reports blocked tasks honestly |

`MAX_ATTEMPTS = 3` per task, 2 replans maximum, then it ships blocked and says so.

---

## Cost model

| Agent | Calls per user | Model |
|---|---|---|
| Architect | 1, ever | large |
| Adaptation | ~3–5 across 66 days | small |
| Companion / coach | only when the user writes | small |
| Daily plan | **0** | none — it is a pure function |

Roughly 15–25 calls per user across an entire 66-day program. The version that
bankrupts you calls a model every morning to compose a brief that `render_brief`
already produces for free.

---

## Where errors are caught

| Layer | When | Catches |
|---|---|---|
| `validate()` | every Architect output and patch | Constraint violations on any of the 66 days |
| `repair()` | immediately after | Fixes them without re-prompting |
| `guardrail` | every coach message | Numbers the model invented |
| `eval_harness.py` | CI | Bugs in `validate` and `repair` themselves |
| `gate` | every factory task | Code that does not actually work |

No reviewer agent appears anywhere in that table, deliberately. An LLM checking an
LLM shares the first model's blind spots. The harness found 8 bug classes in
132,000 day-renders that a reviewer agent would have read and approved.
