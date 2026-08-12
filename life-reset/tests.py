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

import json
import sys
from datetime import date

from life_reset import state

from life_reset.agents import (
    INTERVENTION_MISSES,
    INTERVENTION_RATE,
    PROTECTED_RATE,
    TRAILING_DAYS,
    adapt_program,
    diagnose,
)
from life_reset.catalog import (
    HABITS,
    LAST_INTRO_DAY,
    MAX_NEW_PER_WEEK,
    MIN_HABITS,
    PROGRAM_DAYS,
    habit,
)
from life_reset.program import (
    MAX_PATCH_HABITS,
    DayLog,
    Program,
    ProgramHabit,
    apply_patch,
    dose_for,
    record_day,
    render_program_day,
    repair,
    validate,
)
from life_reset.recommend import (
    ADVANCE_READY_RATE,
    apply_recommendation,
    recommend,
)
from life_reset.session import check_in, where

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
    ok(f"day one asks exactly the catalog's start_dose, for all {len(HABITS)} habits",
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
# Anchors — the habits with nothing to ramp
# ---------------------------------------------------------------------------


def test_anchors() -> None:
    section("an anchor asks for the same thing on every one of its days")
    anchors = [h for h in HABITS if h.target_dose == h.start_dose]
    ok("the catalog has anchors at all", bool(anchors), [h.id for h in HABITS])

    # The oracle here is the catalog field, not dose_for: an anchor's dose is
    # its start_dose, on every day, at every scale, frozen or not.
    drifted = []
    for h in anchors:
        for scale in (0.0, 0.5, 1.0):
            for frozen in (None, 20):
                ph = ProgramHabit(h.id, 1, scale=scale, frozen_day=frozen)
                for day in range(1, PROGRAM_DAYS + 1):
                    if abs(dose_for(ph, day) - h.start_dose) > 1e-9:
                        drifted.append(f"{h.id} scale={scale} frozen={frozen} "
                                       f"day {day}: {dose_for(ph, day):g}")
                        break
    ok("no day, scale or freeze moves an anchor off its single dose",
       not drifted, drifted[:3])

    # Softening an anchor is a no-op, and that is the point: `repair` reaching
    # for one to save the budget would burn a pass and change nothing. The loop
    # is bounded, so it terminates either way — but it would spend its passes
    # on the one habit that cannot give anything back.
    ok("an anchor is the cheapest thing on the day, so repair never picks it",
       all(h.start_dose * h.minutes_per_unit <= 2.0 for h in anchors),
       [(h.id, h.start_dose * h.minutes_per_unit) for h in anchors])

    section("a unit reads correctly at one and at many")
    solo = Program("u", START, 60, (ProgramHabit("vitamins", 1), ProgramHabit("floss", 1),
                                    ProgramHabit("water", 1)))
    out = render_program_day(solo, 1)
    ok("a single dose is not rendered as a plural",
       "1 doses" not in out and "1 times" not in out and "1 glasses" not in out, out)
    ok("and the singular is the right word", "1 dose" in out and "1 time" in out, out)

    many = render_program_day(Program("u", START, 60, (
        ProgramHabit("brush_teeth", 1), ProgramHabit("water", 1), ProgramHabit("walk", 1),
    )), 15)
    ok("a plural stays plural once the ramp has moved", "2 times" in many, many)


# ---------------------------------------------------------------------------
# Intervention triggers — the tautology that used to live in the harness
# ---------------------------------------------------------------------------


def _logs(prog: Program, today: int, kept: set[int]) -> DayLog:
    """Days 1..today-1, recorded as they would have been lived."""
    return {
        d: record_day(prog, d, [p.habit_id for p in prog.habits] if d in kept else [])
        for d in range(1, today)
    }


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


# ---------------------------------------------------------------------------
# Resume — the way back up, and the half of the ratchet that was missing
# ---------------------------------------------------------------------------


def test_resume() -> None:
    section("resume gives ramp back, one step at a time and only upwards")
    prog = Program("u", START, 60, (ProgramHabit("walk", 1), ProgramHabit("read", 8),
                                    ProgramHabit("water", 15)))
    frozen, _ = apply_patch(prog, [{"op": "freeze", "habit_id": "walk"}], today=20)
    before = [dose_for(next(p for p in frozen.habits if p.habit_id == "walk"), d)
              for d in range(1, PROGRAM_DAYS + 1)]

    resumed, notes = apply_patch(frozen, [{"op": "resume", "habit_id": "walk"}], today=30)
    after = [dose_for(next(p for p in resumed.habits if p.habit_id == "walk"), d)
             for d in range(1, PROGRAM_DAYS + 1)]

    # Resume is the only op that gives something back, so the direction is the
    # guarantee: it may raise a day's ask and may never lower one. It does move
    # days behind the user — the freeze pin is a single number describing a
    # curve with no elbow, so pushing it forward necessarily rewrites the span
    # it used to pin. `soften` has always done the same. Fixing it means storing
    # what each day actually asked, which is the persistence gap, not this op.
    lowered = [(d + 1, before[d], after[d]) for d in range(PROGRAM_DAYS) if after[d] < before[d]]
    ok("no day is ever asked for less than it was before the resume", not lowered, lowered[:3])
    ok("and something did actually move", before != after, notes)

    # Oracle: the catalog's own step, not whatever dose_for happens to return.
    step = habit("walk").step
    jumps = [d for d in range(1, PROGRAM_DAYS) if after[d] - after[d - 1] > step + 1e-9]
    ok("the ask never rises by more than one catalog step in a day", not jumps, jumps[:3])

    # The ratchet was one-way: soften and freeze could only ever subtract.
    walked = Program("u", START, 60, (ProgramHabit("walk", 1, scale=0.25),
                                      ProgramHabit("read", 8), ProgramHabit("water", 15)))
    for _ in range(4):
        walked, _ = apply_patch(walked, [{"op": "resume", "habit_id": "walk"}], today=30)
    ok("enough resumes bring a softened habit back to full pace",
       next(p for p in walked.habits if p.habit_id == "walk").scale == 1.0,
       next(p for p in walked.habits if p.habit_id == "walk").scale)

    full, notes = apply_patch(walked, [{"op": "resume", "habit_id": "walk"}], today=30)
    ok("and resuming one already at full pace is a no-op that says so",
       full.habits == walked.habits and any("already at full pace" in n for n in notes), notes)


# ---------------------------------------------------------------------------
# The recommender
# ---------------------------------------------------------------------------


def _kept_all(prog: Program, today: int) -> DayLog:
    return _logs(prog, today, set(range(1, today)))


def test_recommend() -> None:
    section("the recommender never hands more work to someone who is drowning")
    prog, _ = repair(Program("u", START, 60, (ProgramHabit("walk", 1), ProgramHabit("water", 8),
                                              ProgramHabit("read", 15))))
    today = 30

    struggling = _logs(prog, today, {d for d in range(1, today) if d % 3 == 0})
    recs = recommend(prog, struggling, today)
    ok("a user missing two days in three is offered nothing to add",
       not [r for r in recs if r.kind == "add"], [r.headline for r in recs])

    fresh = Program("u", START, 60, (ProgramHabit("walk", 3), ProgramHabit("read", 10),
                                     ProgramHabit("water", 17)))
    ok("nothing is recommended before there is any evidence",
       not recommend(fresh, _kept_all(fresh, 4), 4),
       [r.headline for r in recommend(fresh, _kept_all(fresh, 4), 4)])

    section("every recommendation is one the user can actually take")
    recs = recommend(prog, _kept_all(prog, today), today)
    ok("a user keeping everything is offered something", bool(recs), recs)

    # The whole list, accepted in order. Independently-valid suggestions are not
    # the same as a list you can accept: two habits offered on the same day is
    # one offer the spacing rule refuses.
    cur = prog
    refused = []
    for r in recs:
        cur, notes = apply_recommendation(cur, r, today)
        if any(n.startswith("declined") for n in notes):
            refused.append((r.habit_id, notes))
    ok("the whole list can be accepted in order, none refused", not refused, refused)
    ok("and the programme is still feasible on all 66 days",
       not validate(cur), [str(v) for v in validate(cur)][:3])

    # Oracle: the spacing rule from the catalog constant, not from the helper
    # in recommend.py that places the days.
    starts = sorted(p.start_day for p in cur.habits)
    illegal = [x for x in starts if sum(1 for y in starts if x - 6 <= y <= x) > MAX_NEW_PER_WEEK]
    ok(f"no more than {MAX_NEW_PER_WEEK} habits start in any 7-day window afterwards",
       not illegal, (starts, illegal))
    ok("nothing already running was rescheduled",
       all(next(q for q in cur.habits if q.habit_id == p.habit_id).start_day == p.start_day
           for p in prog.habits),
       [p.habit_id for p in prog.habits])

    section("advance is offered for earned ramp, and only for that")
    at_full, _ = repair(Program("u", START, 90, (ProgramHabit("walk", 1), ProgramHabit("read", 8),
                                                 ProgramHabit("water", 15))))
    if all(p.scale == 1.0 and p.frozen_day is None for p in at_full.habits):
        ok("a programme at full pace is never offered an advance",
           not [r for r in recommend(at_full, _kept_all(at_full, today), today)
                if r.kind == "advance"], "an advance appeared with nothing to give back")
    else:
        ok("a programme at full pace is never offered an advance", True)

    eased, _ = apply_patch(prog, [{"op": "freeze", "habit_id": "walk"}], today=20)
    kept = [r for r in recommend(eased, _kept_all(eased, today), today) if r.kind == "advance"]
    ok("a frozen habit the user keeps anyway is offered back",
       any(r.habit_id == "walk" for r in kept), [r.habit_id for r in kept])

    # Legal, validating, and worthless: `scale` rounds, so a resume can land on
    # the same step and offer "4 -> 4 glasses". No invariant catches it, because
    # nothing is wrong with the programme — it is the *suggestion* that is empty.
    # Oracle is the catalog's step, not whatever the recommender reports.
    flat = []
    for start in (1, 8, 15):
        for scale in (0.25, 0.5, 0.75):
            for day in range(20, PROGRAM_DAYS):
                p = Program("u", START, 120, (ProgramHabit("water", start, scale=scale),
                                              ProgramHabit("read", start + 7),
                                              ProgramHabit("walk", start + 14)))
                if validate(p):
                    continue
                for r in recommend(p, _kept_all(p, day), day):
                    if r.kind != "advance":
                        continue
                    q = next(x for x in p.habits if x.habit_id == r.habit_id)
                    after, _ = apply_recommendation(p, r, day)
                    q2 = next(x for x in after.habits if x.habit_id == r.habit_id)
                    nxt = min(day + 1, PROGRAM_DAYS)
                    rise = dose_for(q2, nxt) - dose_for(q, nxt)
                    if rise <= 1e-9 or rise > habit(r.habit_id).step + 1e-9:
                        flat.append(f"{r.habit_id} day {day} scale {scale}: {rise:+g}")
    ok("every advance offered moves tomorrow's ask, by one step and no more",
       not flat, flat[:3])

    # Same programme, same freeze, a user who is not keeping it.
    slipping = _logs(eased, today, {d for d in range(1, today) if d % 2 == 0})
    ok(f"and is not, below {ADVANCE_READY_RATE:.0%} completion",
       not [r for r in recommend(eased, slipping, today) if r.kind == "advance"],
       [r.habit_id for r in recommend(eased, slipping, today) if r.kind == "advance"])


# ---------------------------------------------------------------------------
# The stored shape — the decision that gets expensive after it ships
# ---------------------------------------------------------------------------


def test_state() -> None:
    section("a run survives being written down and read back")
    prog, _ = repair(Program("u1", START, 60, (
        ProgramHabit("walk", 1), ProgramHabit("water", 8, scale=0.5),
        ProgramHabit("read", 15, frozen_day=30), ProgramHabit("vitamins", 22),
    )))
    logs = {1: record_day(prog, 1, ["walk", "water"]),
            3: record_day(prog, 3, ["walk"]),
            30: record_day(prog, 30, [])}

    back = state.loads(state.dumps(prog, logs))
    ok("the programme round-trips exactly", back.program == prog, (back.program, prog))
    ok("the logs round-trip exactly", back.logs == logs, back.logs)
    ok("a clean save reports nothing", back.notes == (), back.notes)

    # Same state, same bytes: a save that serialises two ways breaks content
    # hashing and makes every sync look like a change.
    ok("writing is deterministic", state.dumps(back.program, back.logs) == state.dumps(prog, logs))

    # The oracle is the declared key list, not whatever to_dict happened to emit.
    written = state.to_dict(prog, logs)
    ok("a save carries exactly the declared keys and no others",
       tuple(written) == state.TOP_LEVEL_KEYS, tuple(written))
    ok("and each habit carries exactly its own",
       all(tuple(h) == state.HABIT_KEYS for h in written["habits"]), written["habits"][:1])

    # Nothing derived. Every one of these is recomputed from the catalog and the
    # calendar, and a stored copy is a copy that will disagree.
    blob = state.dumps(prog, logs)
    derived = [w for w in ("dose", "today", "minutes_for", "streak", "rate", "phase",
                           "target_dose", "day_of_habit") if f'"{w}"' in blob]
    ok("no derived value is stored", not derived, derived)

    section("a save that cannot be honoured is refused, not guessed at")

    def refuses(label: str, text: str) -> str:
        try:
            state.loads(text)
        except state.StateError as exc:
            ok(label, True)
            return str(exc)
        ok(label, False, "it was accepted")
        return ""

    refuses("rejects what is not JSON", "this is my diary, not a save")
    refuses("rejects a JSON array", "[]")
    refuses("rejects null", "null")
    refuses("rejects a save with no schema version", json.dumps({"user_id": "u"}))
    refuses("rejects a save with no habit list",
            json.dumps({"version": 1, "user_id": "u", "start_date": "2026-01-01",
                        "minutes_budget": 60}))
    newer = refuses("rejects a save from a newer build",
                    json.dumps({"version": state.SCHEMA_VERSION + 1, "user_id": "u",
                                "start_date": "2026-01-01", "minutes_budget": 60,
                                "habits": []}))
    ok("and names both schema versions so the reason is actionable",
       str(state.SCHEMA_VERSION + 1) in newer and str(state.SCHEMA_VERSION) in newer, newer)

    # `isinstance(True, int)` is True in Python, so an unguarded read turns
    # "minutes_budget": true into a 1-minute budget and every day infeasible.
    d = state.to_dict(prog, logs)
    d["minutes_budget"] = True
    refuses("rejects a boolean where a number belongs", json.dumps(d))

    d = state.to_dict(prog, logs)
    d["habits"][0]["start_day"] = "soon"
    refuses("rejects corruption rather than guessing at it", json.dumps(d))

    d = state.to_dict(prog, logs)
    d["habits"][0]["scale"] = float("nan")
    refuses("rejects a scale that is not a number", json.dumps(d, allow_nan=True))

    section("a catalog that has moved costs a habit, never the run")
    d = state.to_dict(prog, logs)
    d["habits"][1]["habit_id"] = "moon_bathing"          # retired from the catalog
    loaded = state.from_dict(d)
    ok("an unknown habit is dropped, not raised on",
       len(loaded.program.habits) == len(prog.habits) - 1, loaded.program.ids())
    ok("and the drop is reported rather than silent",
       any("moon_bathing" in n for n in loaded.notes), loaded.notes)
    ok("the day counter is untouched — start_date is what it was",
       loaded.program.start_date == prog.start_date)
    ok("a log of something the catalog no longer has is still the user's record",
       loaded.logs == logs, loaded.logs)

    section("loading is faithful; validate judges; repair fixes")
    d = state.to_dict(prog, logs)
    d["habits"][0]["start_day"] = 900                    # outside [1, LAST_INTRO_DAY]
    loaded = state.from_dict(d)
    ok("an impossible start day is preserved, not quietly clamped",
       loaded.program.habits[0].start_day == 900, loaded.program.habits[0])
    ok("and validate is the thing that objects to it",
       any(v.kind == "start_day_range" for v in validate(loaded.program)),
       [str(v) for v in validate(loaded.program)][:2])
    fixed, _ = repair(loaded.program)
    ok("and repair is the thing that fixes it", not validate(fixed),
       [str(v) for v in validate(fixed)][:2])


# ---------------------------------------------------------------------------
# The day record — a lived day is read, never recomputed
# ---------------------------------------------------------------------------


def test_day_record() -> None:
    section("a day that has been lived stops moving")
    prog, _ = repair(Program("u", START, 90, (
        ProgramHabit("walk", 1), ProgramHabit("read", 8), ProgramHabit("water", 15),
    )))
    lived = {d: record_day(prog, d, [p.habit_id for p in prog.habits]) for d in range(1, 30)}
    before = {d: dict(e) for d, e in lived.items()}

    # The whole point. `dose_for` answers from the habit's *current* state, so
    # softening on day 30 moves what it says about day 12. The record does not
    # move, because it was written down at the time.
    eased, _ = apply_patch(prog, [{"op": "soften", "habit_id": "walk", "factor": 0.5}], today=30)
    moved = [d for d in lived if lived[d] != before[d]]
    ok("softening today does not change what a past day asked", not moved, moved[:3])

    drifted = [d for d in range(1, 30)
               if lived[d]["walk"].asked != dose_for(
                   next(p for p in eased.habits if p.habit_id == "walk"), d)]
    ok("and dose_for now disagrees with it, which is exactly why the record exists",
       bool(drifted), "dose_for still matches, so nothing was proved")

    # The oracle is the catalog, not dose_for: day one asks the start_dose.
    off = [hid for hid, e in lived[1].items() if e.asked != habit(hid).start_dose]
    ok("a recorded day one carries the catalog's own start_dose", not off, off)

    section("a record says what was asked, not what the programme now says")
    partial = record_day(prog, 20, ["walk"])
    ok("every habit live that day is in the record",
       set(partial) == {p.habit_id for p in prog.habits if p.start_day <= 20}, set(partial))
    ok("a habit that had not started is absent, not recorded as missed",
       all(p.start_day <= 20 for p in prog.habits if p.habit_id in partial))
    ok("done is per habit, not per day",
       partial["walk"].done and not partial["read"].done,
       {k: v.done for k, v in partial.items()})

    # diagnose used to derive "was this asked" from the habit's *current*
    # start_day, so deferring a habit re-scored a fortnight the user had lived.
    deferred, _ = apply_patch(prog, [{"op": "defer", "habit_id": "water", "days": 21}], today=16)
    ok("deferring a habit does not rewrite the completion rate of days already lived",
       diagnose(deferred, lived, 30)["per_habit"]["water"]["asked"]
       == diagnose(prog, lived, 30)["per_habit"]["water"]["asked"],
       (diagnose(deferred, lived, 30)["per_habit"]["water"],
        diagnose(prog, lived, 30)["per_habit"]["water"]))

    section("a schema-1 save keeps its history and admits what it lost")
    v1 = state.to_dict(prog)
    v1["version"] = 1
    v1["logs"] = {"12": ["walk", "read"], "13": ["walk"]}
    loaded = state.from_dict(v1)
    ok("the days survive the upgrade", sorted(loaded.logs) == [12, 13], sorted(loaded.logs))
    ok("what was known is kept", loaded.logs[12]["walk"].done and loaded.logs[13]["walk"].done)
    # Reconstructing the ask from today's programme is the re-judging the record
    # exists to prevent, so it stays unknown rather than being invented.
    ok("what was never written down is not invented",
       all(e.asked is None for day in loaded.logs.values() for e in day.values()),
       loaded.logs)
    ok("and the upgrade says so out loud",
       any("not recoverable" in n for n in loaded.notes), loaded.notes)
    ok("an upgraded save is written back at the current schema",
       state.to_dict(loaded.program, loaded.logs)["version"] == state.SCHEMA_VERSION)


# ---------------------------------------------------------------------------
# The app-facing loop
# ---------------------------------------------------------------------------


def test_session() -> None:
    section("a run has a beginning and an end")
    prog, _ = repair(Program("u", START, 60, (
        ProgramHabit("walk", 1), ProgramHabit("water", 8), ProgramHabit("read", 15),
    )))

    # Oracle is calendar arithmetic done here, not day_index called twice.
    from datetime import timedelta
    cases = [(-11, "not_started"), (0, "not_started"), (1, "running"),
             (PROGRAM_DAYS, "running"), (PROGRAM_DAYS + 1, "finished")]
    wrong = []
    for day, expect in cases:
        on = START + timedelta(days=day - 1)
        got = where(prog, on)
        if got.day != day or got.state != expect:
            wrong.append(f"{on}: {got} wanted day {day} {expect}")
    ok("before, during and after the run are told apart", not wrong, wrong[:3])
    ok("the day number is not clamped, so day 80 is not day 66",
       where(prog, START + timedelta(days=79)).day == 80,
       where(prog, START + timedelta(days=79)))
    ok("and it says how far past the end", where(prog, START + timedelta(days=79)).days_over == 14)

    # It used to print "Day 80 of 66" over a full day's prescription.
    out = render_program_day(prog, PROGRAM_DAYS + 14)
    ok("a finished run stops prescribing", "Day 80" not in out and "min" not in out, out)

    section("stepping in and offering more are never the same day")
    today = 30
    struggling = _logs(prog, today, {d for d in range(1, today) if d % 4 == 0})
    ci = check_in(prog, struggling, today)
    ok("a user who is missing days gets a patch", ci.patched, ci.notes)
    ok("and is offered nothing on top of it", ci.recommendations == (), ci.recommendations)
    ok("the patched programme comes back feasible", not validate(ci.program),
       [str(v) for v in validate(ci.program)][:2])

    # The case that makes "never both" an invariant rather than a slogan. Only
    # `add` is gated on needs_intervention; `advance` is gated on a *per-habit*
    # rate, so someone holding one habit at 100% while the rest collapse trips
    # intervention and qualifies for an advance at the same time. `recommend`
    # alone offers it. `check_in` is the thing that does not.
    eased, _ = apply_patch(prog, [{"op": "freeze", "habit_id": "walk"}], today=18)
    mixed = {}
    for d in range(1, 32):
        done = ["walk"] + (["read", "water"] if d < 27 else [])
        mixed[d] = record_day(eased, d, done)
    ok("a lopsided user really does qualify for both at once",
       diagnose(eased, mixed, 32)["needs_intervention"]
       and any(r.kind == "advance" for r in recommend(eased, mixed, 32)),
       "the fixture no longer reaches the case it was built for")
    ci = check_in(eased, mixed, 32)
    ok("and check_in still offers them nothing while it is stepping in",
       ci.patched and ci.recommendations == (),
       (ci.patched, [r.habit_id for r in ci.recommendations]))

    ci = check_in(prog, _kept_all(prog, today), today)
    ok("a user who is keeping up is not patched", not ci.patched, ci.notes)
    ok("and the programme comes back untouched", ci.program == prog)
    ok("they may be offered something instead", bool(ci.recommendations),
       "nothing offered to a 100% user")

    section("outside the run there is nothing to decide")
    for day in (0, PROGRAM_DAYS + 1):
        ci = check_in(prog, _kept_all(prog, today), day)
        ok(f"day {day}: no patch and no suggestion",
           not ci.patched and ci.recommendations == () and ci.program == prog, ci)

    section("the cycle in CLAUDE.md is the cycle that runs")
    # The documented example imported `build_program` from the package, which
    # did not export it. Documentation nobody executes is documentation that is
    # wrong, so this runs it: the same imports, the same order.
    import life_reset

    missing = [n for n in ("build_program", "dumps", "loads", "where", "check_in",
                           "program_day", "record_day", "apply_recommendation")
               if not hasattr(life_reset, n)]
    ok("every call the cycle names is exported from the package", not missing, missing)

    from datetime import timedelta as _td

    built, _meta = life_reset.build_program(None, "intake", "u", START, minutes_budget=45)
    save = life_reset.dumps(built, {})
    loaded = life_reset.loads(save)
    run = life_reset.where(loaded.program, START + _td(days=29))
    cycle_logs = {
        d: life_reset.record_day(loaded.program, d,
                                 [p.habit_id for p in loaded.program.habits])
        for d in range(1, run.day)
    }
    result = life_reset.check_in(loaded.program, cycle_logs, run.day)
    for rec in result.recommendations:
        life_reset.apply_recommendation(result.program, rec, run.day)
    ok("and the whole loop runs end to end from a cold start",
       run.running and life_reset.loads(life_reset.dumps(result.program, cycle_logs)).program
       == result.program,
       (run, result.patched))


# ---------------------------------------------------------------------------
# The five ops — four of which the harness never executed
# ---------------------------------------------------------------------------


def test_ops() -> None:
    section("apply_patch survives anything a model can put in an op")
    # The budget is generous on purpose. At 90 minutes `repair` dropped `read`
    # to fit day 57, leaving three habits — and every `drop` below then hit the
    # MIN_HABITS floor and was correctly ignored, so the test passed while
    # proving nothing about drop. A fixture that quietly stops reaching the code
    # it names is the failure this file exists to catch, so it is asserted.
    prog, _ = repair(Program("u", START, 150, (
        ProgramHabit("walk", 1), ProgramHabit("read", 8),
        ProgramHabit("water", 15), ProgramHabit("plank", 30),
    )))
    ok(f"the fixture survives repair with room above the {MIN_HABITS}-habit floor",
       len(prog.habits) > MIN_HABITS, prog.ids())

    # Every one of these was a live crash out of apply_patch, through
    # adapt_program — whose try/except only covers the call to the model — and
    # into session.check_in, which an app runs every time it opens.
    hostile = [
        [{"op": "soften", "habit_id": "walk", "factor": "half"}],
        [{"op": "soften", "habit_id": "walk", "factor": None}],
        [{"op": "soften", "habit_id": "walk", "factor": [1]}],
        [{"op": "soften", "habit_id": "walk", "factor": float("nan")}],
        [{"op": "soften", "habit_id": "walk", "factor": float("inf")}],
        [{"op": "soften", "habit_id": "walk", "factor": -5}],
        [{"op": "defer", "habit_id": "plank", "days": "soon"}],
        [{"op": "defer", "habit_id": "plank", "days": None}],
        [{"op": "defer", "habit_id": "plank", "days": 10 ** 9}],
        [{"op": "obliterate", "habit_id": "walk"}],
        [{"op": "drop", "habit_id": "cold_plunge"}],
        [{}],
        [{"op": "soften"}],
    ]
    crashed, unsaveable, invalid = [], [], []
    for ops in hostile:
        try:
            after, _notes = apply_patch(prog, ops, today=20)
        except Exception as exc:                                  # noqa: BLE001
            crashed.append(f"{ops[0]}: {type(exc).__name__}: {exc}")
            continue
        if validate(after):
            invalid.append(str(ops[0]))
        try:
            state.dumps(after)
        except ValueError:
            unsaveable.append(str(ops[0]))
    ok("no op payload raises", not crashed, crashed[:2])
    ok("and none of them leaves an infeasible programme", not invalid, invalid[:2])
    # A NaN scale validated clean and made every later save throw, so the run
    # was corrupt without a single invariant noticing.
    ok("and none of them leaves a run that cannot be saved", not unsaveable, unsaveable[:2])

    section("each op does what it says, measured against the catalog")
    step = habit("walk").step
    w = lambda p, hid="walk": next(x for x in p.habits if x.habit_id == hid)

    frozen, _ = apply_patch(prog, [{"op": "freeze", "habit_id": "walk"}], today=20)
    ok("freeze pins the dose to the day it froze",
       all(dose_for(w(frozen), d) == dose_for(w(prog), 20) for d in range(20, PROGRAM_DAYS + 1)),
       (dose_for(w(frozen), 60), dose_for(w(prog), 20)))
    twice, _ = apply_patch(frozen, [{"op": "freeze", "habit_id": "walk"}], today=40)
    ok("and freezing again does not move the pin later",
       w(twice).frozen_day == w(frozen).frozen_day, (w(twice), w(frozen)))

    soft, _ = apply_patch(prog, [{"op": "soften", "habit_id": "walk", "factor": 0.5}], today=20)
    ok("soften halves the ramp and never touches the starting dose",
       dose_for(w(soft), 1) == habit("walk").start_dose
       and dose_for(w(soft), 60) < dose_for(w(prog), 60),
       (dose_for(w(soft), 1), dose_for(w(soft), 60), dose_for(w(prog), 60)))

    deferred, _ = apply_patch(prog, [{"op": "defer", "habit_id": "plank", "days": 7}], today=20)
    ok("defer moves a habit that has not started",
       w(deferred, "plank").start_day == w(prog, "plank").start_day + 7,
       (w(deferred, "plank"), w(prog, "plank")))
    ok("and never past the last day a habit may be introduced",
       w(apply_patch(prog, [{"op": "defer", "habit_id": "plank", "days": 10 ** 9}],
                     today=20)[0], "plank").start_day <= LAST_INTRO_DAY)
    underway, notes = apply_patch(prog, [{"op": "defer", "habit_id": "walk", "days": 7}], today=20)
    ok("but refuses to move one the user is already running",
       w(underway).start_day == w(prog).start_day
       and any("already underway" in n for n in notes), notes)

    dropped, _ = apply_patch(prog, [{"op": "drop", "habit_id": "plank"}], today=20)
    ok("drop removes the habit", "plank" not in dropped.ids(), dropped.ids())
    floor = Program("u", START, 90, prog.habits[:MIN_HABITS])
    held, notes = apply_patch(floor, [{"op": "drop", "habit_id": floor.ids()[0]}], today=20)
    ok(f"and stops at the {MIN_HABITS}-habit floor",
       len(held.habits) == MIN_HABITS and any("floor" in n for n in notes), notes)

    section("the patch cap counts ops, not the repair that follows")
    many = [{"op": "soften", "habit_id": h, "factor": 0.5} for h in prog.ids()]
    capped, notes = apply_patch(prog, many, today=20)
    moved = [p.habit_id for p in capped.habits
             if p.habit_id in prog.ids() and p != w(prog, p.habit_id)]
    ok(f"at most {MAX_PATCH_HABITS} habits are touched by a patch",
       len(moved) <= MAX_PATCH_HABITS, moved)
    ok("and the ones past the cap say why they were ignored",
       any("already touches" in n for n in notes), notes[:3])


def main() -> int:
    test_doses()
    test_anchors()
    test_ops()
    test_state()
    test_day_record()
    test_session()
    test_intervention_triggers()
    test_resume()
    test_recommend()
    test_repair_protects_underway()
    test_render()
    print(f"\n{_passed} passed, {len(_failed)} failed\n")
    return 1 if _failed else 0


if __name__ == "__main__":
    sys.exit(main())
