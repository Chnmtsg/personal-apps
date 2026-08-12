# Life Reset

## Purpose

A Python engine for a 66-day habit programme: a closed catalog of habits, a
deterministic ramp, and a validate/repair pair that turns any Architect output —
including malformed, hostile or invented — into a programme feasible on all 66
days.

Not an app. No UI and no server. `state.py` decides how a run is *stored*, but
there is no store — where the bytes go is the caller's. A library with demos.

**Read `STATUS.md` first.** `README.md` and `AGENTS.md` are a *specification
written before the code*, and they describe substantially more than exists —
a whole daily-graph layer (`graph.py`, `engine.py`, `store.py`, `demo.py`) is
documented in detail and not built. Treat those two files as intent. `STATUS.md`
is the inventory.

---

# Layout

```
life_reset/catalog.py    closed lists: 24 habits, 3 phases, the constraints
life_reset/program.py    dose/ramp maths, validate, repair, apply_patch, record, render
life_reset/agents.py     Architect and Adaptation, both LLM-optional
life_reset/recommend.py  what to do next when it is going *well* — pure code
life_reset/state.py      the stored shape: versioned JSON in, Program + record out
life_reset/session.py    the loop an app runs: where() and check_in(). Policy only
life_reset/nodes.py      AnthropicLLM — the ONLY file that imports anthropic
eval_harness.py          2,000 synthetic users x 66 days, 12 hostile Architects
tests.py                 unit tests — the layer the harness cannot cover
demo_program.py          end to end, offline
factory.py               came with the spec; needs langgraph, not installed
demo_factory.py          came with the spec; imports life_reset.nodes at module scope
```

---

# Verifying

Run from `life-reset/`. Never report a change as done without both.

```bash
python tests.py            # 108 unit tests
python eval_harness.py     # 2,000 users x 66 days
```

`demo_program.py` is the third check and the one that catches what neither
automated suite can — see "valid but useless" below. Read its output.

All three run on a bare interpreter. **The deterministic core imports nothing
third-party**, and that is a property worth defending: it is what makes 165,000
day-renders a test rather than a bill. Only `nodes.py` imports `anthropic`, and
only the `--live` paths import `nodes.py`.

---

# The harness is not the safety net it looks like

This is the most important thing to know before changing anything.

`eval_harness.py` checks whole-programme *properties* across thousands of
synthetic users, and it is good at that. It **cannot** catch a per-function
arithmetic error, because it verifies `dose_for` by calling `dose_for` — every
check it runs is built from the same primitives as the code under test, so a
wrong number is simply consistent with itself.

That is not hypothetical. `dose_for` rounded `start_dose + ramp` to a multiple of
`step`, so `meditate` asked for **4 minutes on day one against a catalog entry
that says 3**, and ramped `0, +4, 0, +4` against a declared step of 2. It
survived ~165,000 day-renders reporting zero invariant violations, because the
wrong values were still monotonic and still inside `[start, target]`.

`tests.py` exists for exactly this. Its dose tests compute expected values from
the `Habit` fields directly — an independent oracle, never by calling the
function under test. Reintroduce that bug today and `tests.py` fails three
assertions by name while the harness still reports zero violations.

**A test that shares its subject's arithmetic is a tautology with extra steps.**
A second one lived here too: an assertion of the form `A and not (A or B)`,
false for every possible input, that ran 2,000 times per invocation and tested
nothing for its whole life. When you add an invariant, ask what input would make
it fail — and if you cannot name one, it is not an invariant.

---

# The cycle an app runs

Nine calls, and `session.py` owns the two orderings that matter. Everything else
is called directly — wrapping `record_day` under a second name would not be an
API, it would be a second name.

```python
from datetime import date
from life_reset import (build_program, dumps, loads, where, check_in,
                        program_day, record_day, apply_recommendation)

# Once per user, ever. The one place a large model earns its price.
program, meta = build_program(llm, intake, user_id, date.today(), minutes_budget=45)
save = dumps(program, {})                       # store `save` wherever you like

# Every time the app opens.
loaded = loads(save)
run = where(loaded.program, date.today())
if run.state == "finished":
    ...                                          # the run is over; stop prescribing
elif run.running:
    rows = program_day(loaded.program, run.day)  # what today asks

# When the day closes. This is what makes the day un-re-judgeable.
logs = dict(loaded.logs)
logs[run.day] = record_day(loaded.program, run.day, done_habit_ids)
save = dumps(loaded.program, logs)

# Once a day, or on open. Patches if they are slipping, offers if they are not.
ci = check_in(loaded.program, logs, run.day, llm)
save = dumps(ci.program, logs)                   # store it either way
for rec in ci.recommendations:                   # empty when ci.patched
    if user_accepted(rec):
        program, notes = apply_recommendation(ci.program, rec, run.day)
```

`loaded.notes` is not decoration — a non-empty list means the programme that
came back is not the one that was written, usually because the catalog moved.
Read it before the run continues.

---

# Invariants

