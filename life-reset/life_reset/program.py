"""The 66-day program: what is committed, and how it is defended.

Everything here is a pure function over a `Program`. No model, no network, no
clock — `today` is always passed in. That is what makes `eval_harness.py` able
to walk 2,000 synthetic users across all 66 days and actually mean something.

The two rules that shape the file:

* **Validate then repair, never re-prompt.** A retry loop against a model is not
  an error-handling strategy. `validate` states exactly what is wrong and
  `repair` fixes it deterministically, so an adversarial Architect and a good one
  both end at a feasible program.
* **The day counter never resets.** Missing days 20-23 gets you a *softened*
  day 24, still day 24 of 66. A reset erases the only thing the user earned.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from datetime import date
from typing import Iterable, Literal

from .catalog import (
    LAST_INTRO_DAY,
    MAX_NEW_PER_WEEK,
    MIN_HABITS,
    PROGRAM_DAYS,
    Habit,
    habit,
    is_known,
    phase_for,
)

Op = Literal["soften", "freeze", "defer", "drop", "resume"]


# ---------------------------------------------------------------------------
# The program
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProgramHabit:
    """One habit as this user will actually run it.

    `scale` is what `soften` moves: it reduces the *accumulated ramp*, never the
    habit's own starting dose, so a softened habit lands somewhere in
    [start_dose, target_dose] and never below the floor the catalog set.

    `frozen_day` pins the dose to the value it held on that day. It is stored as
    the day itself rather than as a boolean so that freezing is idempotent and
    survives being applied twice.
    """

    habit_id: str
    start_day: int
    scale: float = 1.0
    frozen_day: int | None = None


@dataclass(frozen=True)
class Program:
    user_id: str
    start_date: date
    minutes_budget: int
    habits: tuple[ProgramHabit, ...] = ()

    def ids(self) -> tuple[str, ...]:
        return tuple(p.habit_id for p in self.habits)


@dataclass(frozen=True)
class Violation:
    kind: str
    day: int | None
    detail: str

    def __str__(self) -> str:
        where = f"day {self.day}" if self.day is not None else "program"
        return f"{self.kind} @ {where}: {self.detail}"


# ---------------------------------------------------------------------------
# Dose and cost
# ---------------------------------------------------------------------------


def _round_to(value: float, step: float) -> float:
    """Round to the habit's own step so prescriptions are sayable numbers."""
    if step <= 0:
        return value
    return round(value / step) * step


