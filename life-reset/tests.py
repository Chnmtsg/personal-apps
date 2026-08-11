"""Unit tests — the layer `eval_harness.py` structurally cannot cover.

    python tests.py

The harness checks whole-programme *properties* across 2,000 synthetic users,
and it is good at that. What it cannot do is notice a wrong number, because it
verifies `dose_for` by calling `dose_for`: every check it runs is built from the
same primitives as the code under test, so an arithmetic error is simply
consistent with itself. That is exactly how `meditate` shipped a 4-minute day
one against a catalog that says 3, and ramped 0, +4, 0, +4 against a declared
step of 2, through ~165,000 day-renders reporting zero violations.

So the dose tests below are an **independent oracle**: expected values are
computed from the `Habit` fields directly, never by calling the function being
tested. A test that shares its subject's arithmetic is a tautology with extra
steps — and this file contains a second cautionary tale of that, see
`test_intervention_triggers`.
"""

from __future__ import annotations

import sys
from datetime import date

from life_reset.agents import (
    INTERVENTION_MISSES,
    INTERVENTION_RATE,
    PROTECTED_RATE,
    TRAILING_DAYS,
    adapt_program,
    diagnose,
)
from life_reset.catalog import HABITS, PROGRAM_DAYS, habit
from life_reset.program import (
    Program,
    ProgramHabit,
    apply_patch,
    dose_for,
    render_program_day,
    repair,
    validate,
)

START = date(2026, 1, 1)
_passed = 0
_failed: list[str] = []


def ok(name: str, cond: bool, extra: object = "") -> None:
    global _passed
    if cond:
        _passed += 1
        print(f"  ok   {name}")
    else:
        _failed.append(name)
        print(f"  FAIL {name}" + (f"  -> {extra}" if extra != "" else ""))


def section(title: str) -> None:
    print(f"\n{title}")


# ---------------------------------------------------------------------------
# The dose oracle
# ---------------------------------------------------------------------------


def expected_dose(h, weeks: int, scale: float = 1.0) -> float:
    """What the catalog says, worked out here rather than asked of the code."""
    steps = round(weeks * scale)              # whole steps only
    return min(h.start_dose + steps * h.step, h.target_dose)


def test_doses() -> None:
    section("every habit follows its own catalog entry")

    off_day_one = [h.id for h in HABITS if dose_for(ProgramHabit(h.id, 1), 1) != h.start_dose]
    ok("day one asks exactly the catalog's start_dose, for all 20 habits",
       not off_day_one, off_day_one)

    wrong_step = []
    for h in HABITS:
        ph = ProgramHabit(h.id, 1)
        for w in range(0, 10):
            got = dose_for(ph, 1 + 7 * w)
            want = expected_dose(h, w)
            if abs(got - want) > 1e-9:
                wrong_step.append(f"{h.id} week {w + 1}: {got:g} != {want:g}")
                break
    ok("the ramp advances one step per week until it reaches target",
       not wrong_step, wrong_step[:3])

    out_of_bounds = []
    for h in HABITS:
        for scale in (0.0, 0.25, 0.5, 0.75, 1.0):
            ph = ProgramHabit(h.id, 1, scale=scale)
            for day in range(1, PROGRAM_DAYS + 1):
                d = dose_for(ph, day)
                if d < h.start_dose - 1e-9 or d > h.target_dose + 1e-9:
                    out_of_bounds.append(f"{h.id} scale={scale} day {day}: {d:g}")
                    break
    ok("no scale puts a dose outside [start_dose, target_dose]",
       not out_of_bounds, out_of_bounds[:3])

    on_grid = []
    for h in HABITS:
        for scale in (0.25, 0.5, 0.75):
            d = dose_for(ProgramHabit(h.id, 1, scale=scale), 1 + 7 * 5)
            steps = (d - h.start_dose) / h.step
            if abs(steps - round(steps)) > 1e-9:
                on_grid.append(f"{h.id} scale={scale}: {d:g}")
    ok("a softened dose still lands on the habit's own step grid",
       not on_grid, on_grid[:3])

    ph = ProgramHabit("walk", 1, frozen_day=15)
    ok("a frozen habit holds the dose it had on the day it froze",
       dose_for(ph, 60) == dose_for(ph, 15), (dose_for(ph, 60), dose_for(ph, 15)))
    ok("and freezing never raises the dose afterwards",
       all(dose_for(ph, d) <= dose_for(ph, 15) + 1e-9 for d in range(15, PROGRAM_DAYS + 1)))


# ---------------------------------------------------------------------------
# Intervention triggers — the tautology that used to live in the harness
# ---------------------------------------------------------------------------


def _logs(prog: Program, today: int, kept: set[int]) -> dict[int, set[str]]:
    live = {d: {p.habit_id for p in prog.habits if p.start_day <= d} for d in range(1, today)}
    return {d: (live[d] if d in kept else set()) for d in live}