**The day counter never resets.** Missing days 20-23 gets you a *softened* day
24 — still day 24 of 66. No operation may reach the counter. A reset erases the
only thing the user actually earned, and it is why most streak apps lose people
at the first stumble.

**The model chooses from a closed set; code validates; code repairs.** Never
re-prompt to fix a constraint violation — a retry loop against a model is not an
error-handling strategy. Every id an agent returns is checked against
`catalog.py` before it reaches a programme, so an invented habit is a dropped
habit rather than a runtime error on day 41.

**`validate()` walks all 66 days.** An infeasible day 41 is the most expensive
bug in this product: the user does not discover it until day 41, by which point
they have earned 40 days.

**Repair uses a different sacrifice per constraint.** A phase-cap violation
means too many *habits* — drop the newest. A budget violation means too many
*minutes* — drop the most expensive. One heuristic for both made repair swap two
zero-cost habits forever while a 20-minute habit sat untouched.

**Repair removes before it flattens.** `scale` reduces the ramp across all 66
days, so softening to fit a single day-60 overshoot leaves the user on their
starting dose for the entire run. The ramp is the product. Flattening is what is
left when there is nothing to remove, never the first reach.

**Repair never touches what the user is already running.** Every sacrifice
branch filters to `start_day > today`. `adapt_program` enforces the
70%-completion rule on *ops*, but `apply_patch` calls `repair` afterwards, where
that rule does not exist — so the protection has to live in each branch.

**Feasibility outranks the habit floor.** Rather than ship a day the user
physically cannot do, `repair` drops below `MIN_HABITS` and `build_program`
reads that as the signal to substitute the cheap fallback programme.

**Nothing computable is left to the model.** It classifies, extracts and
phrases. Every number the user sees traces to `catalog.py` through `dose_for`.

**A run ends, and something has to own that.** `day_index` counts honestly past
66 and every other function keeps answering — `render_program_day` printed
"Day 80 of 66" over a full day's prescription. `session.where(program, on)` is
the first call an app makes: `not_started`, `running` or `finished`. `check_in`
does nothing outside the run, because adapting a finished programme softens a
run the user has already completed.

**Step in, or offer more — never both on the same day.** `session.check_in` is
the only place that decision is made. It is not the same rule as `recommend`'s
`add` gate: only `add` is gated on `needs_intervention`, while `advance` is
gated on a *per-habit* rate, so a user holding one habit at 100% while the rest
collapse qualifies for both at once. `recommend` alone offers it; `check_in` is
what does not. That conjunction is unreachable from the harness's own users, so
both suites construct it deliberately — see the eased twin in `check_session`.

**A lived day is a record, not a recomputation.** `record_day(program, day,
done)` freezes what each habit asked and whether it happened; the app calls it
as the day is lived and stores the result. From then on that day is read, never
re-derived. `diagnose` reads the record too — it used to decide "was this asked"
from the habit's *current* `start_day`, so deferring a habit on day 30 quietly
re-scored the fortnight behind it. The one place `state.py` stores something
derivable, and deliberately.

**A save round-trips exactly, or it is refused.** `state.from_dict` reading what
`state.to_dict` wrote must give back an equal `Program` — the harness asserts it
on every programme it builds, plus a twin with every optional field populated.
That twin is not belt-and-braces: `adapt_program(None, ...)` only ever softens
here, so no harness programme has ever carried a `frozen_day`, and deleting that
field from `to_dict` passed 2,000 users clean while failing a unit test by name.
A check that can only see the fields the layer above it happens to set is not a
check.

**A recommendation is a proposal that has already been proved.** Nothing leaves
`recommend.py` until the programme it would produce has been walked across all
66 days with zero violations, and `apply_recommendation` re-checks rather than
trusting, because the programme may have moved since. It never calls `repair`:
`repair` is for cleaning up after an adversarial Architect, and a suggestion the
app makes to a user who is doing well should not need cleaning up. Suggestions
offered together must also be acceptable together — two habits both offered
"from day 31" is one offer the spacing rule cannot honour.

**Never offer more work to someone who is missing days.** `recommend` returns no
`add` when `needs_intervention` is true. It is the same signal `adapt_program`
acts on, and the two must never fire on the same day; an engagement metric would
ask for the opposite.

**An anchor's dose never moves.** A habit with `target_dose == start_dose` —
`vitamins`, `floss` — is a yes/no with nothing to ramp, and the clamp in
`dose_for` is what holds it there. No special case exists anywhere else, and
none should be added: to `validate` an anchor is simply a dose that is
permanently in bounds and permanently monotonic. They are deliberately the
cheapest rows on the day, so `repair` never sacrifices one — an anchor is what a
day still has on it after everything expensive has gone, which is the day a run
usually breaks. `step` stays positive because it is the rounding grid; on an
anchor it never applies.

---

# Valid is not the same as useful

The hardest bug found here produced programmes that passed every invariant —
inside budget, inside the phase caps, monotonic, feasible on all 66 days — and
were worthless, because every habit sat frozen at its starting dose for the
whole run. No automated check caught it or could have. Reading
`demo_program.py`'s output is what caught it.