def dose_for(ph: ProgramHabit, day: int) -> float:
    """The dose asked of this habit on this day, or 0 before it starts.

    Ramps one `step` per completed week. Two ordering rules, both learned the
    hard way:

    * **Round the ramp, never the total.** Rounding `start_dose + ramp` snaps the
      whole figure to a multiple of `step`, which displaces any habit whose
      starting dose is not already one. `meditate` (start 3, step 2) rendered a
      4-minute day one against a catalog that says 3, and then ramped 0, +4, 0,
      +4 instead of +2 a week. Rounding only the ramp keeps the dose on the
      habit's own grid — `start + k*step` — so day one is always exactly the
      dose the catalog declares.
    * **Round before the clamp.** Rounding after it is how a 90-minute target
      once shipped a 100-minute prescription.
    """
    if day < ph.start_day:
        return 0.0
    h = habit(ph.habit_id)

    # A frozen habit keeps asking for whatever it asked on the day it froze.
    effective = day if ph.frozen_day is None else min(day, ph.frozen_day)
    weeks = max(0, (effective - ph.start_day) // 7)

    ramp = _round_to(h.step * weeks * max(0.0, ph.scale), h.step)
    raw = h.start_dose + ramp
    return float(min(max(raw, h.start_dose), h.target_dose))


def minutes_for(ph: ProgramHabit, day: int) -> float:
    return dose_for(ph, day) * habit(ph.habit_id).minutes_per_unit


def active_on(program: Program, day: int) -> tuple[ProgramHabit, ...]:
    return tuple(p for p in program.habits if p.start_day <= day)


def day_minutes(program: Program, day: int) -> float:
    return sum(minutes_for(p, day) for p in active_on(program, day))


def day_index(start_date: date, on: date) -> int:
    """Calendar date -> 1-based day number. Outside the program, still honest."""
    return (on - start_date).days + 1


# ---------------------------------------------------------------------------
# The day record — what a day asked, frozen at the moment it was lived
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DayEntry:
    """One habit, on one day: what it asked, and whether it happened.

    `asked` is the whole point. Everything else here is derived on demand from
    the catalog, and `dose_for` is a function of the habit's *current* state —
    so softening on day 30 changes what `dose_for` says about day 12. That is
    tolerable for a prescription and intolerable for a record: it means a day
    the user lived can be re-described later, and once completion is judged
    against a value rather than a tick, re-described becomes re-judged.

    Writing the ask down at the time is what makes that impossible. A recorded
    day is read, never recomputed, which is also why `ProgramHabit` did not need
    to grow a list of dated adjustments — nothing asks `dose_for` about the past
    once the past has a record.

    `asked` is optional only for days restored from a schema-1 save, which
    recorded that a habit was done without recording what it was asked for.
    Inventing that number afterwards from the current programme would be exactly
    the re-judging this class exists to prevent, so it stays unknown.
    """

    asked: float | None = None
    done: bool = False


# `{day: {habit_id: DayEntry}}`. A habit present on a day was *asked* that day;
# `.done` says whether it happened. Presence alone used to mean "done", which
# left nowhere to put a day that asked for something and did not get it.
DayLog = dict[int, dict[str, DayEntry]]


def record_day(program: Program, day: int, done: Iterable[str] = ()) -> dict[str, DayEntry]:
    """Freeze what `day` asked of this user, and what they did about it.

    Call it as the day is lived and store the result; from then on that day is a
    fact rather than a re-derivation. Habits that had not started yet are absent
    — they were not asked, and a record that claims otherwise would make every
    early day look like a failure.
    """
    got = set(done)
    return {
        p.habit_id: DayEntry(asked=dose_for(p, day), done=p.habit_id in got)
        for p in active_on(program, day)
    }


def program_day(program: Program, day: int) -> list[dict]:
    """Everything committed on `day`, in the order the habits were chosen."""
    out = []
    for p in active_on(program, day):
        h = habit(p.habit_id)
        out.append(
            {
                "id": h.id,
                "name": h.name,
                "domain": h.domain,
                "unit": h.unit,
                "dose": dose_for(p, day),
                "minutes": minutes_for(p, day),
                "day_of_habit": day - p.start_day + 1,
                "frozen": p.frozen_day is not None and day >= p.frozen_day,
                "softened": p.scale < 1.0,
            }
        )
    return out


# ---------------------------------------------------------------------------
# Validation — walks every day, because day 41 is where it hurts
# ---------------------------------------------------------------------------


def validate(program: Program) -> list[Violation]:
    """Every way this program could be wrong, on any of its 66 days.

    An infeasible day 41 is the most expensive bug in the product: the user does
    not discover it until day 41, by which point they have earned 40 days.
    """
    v: list[Violation] = []
    seen: set[str] = set()

    for p in program.habits:
        if not is_known(p.habit_id):
            v.append(Violation("unknown_habit", None, f"{p.habit_id!r} is not in the catalog"))
            continue
        if p.habit_id in seen:
            v.append(Violation("duplicate_habit", None, f"{p.habit_id} appears twice"))
        seen.add(p.habit_id)
        if not 1 <= p.start_day <= LAST_INTRO_DAY:
            v.append(
                Violation("start_day_range", None, f"{p.habit_id} starts on day {p.start_day}")
            )

    if len(program.habits) < MIN_HABITS:
        v.append(
            Violation("min_habits", None, f"{len(program.habits)} habits, floor is {MIN_HABITS}")
        )

    # Only the structurally sound habits can be walked day by day.
    if any(x.kind in {"unknown_habit"} for x in v):
        return v

    starts = sorted(p.start_day for p in program.habits)
    for i, day in enumerate(starts):
        window = [d for d in starts if day - 6 <= d <= day]
        if len(window) > MAX_NEW_PER_WEEK:
            v.append(
                Violation(
                    "new_per_week",
                    day,
                    f"{len(window)} habits start within 7 days of day {day}",
                )
            )
            break

    for day in range(1, PROGRAM_DAYS + 1):
        live = active_on(program, day)
        cap = phase_for(day).max_habits
        if len(live) > cap:
            v.append(
                Violation("phase_cap", day, f"{len(live)} habits live, {phase_for(day).name} allows {cap}")
            )
        minutes = sum(minutes_for(p, day) for p in live)
        if minutes > program.minutes_budget + 1e-9:
            v.append(
                Violation(
                    "daily_budget",
                    day,
                    f"{minutes:.0f} min against a {program.minutes_budget} min budget",
                )
            )
        for p in live:
            h = habit(p.habit_id)
            d = dose_for(p, day)
            if d < h.start_dose - 1e-9 or d > h.target_dose + 1e-9:
                v.append(
                    Violation(
                        "dose_in_bounds",
                        day,
                        f"{p.habit_id} at {d:g} outside [{h.start_dose:g}, {h.target_dose:g}]",
                    )
                )
            if day > p.start_day and dose_for(p, day - 1) - d > 1e-9:
                v.append(
                    Violation("dose_monotonic", day, f"{p.habit_id} went backwards")
                )
    return v


# ---------------------------------------------------------------------------
# Repair — a different sacrifice for a different constraint
# ---------------------------------------------------------------------------


def _respace(
    habits: Iterable[ProgramHabit], protect_before: int = 0
) -> tuple[tuple[ProgramHabit, ...], list[str]]:
    """An even ladder of start days. One pass, no search.

    Habits that have already begun are never moved: rescheduling a habit the
    user is three weeks into is how a repair pass once broke a 100%-completion
    streak while "fixing" something else entirely.

    @returns (placed, unplaceable_ids). A habit that cannot be fitted before
    `LAST_INTRO_DAY` without breaking the spacing rule is reported rather than
    stacked onto the last legal day — piling six starts onto day 56 satisfies
    the loop and ships the exact violation it was meant to remove.
    """
    ordered = sorted(habits, key=lambda p: (p.start_day, p.habit_id))
    fixed = [p for p in ordered if p.start_day <= protect_before]
    movable = [p for p in ordered if p.start_day > protect_before]

    taken: list[int] = [p.start_day for p in fixed]
    out: list[ProgramHabit] = list(fixed)
    unplaceable: list[str] = []

    def fits(day: int) -> bool:
        """Would adding `day` keep every rolling window legal?

        Deliberately the same test `validate` runs, over every window rather
        than only the one ending at `day`. Counting backwards alone is not
        enough: slotting a habit into day 1 when days 2 and 7 are already taken
        looks free from day 1 and quietly makes day 7 the third start in a week.
        """
        days = sorted(taken + [day])
        return all(
            sum(1 for y in days if x - 6 <= y <= x) <= MAX_NEW_PER_WEEK for x in days
        )

    def first_free(lo: int) -> int | None:
        for day in range(max(lo, 1), LAST_INTRO_DAY + 1):
            if fits(day):
                return day
        return None

    for p in movable:
        # Prefer the day the Architect asked for, then the first legal day after
        # it. Only if nothing is free later do we look *earlier* — an Architect
        # that puts all seven habits on day 900 clamps them all onto day 56,
        # where searching forward finds nothing and dropping five of them takes
        # the programme under its own floor. Moving one earlier is a far smaller
        # sacrifice than removing it.
        day = first_free(max(p.start_day, protect_before + 1))
        if day is None:
            day = first_free(protect_before + 1)
        if day is None:
            unplaceable.append(p.habit_id)
            continue
        taken.append(day)
        out.append(replace(p, start_day=day))
    return tuple(sorted(out, key=lambda p: (p.start_day, p.habit_id))), unplaceable


def _cost_on(p: ProgramHabit, day: int) -> float:
    return minutes_for(p, day)


def repair(program: Program, today: int = 0) -> tuple[Program, list[str]]:
    """Make the program feasible, deterministically, without asking a model.

    `today` protects everything already underway — pass the user's current day
    when repairing a live program, and 0 when building a fresh one.

    The sacrifice differs per constraint, and that distinction is the whole
    point of this function. A phase-cap violation means too many *habits*, so
    the newest goes. A budget violation means too many *minutes*, so the most
    expensive goes. Using one heuristic for both made repair swap two zero-cost
    habits back and forth forever while a 20-minute habit sat untouched.
    """
    notes: list[str] = []
    habits = list(program.habits)

    # 1. Structure: unknown ids, duplicates, impossible start days.
    kept: list[ProgramHabit] = []
    seen: set[str] = set()
    for p in habits:
        if not is_known(p.habit_id):
            notes.append(f"dropped unknown habit {p.habit_id!r}")
            continue
        if p.habit_id in seen:
            notes.append(f"dropped duplicate {p.habit_id}")
            continue
        seen.add(p.habit_id)
        day = min(max(int(p.start_day), 1), LAST_INTRO_DAY)
        if day != p.start_day:
            notes.append(f"{p.habit_id}: start day {p.start_day} -> {day}")
            p = replace(p, start_day=day)
        kept.append(p)
    habits = kept

    # 2. Spacing: no more than MAX_NEW_PER_WEEK starts in any rolling week.
    before = {p.habit_id: p.start_day for p in habits}
    placed, unplaceable = _respace(habits, protect_before=today)
    habits = list(placed)
    moved = [p.habit_id for p in habits if before.get(p.habit_id) != p.start_day]
    if moved:
        notes.append(f"respaced start days: {', '.join(sorted(moved))}")
    for hid in unplaceable:
        notes.append(f"dropped {hid}: no legal start day left before day {LAST_INTRO_DAY}")

    prog = replace(program, habits=tuple(habits))

    # 3. Day-by-day violations. Bounded: every pass either softens one habit by a
    #    quarter of its ramp or removes one, and the floor stops it before a
    #    programme stops being a programme.
    for _ in range(len(habits) * 8 + 8):
        vs = [v for v in validate(prog) if v.kind in {"phase_cap", "daily_budget"}]
        if not vs:
            break
        v = vs[0]
        day = v.day or 1
        live = list(active_on(prog, day))
        if not live:
            break

        if v.kind == "phase_cap":
            # Too many *habits*: the newest one goes, tie-broken by friction.
            movable = [p for p in live if p.start_day > today]
            if not movable or len(prog.habits) <= MIN_HABITS:
                break
            victim = max(movable, key=lambda p: (p.start_day, habit(p.habit_id).friction))
            notes.append(f"dropped {victim.habit_id} for phase cap on day {day}")
            prog = replace(prog, habits=tuple(p for p in prog.habits if p is not victim))
            continue

        # Too many *minutes*: the most expensive one goes, tie-broken by newest.
        #
        # Removing before flattening, and the order matters more than it looks.
        # `scale` reduces the ramp across the whole run, so softening to fit one
        # overshoot on day 60 leaves the user on their starting dose for all 66
        # days — five habits that never move, instead of four that do. The ramp
        # is the product. Flattening is what is left when there is nothing to
        # remove, not the first thing to reach for.
        movable = [p for p in live if p.start_day > today]
        if len(prog.habits) > MIN_HABITS and movable:
            victim = max(movable, key=lambda p: (_cost_on(p, day), p.start_day))
            notes.append(f"dropped {victim.habit_id} for daily budget on day {day}")
            prog = replace(prog, habits=tuple(p for p in prog.habits if p is not victim))
            continue

        # At the floor: keep every habit and flatten the most expensive ramp.
        #
        # `movable`, not `live` — every other branch protects what the user is
        # already running, and this one silently did not. Flattening a habit
        # mid-streak is the `working_habit_untouched` failure the spec records
        # as fixed, coming back through a different door: `adapt_program`
        # enforces the 70%-completion rule on *ops*, but `apply_patch` calls
        # repair afterwards, where that rule does not exist.
        candidates = movable or []
        if not candidates:
            break
        victim = max(candidates, key=lambda p: (_cost_on(p, day), p.start_day))
        if victim.scale > 1e-9:
            scaled = replace(victim, scale=max(0.0, victim.scale - 0.25))
            notes.append(
                f"flattened {victim.habit_id}'s ramp to {scaled.scale:.2f} "
                f"for the budget on day {day} (at the {MIN_HABITS}-habit floor)"
            )
            prog = replace(prog, habits=tuple(scaled if p is victim else p for p in prog.habits))
            continue

        # Flat at its starting dose and still over: three heavy habits against a
        # 30-minute budget cannot all be kept. Feasibility outranks the habit
        # floor — an impossible day is the one bug the user cannot work around,
        # and `build_program` reads a sub-floor result as "use the fallback".
        if not movable:
            break
        victim = max(movable, key=lambda p: (_cost_on(p, day), p.start_day))
        notes.append(
            f"dropped {victim.habit_id} below the {MIN_HABITS}-habit floor: "
            f"day {day} is not doable in {program.minutes_budget} min otherwise"
        )
        prog = replace(prog, habits=tuple(p for p in prog.habits if p is not victim))

    return prog, notes


# ---------------------------------------------------------------------------
# Patching a live program
# ---------------------------------------------------------------------------

MAX_PATCH_HABITS = 2
RESUME_SCALE_STEP = 0.25     # one notch of ramp handed back per resume


def _number(value: object) -> float | None:
    """A finite number, or None if the model did not give one.

    Op arguments arrive from a language model and are not to be trusted with
    `float()`. Every one of these was a live crash reachable from a plausible
    response: `{"factor": "half"}` raised ValueError, `{"factor": null}` raised
    TypeError, and both propagated out of `apply_patch`, out of `adapt_program`
    — whose try/except only ever covered the *call* to the model — and into
    whatever the app was doing, which is now its daily check-in.

    `NaN` was worse for being quiet. It passes `float()`, and `min`/`max` return
    it unchanged, so it became the habit's `scale`; `max(0.0, nan)` inside
    `dose_for` then returned 0.0, leaving the ramp dead for the whole run on a
    programme `validate` called perfectly healthy. The user's next save then
    threw, because `state.dumps` refuses to write NaN, and the run was
    unpersistable from that point on.
    """
    try:
        n = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def apply_patch(program: Program, ops: list[dict], today: int) -> tuple[Program, list[str]]:
    """The only sanctioned way to change a program that is already running.

    Five operations and no rewrite. `today` is the user's current day, and
    everything already underway is protected from rescheduling.

    Four of the five are sacrifices, and for a long time all of them were: the
    programme could only ever get smaller. `resume` is the way back, and it is
    deliberately the *only* op that gives something back, so that "the user has
    recovered" has somewhere to land.

    The patch is capped at `MAX_PATCH_HABITS` *ops*, counted here — not counted
    after repair, which is how a 2-habit patch once reported itself as 41.
    """
    notes: list[str] = []
    touched: set[str] = set()
    habits = {p.habit_id: p for p in program.habits}

    for op in ops:
        name = op.get("op")
        hid = op.get("habit_id")
        if hid not in habits:
            notes.append(f"ignored {name} on unknown/absent {hid!r}")
            continue
        if hid not in touched and len(touched) >= MAX_PATCH_HABITS:
            notes.append(f"ignored {name} on {hid}: patch already touches {MAX_PATCH_HABITS} habits")
            continue

        p = habits[hid]
        if name == "soften":
            # "soften walk" is a clear instruction even when "by how much" is
            # garbled, so an unreadable factor falls back to the documented
            # default rather than dropping the op — the same call
            # `coerce_program` makes for an unreadable `start_day`. Dropping it
            # would leave a user who is slipping with no intervention at all.
            factor = _number(op.get("factor", 0.5))
            if factor is None:
                notes.append(f"{hid}: unreadable soften factor {op.get('factor')!r}, used 0.5")
                factor = 0.5
            factor = min(max(factor, 0.0), 1.0)
            habits[hid] = replace(p, scale=p.scale * factor)
            notes.append(f"softened {hid} to {habits[hid].scale:.2f} of its ramp")
        elif name == "freeze":
            if p.frozen_day is None or today < p.frozen_day:
                habits[hid] = replace(p, frozen_day=today)
            notes.append(f"froze {hid} at day {habits[hid].frozen_day}")
        elif name == "defer":
            if p.start_day <= today:
                notes.append(f"ignored defer on {hid}: already underway")
                continue
            by = _number(op.get("days", 7))
            if by is None:
                notes.append(f"{hid}: unreadable defer days {op.get('days')!r}, used 7")
                by = 7
            habits[hid] = replace(p, start_day=min(p.start_day + max(int(by), 1), LAST_INTRO_DAY))
            notes.append(f"deferred {hid} to day {habits[hid].start_day}")
        elif name == "resume":
            # The inverse of `freeze` and `soften`, and the answer to the fact
            # that those two were a one-way ratchet: a user who stumbled in week
            # three spent the remaining forty days on a flattened programme,
            # because nothing in the system could notice they had recovered.
            #
            # One notch per call, never a snap back to full. Clearing
            # `frozen_day` outright takes a habit frozen at 20 minutes on day 20
            # and resumed on day 40 straight to 35 — three weeks of ramp
            # arriving in one night, which is how you break the run you were
            # trying to reward.
            #
            # The freeze is unwound before the scale because a week of ramp is
            # the smaller, more predictable gift: `scale` multiplies the week
            # count before rounding, so a quarter of it is worth one step early
            # in a run and three steps late in one. `recommend` refuses any
            # resume that would move tomorrow by more than a single step.
            #
            # **This rewrites the recent past, and cannot not.** Pushing the pin
            # from day 20 to day 27 changes what days 21-27 ask for, because the
            # pin is one number and the curve it describes has no elbow — no
            # value of `frozen_day` says "held at 20 until today, ramping after".
            # `soften` has had exactly this property since it was written, and
            # the fix for both is the same fix: a stored record of what each day
            # actually asked, which is gap 3, not this op. What *is* guaranteed
            # is that resume only ever raises a day's ask, never lowers one.
            if p.frozen_day is not None:
                nxt = p.frozen_day + 7
                habits[hid] = replace(p, frozen_day=None if nxt > PROGRAM_DAYS else nxt)
                notes.append(f"resumed {hid}'s ramp for another week")
            elif p.scale < 1.0:
                habits[hid] = replace(p, scale=min(1.0, p.scale + RESUME_SCALE_STEP))
                notes.append(f"gave {hid} back some ramp: scale {habits[hid].scale:.2f}")
            else:
                notes.append(f"ignored resume on {hid}: already at full pace")
                continue
        elif name == "drop":
            if len(habits) <= MIN_HABITS:
                notes.append(f"ignored drop on {hid}: at the {MIN_HABITS}-habit floor")
                continue
            del habits[hid]
            notes.append(f"dropped {hid}")
        else:
            notes.append(f"ignored unknown op {name!r}")
            continue
        touched.add(hid)

    patched = replace(program, habits=tuple(habits.values()))
    patched, repairs = repair(patched, today=today)
    return patched, notes + repairs


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


# Units whose singular is not simply the plural minus its "s". Everything else
# follows the general rule, so a new catalog unit — doses, times — reads
# correctly without an edit here.
_IRREGULAR_UNITS = {"glasses": "glass"}


def _singular(unit: str) -> str:
    """`1 doses` is the kind of thing that makes a product look unfinished."""
    if unit in _IRREGULAR_UNITS:
        return _IRREGULAR_UNITS[unit]
    return unit[:-1] if unit.endswith("s") else unit


def _fmt(dose: float, unit: str) -> str:
    """Value and unit in separate fixed fields.

    Formatting them as one string and right-aligning the result put the digits
    wherever the unit's length happened to leave them, so the one column the
    reader scans did not line up. Long durations are said the way people say
    them: `2m 00s`, not `120 sec`.
    """
    if unit == "sec" and dose >= 90:
        minutes, seconds = divmod(int(round(dose)), 60)
        return f"{minutes}m {seconds:02d}s".rjust(6) + "  "
    n = int(dose) if abs(dose - int(dose)) < 1e-9 else round(dose, 1)
    return f"{n:>6g} {_singular(unit) if n == 1 else unit}"


def render_program_day(program: Program, day: int) -> str:
    """The day view. Deterministic, and the source of truth for any prose.

    Three rules this render is built on, each of them a mistake it used to make:

    * **Never print a figure the user cannot reconcile with the rows above it.**
      `minutes_per_unit` is a scheduling weight, not a duration — a day showing
      `45 min`, `60 min` and `45 min` totalled `60 min`, because lights-out
      costs the budget 0.2 per unit. The weighted load is real and gates the
      programme, but it belongs to `validate`; what the user is shown is time
      they can add up themselves.
    * **The budget is a ceiling, not a target.** `validate` only ever asks
      `minutes > budget`. Rendering `4 min of 45` turned a deliberately light
      day one into a 91% shortfall, against a prompt that asks for exactly that
      lightness. It appears only when the day approaches it.
    * **Say when something is new.** A habit's first day is the riskiest moment
      in the programme — it is why no more than two may start in a week — and it
      used to render identically to its fortieth, sorted to the bottom.
    """
    # A run ends. This used to print "Day 80 of 66" over a full day's
    # prescription, because every function here answers for any integer and
    # none of them owned the fact that the programme was over.
    if day > PROGRAM_DAYS:
        return (f"Day {PROGRAM_DAYS} of {PROGRAM_DAYS} was the last one.\n\n"
                f"That run finished {day - PROGRAM_DAYS} day(s) ago. "
                "Nothing here is asked of you any more.")

    rows = program_day(program, day)
    ph = phase_for(day) if 1 <= day <= PROGRAM_DAYS else None
    head = f"Day {day} of {PROGRAM_DAYS}"
    if ph:
        head += f" · {ph.name}"

    if not rows:
        upcoming = [p.start_day for p in program.habits if p.start_day > day]
        if upcoming:
            first = min(upcoming)
            name = habit(next(p.habit_id for p in program.habits if p.start_day == first)).name
            return (f"{head}\n\nNothing to do yet — that is on purpose.\n"
                    f"Your first habit, {name}, starts on day {first}.")
        return f"{head}\n\nNothing has started yet."

    # New habits first: today's actual news, above the routine.
    rows.sort(key=lambda r: (r["day_of_habit"] != 1, r["name"]))

    lines = [head, ""]
    for r in rows:
        marks = []
        if r["day_of_habit"] == 1:
            marks.append("new today")
        if r["frozen"]:
            marks.append("steady this week")
        if r["softened"]:
            marks.append("eased back")
        suffix = f"  ({', '.join(marks)})" if marks else ""
        lines.append(f"  {r['name']:<24}{_fmt(r['dose'], r['unit'])}{suffix}")

    # Only the rows that literally say "N min" are summed, so the figure is
    # one the user can check against the column.
    focused = sum(r["dose"] for r in rows if r["unit"] == "min")
    load = sum(r["minutes"] for r in rows)
    if focused:
        line = f"  {'focused time':<24}{_fmt(focused, 'min')}"
        if load >= program.minutes_budget * 0.85:
            line += f"  ·  near your {program.minutes_budget} min ceiling"
        lines += ["", line]
    return "\n".join(lines)