def test_intervention_triggers() -> None:
    section("intervention fires on each trigger, independently")
    # The harness asserted `rate_below AND NOT needs_intervention`, where
    # needs_intervention is `rate_below OR streak_trip`. That is `A and not
    # (A or B)` — False for every input. It ran 2,000 times and tested nothing.
    prog = Program("u", START, 60, (ProgramHabit("walk", 1), ProgramHabit("read", 1),
                                    ProgramHabit("water", 1)))
    today = 30

    perfect = diagnose(prog, _logs(prog, today, set(range(1, today))), today)
    ok("a user who kept every day needs no intervention",
       perfect["needs_intervention"] is False and perfect["overall_rate"] == 1.0,
       perfect["overall_rate"])

    # Rate trigger alone: misses spread out, so no 3-in-a-row streak.
    spread = {d for d in range(1, today) if d % 2 == 0}
    low = diagnose(prog, _logs(prog, today, spread), today)
    ok("a low completion rate alone triggers it",
       low["overall_rate"] < INTERVENTION_RATE and low["needs_intervention"],
       f"rate={low['overall_rate']:.2f}")
    ok("and does so without any habit hitting the miss streak",
       max(v["missed_streak"] for v in low["per_habit"].values()) < INTERVENTION_MISSES)

    # Streak trigger alone: a high rate, but the last few days missed.
    recent = {d for d in range(1, today - INTERVENTION_MISSES)}
    streak = diagnose(prog, _logs(prog, today, recent), today)
    ok("a miss streak alone triggers it, even at a healthy rate",
       streak["overall_rate"] >= INTERVENTION_RATE and streak["needs_intervention"],
       f"rate={streak['overall_rate']:.2f}")
    ok(f"and the streak is at least INTERVENTION_MISSES ({INTERVENTION_MISSES})",
       max(v["missed_streak"] for v in streak["per_habit"].values()) >= INTERVENTION_MISSES)

    ok(f"the trailing window really is {TRAILING_DAYS} days",
       len(range(max(1, today - TRAILING_DAYS), today)) == TRAILING_DAYS)


# ---------------------------------------------------------------------------
# Repair protects what the user is already running
# ---------------------------------------------------------------------------


def test_repair_protects_underway() -> None:
    section("repair never touches a habit the user is already running")
    # Three heavy habits, all underway, against a budget they cannot meet:
    # the branch that used to flatten whatever was most expensive, protected
    # or not.
    prog = Program("u", START, 30, (
        ProgramHabit("strength", 1), ProgramHabit("run", 8), ProgramHabit("deep_work", 15),
    ))
    today = 40
    before = {p.habit_id: p for p in prog.habits}
    after, notes = repair(prog, today=today)
    changed = [p.habit_id for p in after.habits
               if before[p.habit_id] != p] + [h for h in before if h not in
                                              {p.habit_id for p in after.habits}]
    ok("no habit that started before today is changed or dropped",
       not changed, f"changed={changed} notes={notes}")

    section("a patch leaves a well-performing habit alone")
    prog2 = Program("u", START, 60, (ProgramHabit("walk", 1), ProgramHabit("read", 1),
                                     ProgramHabit("meditate", 1), ProgramHabit("water", 1)))
    today2 = 30
    logs = _logs(prog2, today2, set(range(1, today2)))       # 100% on everything
    diag = diagnose(prog2, logs, today2)
    patched, meta = adapt_program(None, prog2, diag, today2)
    touched = [p.habit_id for p in patched.habits
               if {q.habit_id: q for q in prog2.habits}[p.habit_id] != p]
    ok(f"nothing above {PROTECTED_RATE:.0%} completion is touched", not touched, touched)


# ---------------------------------------------------------------------------
# The render — the surface with no harness coverage at all
# ---------------------------------------------------------------------------


def test_render() -> None:
    section("the day view renders sanely across the whole programme")
    prog, _ = repair(Program("u", START, 60, (
        ProgramHabit("walk", 1), ProgramHabit("plank", 8), ProgramHabit("water", 15),
        ProgramHabit("read", 22), ProgramHabit("meditate", 30),
    )))

    bad = []
    for day in range(1, PROGRAM_DAYS + 1):
        out = render_program_day(prog, day)
        low = out.lower()
        if "nan" in low or "none" in low or "inf" in low:
            bad.append(f"day {day}: placeholder in output")
        if f"Day {day} of {PROGRAM_DAYS}" not in out:
            bad.append(f"day {day}: header wrong")
        if max((len(x) for x in out.splitlines()), default=0) > 78:
            bad.append(f"day {day}: line over 78 chars")
    ok("no day renders a placeholder, a wrong header, or an over-long line",
       not bad, bad[:3])

    # `repair` respaces, so the first start is not necessarily day 1.
    opening = min(p.start_day for p in prog.habits)
    first = render_program_day(prog, opening)
    ok("a habit's first day is marked as new", "new today" in first, first.splitlines()[2:4])
    ok("the budget is not shown as a target on a deliberately light day",
       "of 60" not in first, first)

    # The footer must be addable from the column above it.
    rows = [ln for ln in render_program_day(prog, 60).splitlines() if ln.startswith("  ")]
    focus = [ln for ln in rows if "focused time" in ln]
    ok("the footer sums only rows that are literally in minutes", len(focus) == 1, rows)

    frozen = Program("u", START, 60, (ProgramHabit("walk", 1, scale=0.5, frozen_day=20),
                                      ProgramHabit("read", 1), ProgramHabit("water", 1)))
    out = render_program_day(frozen, 30)
    ok("a habit that is both eased back and held reads coherently",
       "eased back" in out and "steady this week" in out,
       [ln for ln in out.splitlines() if "Walk" in ln])

    empty = Program("u", START, 60, (ProgramHabit("walk", 20), ProgramHabit("read", 27),
                                     ProgramHabit("water", 34)))
    out = render_program_day(empty, 1)
    ok("a day before anything starts says when the first habit arrives",
       "day 20" in out and "on purpose" in out, out)


def main() -> int:
    test_doses()
    test_intervention_triggers()
    test_repair_protects_underway()
    test_render()
    print(f"\n{_passed} passed, {len(_failed)} failed\n")
    return 1 if _failed else 0


if __name__ == "__main__":
    sys.exit(main())
