# Life Reset — agent architecture

A LangGraph agent for a self-improvement app with three domains: **fitness**,
**self-care**, and **personal development**.

The organising principle is the same one you used for the journaling app's
diffing: **anything computable is computed in code; the model only classifies,
extracts, and phrases.** A coach that hallucinates a load is worse than no coach.

```
python demo.py          # offline, deterministic
python demo.py --live   # uses ANTHROPIC_API_KEY for the LLM nodes
```

## The determinism boundary

| Layer | Owns | Can it invent? |
|---|---|---|
| `catalog.py` | every exercise, self-care item, dev habit, split template | no — closed list |
| `engine.py` | scheduling, exercise selection, load progression, adherence, streaks, the rendered brief | no — pure functions |
| LLM nodes | intent classification, log extraction, coaching prose, weekly reflection | constrained, then checked |
| `guardrail` | drops any coach message containing a number not present in the plan | — |

`plan.brief_md` is rendered by `engine.render_brief`. If the LLM is down, the app
still works; the user just loses the prose framing.

## Nodes

| Node | Kind | Responsibility |
|---|---|---|
| `load_context` | I/O | Pulls profile, logs, durable memory from the store |
| `classify_intent` | LLM + rules | `daily_brief` / `log_session` / `replan` / `reflect` / `ask` |
| `replan` | code | Turns "travelling, 30 min, shoulder hurts" into *profile* edits |
| `parse_log` | LLM | Extracts structured sets/reps/loads; validates IDs against the catalog |
| `compute_cycle` | code | Week index, mesocycle deload, 14-day adherence, per-domain streaks |
| `persist` | I/O | Appends logs, promotes PRs, records adherence patterns |
| `fitness` | code | Which day → which session → which exercises → which load |
| `self_care` | code | 3 items/day, matched to today's training load and recent history |
| `development` | code | One deep-work block on the rotating track + micro-habits |
| `compose_brief` | code | Deterministic markdown render — the source of truth |
| `coach` | LLM | 2–4 sentences of framing over an already-decided plan |
| `guardrail` | code | Number check; drops prose rather than shipping a wrong figure |
| `reflect` | LLM | Weekly review over computed aggregates |
| `answer` | LLM | General Q&A grounded in the profile |

## Routing

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

One path builds the plan. Constraints mutate the **inputs** (profile) and let the
same nodes re-derive everything — so a travel day and a normal day go through
identical code, and there is only one place a bug can live.

## How the fitness logic answers "which day, which exercise"

1. `SPLITS[days_per_week]` maps weekday → session template. 4 days/week gives
   Mon Upper A, Tue Lower A, Thu Upper B, Fri Lower B, rest otherwise.
2. Each template slot is a *movement pattern* (`squat`, `h_pull`, `core`), not a
   named exercise.
3. `pick_exercise` filters the catalog by equipment, injuries, and experience
   level, then rotates variation once per mesocycle — same week, same answer, so
   the plan is stable if the user reopens the app.
4. `progress_load` runs double progression off the last logged set:
   top of range at RIR ≤ 1 → add an increment; under range → back off 10%;
   deload week → 85%. Every prescription carries a `note` explaining the number.

## Extension points

- **Store**: implement the `Store` protocol in `store.py` against Postgres.
- **Persistence across turns**: pass a LangGraph checkpointer to `build_graph`.
- **New domain** (finances, sleep tracking): add a catalog list, an `engine`
  picker, and one node between `development` and `compose_brief`.
- **Nutrition**: intentionally absent. If you add it, keep targets in the profile
  and out of the model — same reason as loads.

## Open questions worth deciding before you build the UI

1. **Is the plan generated on open, or precomputed nightly?** Precomputing makes
   the week view instant and lets you push notifications, but you then need an
   invalidation rule for mid-day replans.
2. **Where does the streak live?** Right now it is derived from logs, which means
   it is always correct but costs a scan. Denormalise once logs grow.
3. **Does the coach voice persist across days?** If yes, `memory` needs to hold
   the last few coach messages so it does not repeat itself.

---

# The 66-day program layer

`program.py` + `agents.py` add the piece a guided-program app needs and a daily
planner does not: **a plan that is decided once and defended for 66 days.**

```
python demo_program.py
```

## Three agents, not fourteen

| Agent | Runs | Model | Job |
|---|---|---|---|
| **Architect** | once per user | large | Select 6–9 habits from the catalog and assign start days |
| **Adaptation** | on failure signal | small | Choose the smallest sacrifice that keeps the user going |
| **Companion** | when the user journals | small | Reflect on the entry, notice patterns |

