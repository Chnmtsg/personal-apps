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
| `life_reset/catalog.py` | The closed lists: 20 habits, 3 phases, the constraint constants |
| `life_reset/program.py` | `dose_for`, `minutes_for`, `program_day`, `validate`, `repair`, `_respace`, `apply_patch`, `render_program_day` |
| `life_reset/agents.py` | Architect (`build_program`, `coerce_program`, `fallback_program`) and Adaptation (`diagnose`, `adapt_program`) |
| `life_reset/nodes.py` | `AnthropicLLM` — the only file that imports `anthropic` |
| `eval_harness.py` | 12 adversarial Architects, the invariants, per-user and per-patch |
| `demo_program.py` | Hostile Architect → repaired programme → a user who stops for four days |

**Current numbers:** 2,000 users, ~165,000 day-renders, **zero invariant
violations**. A separate fuzz over 12,000 random programmes: `repair` leaves
zero infeasible days, `build_program` returns zero invalid programmes.

## Not built yet

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
