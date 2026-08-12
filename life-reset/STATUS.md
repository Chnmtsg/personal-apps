# Build status

`README.md` and `AGENTS.md` are the **specification**. This file is what exists.

```
python tests.py            # unit tests — the layer the harness cannot cover
python demo_program.py     # the 66-day layer, end to end, offline
python eval_harness.py     # 2,000 synthetic users x 66 days
```

All three run on a bare interpreter — no key, no network, no third-party packages.

## The harness was not the safety net it looked like

An independent review found a bug that ~165,000 day-renders reporting "zero
invariant violations" had passed straight over: **`meditate` asked for 4 minutes
on day one against a catalog entry that says 3**, and ramped `0, +4, 0, +4`
against a declared step of 2. `deep_work` jumped 25 → 40 against a step of 10.

`dose_for` rounded `start_dose + ramp` to a multiple of `step`, which displaces
any habit whose starting dose is not already one. Every invariant passed because
the wrong numbers were still monotonic and still inside `[start, target]`.

The reason it survived is structural, and worth stating plainly: **the harness
verifies `dose_for` by calling `dose_for`.** Its day-walk checks are built from
the same primitives as the code under test, so an arithmetic error is simply
consistent with itself. `tests.py` now computes expected doses from the `Habit`
fields directly — an independent oracle rather than a second caller.

Reverting the fix demonstrates the split exactly:

| | dose bug reintroduced |
|---|---|
| `tests.py` | **3 failures**, naming `meditate` and `deep_work` with exact numbers |
| `eval_harness.py` | no invariant violations |

A second finding in the same class: the harness's `intervention_fires` assertion
was `A and not (A or B)` — `False` for every input. It ran 2,000 times per
invocation and could never fail. Both triggers are now tested independently.

## Built and verified

| File | What it is |
|---|---|
| `life_reset/catalog.py` | The closed lists: 24 habits, 3 phases, the constraint constants |
| `life_reset/program.py` | `dose_for`, `minutes_for`, `program_day`, `validate`, `repair`, `_respace`, `apply_patch` (five ops, `resume` included), `DayEntry`/`record_day`, `render_program_day` |
| `life_reset/agents.py` | Architect (`build_program`, `coerce_program`, `fallback_program`) and Adaptation (`diagnose`, `adapt_program`) |
| `life_reset/recommend.py` | `recommend`, `apply_recommendation` — `add` and `advance`, pure code, no model |
| `life_reset/session.py` | `where`, `check_in` — the app-facing loop: run boundaries, and step-in-or-offer |
| `life_reset/state.py` | `SCHEMA_VERSION` 2, `to_dict`/`from_dict`, `dumps`/`loads`, `_upgrade` — the stored shape, no I/O |
| `life_reset/nodes.py` | `AnthropicLLM` — the only file that imports `anthropic` |
| `eval_harness.py` | 12 adversarial Architects, 17 adversarial Adaptations, the invariants, per-user, per-patch, per-recommendation and per-save |
| `demo_program.py` | Hostile Architect → repaired programme → a user who stops for four days → the same user recovered |

**Current numbers:** 2,000 users, ~165,000 day-renders, 1,652 recommendations
offered and accepted (1,468 `add`, 184 `advance`), 5,010 saves written and read
back, 1,000 check-ins (505 patched, 321 offered, 174 quiet), all five patch ops
landed (soften 264, freeze 67, drop 19, defer 17, resume 184), **zero invariant
violations**; 108 unit tests. A separate fuzz over 12,000 random programmes:
`repair` leaves zero infeasible days, `build_program` returns zero invalid
programmes.

The per-kind split in the harness summary is part of the check, not decoration.
The `advance` half first reported **zero** — the harness patched people and then
stopped watching, so the only state that op fires in was never modelled and its
assertions all passed without running. That is the same shape as the
`A and not (A or B)` tautology below.

The same leak bit the codec. `check_round_trip` compares against the original
`Program`, which is a sound oracle — but the only programmes it had were the
harness's own, and `adapt_program(None, ...)` softens every time, so none of
them has ever carried a `frozen_day`. Deleting that field from `to_dict` passed
2,000 users clean while failing a unit test by name. The check now round-trips a
twin with every optional field populated, and catching the same break went from
zero violations to 2,599.

## The decision behind schema 2

`dose_for` answers from a habit's *current* state, so softening on day 30
changes what it says day 12 asked for. Two ways out, and the cheap one is the
one that was taken:

| | |
|---|---|
| **Taken** — record the day | `record_day` freezes what each habit asked and whether it happened. A past day is read, so the drift has nowhere to land. `ProgramHabit` unchanged. |
| **Rejected** — dated adjustments | `Adjustment(day, scale, frozen_day, ramp_shift)` replayed up to the day being asked about. Strictly more correct, also fixes the resume jump, and rewrites `dose_for`, `repair`, `apply_patch`, `recommend`, the schema and most tests at once. |