It has now happened twice, in the same shape. The recommender offered an
`advance` reading **"Drink water · 4 -> 4 glasses"**: `scale` multiplies the week
count before it is rounded, so raising it from 0.5 to 0.75 landed on the same
step. The programme was valid, every invariant passed, and the button did
nothing the user could see. It ran 369 times across 2,000 synthetic users
without a single complaint from the harness, because nothing was wrong with the
*programme* — what was empty was the *suggestion*, and no invariant is written
about those. The demo printed it in plain sight on the first read.

`recommend` now requires tomorrow's ask to actually rise, and both suites assert
it. Run the demo and read it after any change to `repair`, `dose_for`, the
render or `recommend`.

---

# Known gaps

Ordered by how likely they are to bite.

1. **~~Adaptation is the least-tested layer and runs most often.~~** Closed.
   Adaptation now has seventeen adversaries of its own, cycled the way the
   Architect's are, and the summary prints which op *effects* actually landed —
   read off the programme diff, never off the ops that were submitted, because
   counting submissions reported twenty `obliterate` ops as having run.

   It found four crashes that had been sitting in `apply_patch` the whole time,
   all reachable from a plausible model response and all landing in
   `session.check_in`, which an app runs every time it opens: a string `factor`
   (ValueError), a null `factor` (TypeError), a string `days` (ValueError), and
   worst, a NaN `factor` — which passed `float()`, became the habit's `scale`,
   left `dose_for` returning the starting dose for the whole run, validated
   perfectly clean, and made every subsequent `state.dumps` throw. The user's
   run was corrupt and unsaveable with no invariant objecting.

   **Op arguments come from a model and are not to be trusted with `float()`.**
   `_number` is the guard; an unreadable argument falls back to the documented
   default with a note rather than dropping the op, because a user who is
   slipping still needs the intervention.
2. **~~`soften` and `freeze` are a one-way ratchet.~~** Closed: `resume` is the
   way back, `recommend._advance_recommendations` is what detects recovery, and
   the harness models a user who gets back on it a fortnight after a patch.
   What is *not* closed is the ratchet in the other direction: nothing steps a
   habit past its catalog `target_dose`, and nothing should — that ceiling is a
   number the catalog owns.
3. **~~No persistence.~~** Closed for the shape, open for the store.
   `state.py` is the boundary: `SCHEMA_VERSION`, `to_dict`/`from_dict`,
   `dumps`/`loads`, no I/O and nothing third-party. The rules it commits to are
   in its docstring and worth reading before changing it — nothing derived is
   stored, a newer save is refused rather than silently truncated, loading is
   faithful while `validate` judges and `repair` fixes, and catalog drift drops
   a habit with a note where corruption raises. Adding a field now means bumping
   `SCHEMA_VERSION` and writing the upgrade branch, which is the cost this was
   built to make explicit. There is still no *store* — where the bytes go is the
   caller's, deliberately.

   **`dose_for` still has no memory, and now nothing asks it to.** It is a pure
   function of the habit's *current* state, so softening on day 30 still changes
   what it says about day 10 — that was never fixed, because fixing it is not
   what the problem needed. Schema 2 records each lived day instead: what every
   habit asked and whether it happened. A past day is read, so the drift has
   nowhere to land, and `ProgramHabit` stayed a four-field row rather than
   growing a list of dated adjustments through `dose_for`, `repair`,
   `apply_patch`, `recommend` and the schema at once. The rejected design is
   worth knowing: an `Adjustment(day, scale, frozen_day, ramp_shift)` list
   replayed up to the day being asked about is strictly more correct and would
   also have fixed the resume jump properly, at the cost of rewriting the
   function whose arithmetic once survived 165,000 clean day-renders.

   What is left of it: an *unrecorded* day is still a reconstruction. Days the
   app never wrote a record for get today's numbers, and a schema-1 save carries
   `asked=None` because that value was never written down and inventing it now
   would be the re-judging the record exists to prevent.
4. **The Architect is asked to order by importance and the code discards it.**
   `_respace` re-sorts by `(start_day, habit_id)`, so sacrifice order is
   effectively alphabetical. Either carry the index through or delete the
   promise from the prompt.
5. **`repair()` is at its complexity ceiling** — one function holding four
   sacrifice policies and three protection rules, with a loop bound asserted by
   comment rather than construction.
6. **The daily graph does not exist.** `graph.py`, `engine.py`, `store.py`,
   `demo.py`. When it lands it will exercise a budget reduction on a live
   programme, which `repair` currently cannot resolve.

---

# General Rules

Always think before coding. Prefer analysis before implementation.

Never modify unrelated files, and never reach into `arise/` or
`english-feedback-app/` — the three projects here share nothing.

Never put a secret in code. Credentials resolve from the environment inside
`nodes.py` and are never passed in or held.

When a change cannot be covered by `tests.py` or `eval_harness.py`, say so out
loud rather than letting a green run imply cover it does not have.