Everything else — ramps, phases, streaks, milestones, the daily view — is
`program.py`, and runs without a network call.

## The contract both agents follow

The model chooses **from a closed set**; code validates; code **repairs** rather
than re-prompting. A retry loop against an LLM is not an error-handling strategy.

`validate()` walks all 66 days and checks: phase habit caps, no more than 2 new
habits per rolling week, nothing introduced after day 56, and the daily minute
budget on *every single day*. An infeasible day 41 is the most expensive bug in
this product, because the user does not discover it until day 41.

`repair()` fixes violations in a fixed order of sacrifice: push start days later,
then drop the latest-introduced highest-friction habit. The Architect is asked to
list habits by importance, so the last items are what gets cut.

## Adaptation patches, not rewrites

There is deliberately no "regenerate the program" operation. Four ops only:
`soften` (reduce dose, keep habit), `freeze` (pause the ramp), `defer` (push a
not-yet-started habit later), `drop` (last resort, max one per patch).

**The day counter never resets.** A reset erases the only thing the user has
actually earned, and it is why most streak apps lose people at the first stumble.
Missing days 20–23 gets you a softened day 24 — still day 24 of 66.

The prompt's rules are re-enforced in code afterwards: habits above 70%
completion are filtered out of the patch, and the patch is capped at two habits.
Overcorrecting reads to the user as the app giving up on them.

## What is not an agent

Pomodoro, workout counter, streak maths, the ramp curve, milestone unlocks, and
the screen blocker (iOS Screen Time / Android UsageStats) are all ordinary code.
Guided meditation is TTS over a written script. Book summaries are a licensing
decision, not an engineering one — do not generate them.

---

# Review: where errors actually get caught

There is no reviewer agent, and adding one would make this worse. An LLM checking
an LLM's output shares the first model's blind spots — the same ambiguity that
produced the bad program makes the reviewer accept it. You pay twice, wait twice,
and cannot write a regression test for the result.

Three layers instead, none of them an agent:

| Layer | When | Catches |
|---|---|---|
| `validate()` | every Architect output, every patch | Constraint violations on any of the 66 days |
| `repair()` | immediately after `validate` | Fixes them deterministically, no re-prompt |
| `eval_harness.py` | CI, before every release | Bugs in `validate` and `repair` themselves |

```
python eval_harness.py          # 2000 synthetic users × 66 days
python eval_harness.py --live   # includes real Architect calls
```

## What the harness found

First run against the code as originally written: **8 bug classes across 132,000
day-renders.** All would have shipped.

| Bug | Symptom | Root cause |
|---|---|---|
| `dose_in_bounds` | deep work prescribed 100 min against a 90 min target | rounding to the step overshot; no clamp |
| `freeze_holds_dose` | freeze op did nothing | held the ramp against a day that was always ≤ itself |
| `min_habits` | programs shipped with 2 habits | repair could drop below the floor |
| `patch_is_small` | 41-op "patches" | patch size measured including the repair cascade |
| `working_habit_untouched` | a habit at 100% completion got its dose changed | repair reshuffled start days mid-streak |
| `phase_cap`, `daily_budget`, `repair_leaves_no_violations` | infeasible programs shipped | see below |

That last cluster was one root cause, and the interesting one: **repair used a
single sacrifice heuristic for two different constraints.** A phase-cap violation
means too many *habits* — drop the newest. A budget violation means too many
*minutes* — drop the most expensive. Using "newest" for both made repair swap two
zero-cost habits back and forth forever while the 20-minute habit sat untouched,
burning every pass and shipping the violation.

No amount of prompt engineering finds that. A reviewer agent would have read the
program, seen sensible-looking habits, and approved it.

## The invariants

Per user, walked across all 66 days: daily minute budget, phase habit caps, doses
monotonic toward target, doses inside `[start, target]`, no duplicates, catalog
membership, start days in range, minimum habit count. Per patch: intervention
fires when needed, patch touches ≤ 2 habits, habits above 70% completion are
untouched, the day counter never resets, and the program is still valid afterwards.

Adversarial Architects are cycled in: malformed JSON, prose instead of JSON,
invented habit ids, duplicates, negative and out-of-range start days, all 20
habits on day 1, a single habit, and every high-friction habit at once. Repair has
to survive all of them, because a real model will produce all of them eventually.
