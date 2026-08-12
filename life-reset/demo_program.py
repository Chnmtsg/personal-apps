"""The 66-day program layer, end to end, offline and deterministic.

    python demo_program.py
    python demo_program.py --live    # real Architect, ANTHROPIC_API_KEY

Shows the four things that matter and are hard to see from the code alone:

1. A hostile Architect still produces a feasible programme, because `repair`
   fixes rather than re-prompts.
2. The shape of the ramp: day one, mid-run, and the last day.
3. A user who stops for four days gets a *softened* day 24 — still day 24.
   The counter does not reset, and that is the whole product.
4. The same user, a fortnight later, having got back on it: the programme grows
   again. Read this section rather than trusting the suites — every automated
   check can tell you a recommendation is *legal*, and none of them can tell you
   it is worth making. That gap is what shipped five habits frozen at their
   starting dose for a whole run with zero invariant violations.
"""

from __future__ import annotations

import json
import sys
from datetime import date

from life_reset.agents import TRAILING_DAYS, adapt_program, build_program, diagnose
from life_reset.program import PROGRAM_DAYS, render_program_day, validate
from life_reset.recommend import apply_recommendation, recommend

START = date(2026, 1, 1)
RULE = "=" * 72


class HostileArchitect:
    """Everything a real model eventually does, in one response: an invented id,
    a duplicate, an out-of-range start day, and every habit on day one."""

    def complete(self, system: str, user: str) -> str:
        return json.dumps(
            {
                "habits": [
                    {"id": "walk", "start_day": 1},
                    {"id": "walk", "start_day": 1},          # duplicate
                    {"id": "cold_plunge", "start_day": 1},   # not in the catalog
                    {"id": "deep_work", "start_day": 1},
                    {"id": "run", "start_day": 1},
                    {"id": "read", "start_day": 900},        # out of range
                    {"id": "water", "start_day": 1},
                    {"id": "meditate", "start_day": 1},
                ]
            }
        )


def section(title: str) -> None:
    print(f"\n{RULE}\n{title}\n{RULE}")


def main() -> None:
    live = "--live" in sys.argv
    llm = None
    if live:
        from life_reset.nodes import AnthropicLLM

        llm = AnthropicLLM()
    else:
        llm = HostileArchitect()

    section("1. ARCHITECT — a hostile response, repaired rather than re-prompted")
    prog, meta = build_program(llm, "Desk job, 45 min a day, wants to sleep better.",
                               "demo-user", START, minutes_budget=45)
    stub = "" if live else " (hostile stub, no model ran)"
    print(f"  source              {meta['source']}{stub}")
    print(f"  rejected            {meta['rejected'] or 'nothing'}")
    for r in meta["repairs"]:
        print(f"  repair              {r}")
    print(f"  violations left     {meta['violations_remaining'] or 'none'}")
    print(f"\n  final programme     {len(prog.habits)} habits")
    for p in sorted(prog.habits, key=lambda p: p.start_day):
        print(f"      day {p.start_day:>2}  {p.habit_id}")

    section("2. DAY 1, DAY 24, DAY 66 - THE SHAPE OF THE RAMP")
    for day in (1, 24, 66):
        print(render_program_day(prog, day))
        print()

    section("3. A USER WHO STOPS — the counter does not reset")
    today = 24
    # Kept everything for a fortnight, then stopped dead for four days.
    logs: dict[int, set[str]] = {}
    for d in range(1, today):
        live_ids = {p.habit_id for p in prog.habits if p.start_day <= d}
        logs[d] = set() if d >= today - 4 else live_ids

    diag = diagnose(prog, logs, today)
    print(f"  overall completion  {diag['overall_rate']:.0%}")
    print(f"  needs intervention  {diag['needs_intervention']}")
    for hid, s in sorted(diag["per_habit"].items()):
        if s["asked"]:
            print(f"      {hid:<14} {s['done']}/{s['asked']} kept · {s['missed_streak']} missed in a row")

    after, ameta = adapt_program(None, prog, diag, today)
    print(f"\n  patch source        {ameta['source']}")
    for n in ameta["notes"]:
        print(f"      {n}")
    for n in ameta["ignored"]:
        print(f"      ignored: {n}")
    print(f"  violations left     {ameta['violations_remaining'] or 'none'}")

    print("\n  the day after the patch:\n")
    print(render_program_day(after, today))

    print(f"\n  still day {today} of {PROGRAM_DAYS}. Nothing was reset.\n")

    assert not validate(after), "a shipped programme must be feasible"

    section("4. THE SAME USER, RECOVERED — the programme grows again")
    later = min(today + TRAILING_DAYS, PROGRAM_DAYS)
    back: dict[int, set[str]] = {
        d: {p.habit_id for p in after.habits if p.start_day <= d} for d in range(1, later)
    }
    print(f"  day {later}, having kept everything since the patch")
    print(f"  overall completion  {diagnose(after, back, later)['overall_rate']:.0%}\n")

    recs = recommend(after, back, later)
    if not recs:
        print("  nothing offered — which is a legitimate answer most days.\n")
    grown = after
    for r in recs:
        print(f"  [{r.kind}] {r.headline} · {r.detail}")
        for why in r.reasons:
            print(f"        {why}")
        grown, notes = apply_recommendation(grown, r, later)
        print(f"        -> {notes[0]}\n")

    if recs:
        print("  the day after taking all of them:\n")
        print(render_program_day(grown, later + 1))
        print()

    assert not validate(grown), "a suggestion must never ship an infeasible day"


if __name__ == "__main__":
    main()