The rejected one touches the function whose arithmetic error once survived
165,000 clean day-renders, and `repair` is already at its stated complexity
ceiling. The record buys the same guarantee where it is actually needed.

`diagnose` moved with it: it used to decide whether a day counted from the
habit's *current* `start_day`, so deferring a habit on day 30 re-scored the
fortnight behind it. It now reads the record.

The `never_both` invariant was vacuous when written, for the third time in
this file's history. An `advance` needs an *eased* habit the user is keeping,
and nothing in the harness eases a habit somebody is succeeding at — so
breaking `check_in` to offer suggestions alongside a patch changed nothing in
the summary while failing a unit test by name. Both suites now construct the
conjunction deliberately, and the same break raises 204 violations.

## Four crashes the Adaptation adversaries found

`apply_patch` had five ops and the harness executed one, because
`adapt_program(None, ...)` takes the fallback path and emits a single
`soften`. Giving Adaptation adversaries of its own — the Architect has had
twelve since the start — turned up four crashes reachable from a plausible
model response, every one of them landing in the app's daily check-in:

| op payload | before |
|---|---|
| `soften factor:"half"` | `ValueError` out of `float()` |
| `soften factor:null` | `TypeError` out of `float()` |
| `defer days:"soon"` | `ValueError` out of `int()` |
| `soften factor:NaN` | `scale=NaN`, validates clean, run **unsaveable** |

The NaN one is the interesting one. It passed `float()`, `min`/`max` returned
it unchanged, and `max(0.0, nan)` inside `dose_for` then returned 0.0 — the
ramp dead for the whole run, on a programme `validate` called healthy. The
next save threw, because `state.dumps` refuses NaN, and it threw for every
save after that. Removing the fix now raises 95 harness violations across
three classes.

The harness itself had to be fixed to report it: `state.dumps` raises a plain
`ValueError`, not `StateError`, so the NaN killed the run instead of being
counted, and a harness that dies on the first bug reports nothing about the
other 1,900 users.

## Not built yet

A **store**. `state.py` decides the shape and does the codec; where the bytes go
is still the caller's, and there is no `Store` protocol, no file layer and no
sync. That is deliberate — the shape was the part that gets expensive after it
ships.

The **daily graph** — `life_reset/graph.py` and its 14 nodes, plus
`engine.py`, `store.py`, `demo.py`. `factory.py` and `demo_factory.py` came
with the spec and need `langgraph`, which is not installed
(`demo_factory.py` also imports `life_reset.nodes`, so it needs `anthropic`).

## Four bugs the harness found in this code, and what they were

Written down because each one is a class, not an incident — the same shapes
will come back the next time `repair` is touched.

1. **One sacrifice heuristic for two constraints.** A phase-cap violation means
   too many *habits*; a budget violation means too many *minutes*. Using
   "newest" for both is the bug the spec calls out, and writing it a second
   time is easy.
2. **Stacking instead of sacrificing.** `_respace` clamped unplaceable habits
   onto day 56, which satisfies the loop and ships the exact violation it was
   meant to remove. It now drops them — and looks *earlier* before it does,
   because dropping five habits to fix a spacing problem took the programme
   under its own floor.
3. **A spacing check that only looked backwards.** Counting starts in
   `[day-6, day]` is not the rule; the rule is that *every* window stays legal.
   Slotting a habit into day 1 looked free and made day 7 the third start in a
   week. The check now runs the same test `validate` does.
4. **Flattening before dropping.** `scale` reduces the ramp across all 66 days,
   so softening to fit one overshoot on day 60 left the user on their starting
   dose for the whole run — five habits that never move instead of four that
   do. The ramp is the product; flattening is what is left when there is
   nothing to remove.

The fourth is the one no invariant catches. Every programme it produced was
*valid* — inside budget, inside the phase caps, monotonic — and useless. That
is the limit of a harness: it proves the rules hold, not that the thing is
worth using. Reading `demo_program.py`'s output is what caught it.

**And a fifth, of exactly that class, found the same way.** The recommender
offered `Drink water · 4 -> 4 glasses`. `scale` multiplies the week count before
rounding, so raising it from 0.5 to 0.75 landed on the same step: a button that
validated, kept every invariant, and changed nothing the user could see. It ran
369 times across 2,000 users without a complaint, because nothing was wrong with
the programme — the *suggestion* was empty, and no invariant is written about
those. The demo printed it on the first read. `recommend` now requires
tomorrow's ask to actually rise, and removing that one clause fails a named unit
test and raises 103 harness violations.
