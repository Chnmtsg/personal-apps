"""Walks synthetic users across all 66 days and checks the invariants.

    python eval_harness.py
    python eval_harness.py --users 5000
    python eval_harness.py --live      # includes real Architect calls

This is where bugs in `validate` and `repair` get caught, and it is deliberately
not an agent. An LLM asked to review a programme reads sensible-looking habits
and approves it; the failure modes here are arithmetic — a rounding overshoot on
day 41, a repair loop that swaps two zero-cost habits forever — and no amount of
prose review finds those.

Adversarial Architects are cycled in on purpose. A real model will eventually
produce every one of them, so `repair` has to survive all of them.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import date
from typing import Callable

from life_reset.agents import (
    INTERVENTION_RATE,
    TRAILING_DAYS,
    adapt_program,
    build_program,
    diagnose,
)
from life_reset.catalog import (
    HABITS,
    LAST_INTRO_DAY,
    MAX_NEW_PER_WEEK,
    MIN_HABITS,
    PROGRAM_DAYS,
    habit,
    phase_for,
)
from life_reset.program import (
    MAX_PATCH_HABITS,
    Program,
    active_on,
    day_minutes,
    dose_for,
    validate,
)
from life_reset.recommend import apply_recommendation, recommend

START = date(2026, 1, 1)


# ---------------------------------------------------------------------------
# Adversarial architects — every one of these is something a model really does
# ---------------------------------------------------------------------------


class Scripted:
    def __init__(self, payload: str):
        self.payload = payload

    def complete(self, system: str, user: str) -> str:
        return self.payload


def _valid(rng: random.Random) -> str:
    picks = rng.sample([h.id for h in HABITS], rng.randint(6, 9))
    return json.dumps(
        {"habits": [{"id": h, "start_day": rng.randint(1, LAST_INTRO_DAY)} for h in picks]}
    )


ADVERSARIES: dict[str, Callable[[random.Random], str]] = {
    "well_formed": _valid,
    "malformed_json": lambda r: '{"habits": [{"id": "walk", "start_day": 1},,]',
    "prose_not_json": lambda r: "Sure! I'd suggest walking daily and drinking more water.",
    "empty": lambda r: "",
    "invented_ids": lambda r: json.dumps(
        {"habits": [{"id": "cold_plunge", "start_day": 1}, {"id": "walk", "start_day": 2},
                    {"id": "biohack", "start_day": 3}, {"id": "read", "start_day": 9}]}
    ),
    "duplicates": lambda r: json.dumps(
        {"habits": [{"id": "walk", "start_day": 1}] * 8}
    ),
    "negative_days": lambda r: json.dumps(
        {"habits": [{"id": h.id, "start_day": -5} for h in HABITS[:7]]}
    ),
    "out_of_range_days": lambda r: json.dumps(
        {"habits": [{"id": h.id, "start_day": 900} for h in HABITS[:7]]}
    ),
    "all_on_day_one": lambda r: json.dumps(
        {"habits": [{"id": h.id, "start_day": 1} for h in HABITS]}
    ),
    "single_habit": lambda r: json.dumps({"habits": [{"id": "walk", "start_day": 1}]}),
    "all_high_friction": lambda r: json.dumps(
        {"habits": [{"id": h.id, "start_day": 1 + i * 3}
                    for i, h in enumerate(h for h in HABITS if h.friction >= 4)]}
    ),
    "wrong_types": lambda r: json.dumps(
        {"habits": [{"id": 42, "start_day": "soon"}, {"id": "walk", "start_day": None},
                    {"id": "read", "start_day": 8}, {"id": "water", "start_day": 15}]}
    ),
}


# ---------------------------------------------------------------------------
# Invariants
# ---------------------------------------------------------------------------


class Failures:
    def __init__(self) -> None:
        self.by_kind: dict[str, list[str]] = {}

    def add(self, kind: str, detail: str) -> None:
        self.by_kind.setdefault(kind, []).append(detail)

    @property
    def total(self) -> int:
        return sum(len(v) for v in self.by_kind.values())


def check_program(prog: Program, tag: str, f: Failures) -> None:
    """Per user, walked across all 66 days."""
    for v in validate(prog):
        f.add(v.kind, f"{tag}: {v}")

    if len(prog.habits) < MIN_HABITS:
        f.add("min_habits", f"{tag}: shipped {len(prog.habits)} habits")

    starts = sorted(p.start_day for p in prog.habits)
    for d in starts:
        if sum(1 for x in starts if d - 6 <= x <= d) > MAX_NEW_PER_WEEK:
            f.add("new_per_week", f"{tag}: {starts}")
            break

    for p in prog.habits:
        h = habit(p.habit_id)
        previous = None
        for day in range(p.start_day, PROGRAM_DAYS + 1):
            d = dose_for(p, day)
            if d < h.start_dose - 1e-9 or d > h.target_dose + 1e-9:
                f.add("dose_in_bounds", f"{tag}: {h.id} day {day} dose {d:g}")
                break
            if previous is not None and d < previous - 1e-9:
                f.add("dose_monotonic", f"{tag}: {h.id} day {day}")
                break
            previous = d

    for day in range(1, PROGRAM_DAYS + 1):
        if day_minutes(prog, day) > prog.minutes_budget + 1e-9:
            f.add("daily_budget", f"{tag}: day {day} {day_minutes(prog, day):.0f} min")
            break
        if len(active_on(prog, day)) > phase_for(day).max_habits:
            f.add("phase_cap", f"{tag}: day {day}")
            break


def check_patch(before: Program, after: Program, meta: dict, today: int,
                diag: dict, tag: str, f: Failures) -> None:
    """Per patch. The day counter is not in here because it cannot be — nothing
    in `apply_patch` can reach it, which is the point."""
    changed = set()
    b = {p.habit_id: p for p in before.habits}
    a = {p.habit_id: p for p in after.habits}
    for hid in set(b) | set(a):
        if hid not in a or hid not in b or b[hid] != a[hid]:
            changed.add(hid)
    if len(changed) > MAX_PATCH_HABITS:
        f.add("patch_is_small", f"{tag}: touched {sorted(changed)}")

    for hid, stats in diag["per_habit"].items():
        if stats["asked"] and stats["rate"] >= 0.7 and hid in changed:
            f.add("working_habit_untouched", f"{tag}: {hid} at {stats['rate']:.0%} was changed")

    if len(after.habits) < MIN_HABITS:
        f.add("min_habits", f"{tag}: patch left {len(after.habits)} habits")

    for v in validate(after):
        f.add("repair_leaves_no_violations", f"{tag}: {v}")

    for p in after.habits:
        was = b.get(p.habit_id)
        if was and was.start_day <= today and p.start_day != was.start_day:
            f.add("underway_habit_not_moved", f"{tag}: {p.habit_id} rescheduled mid-run")


# ---------------------------------------------------------------------------


def check_recommendations(prog: Program, logs: dict[int, set[str]], today: int,
                          diag: dict, tag: str, f: Failures) -> dict[str, int]:
    """Per user. Every suggestion offered, taken in the order it was offered.

    A recommendation is a promise the app makes to someone who is doing well,
    and the way to break it is to offer a tap that gets refused — which is why
    the whole list is accepted here rather than one item from it. Suggestions
    that are individually legal are not thereby legal together: two habits both
    offered "from day 31" is one offer the spacing rule cannot honour.

    The construction is deliberately not shared with `recommend`. That function
    validates the candidates it builds; this one re-derives them through
    `apply_recommendation` from the intent alone and validates the result. If
    the two ever stop agreeing, this is what notices — a check that called back
    into `recommend`'s own helpers would agree with it by construction, which is
    the mistake `dose_for` cost this project 165,000 clean day-renders to find.
    """
    recs = recommend(prog, logs, today)
    if not recs:
        return {}

    # Never both at once: `adapt_program` is stepping in exactly when the user
    # is in no state to be handed more work.
    if diag["needs_intervention"] and any(r.kind == "add" for r in recs):
        f.add("no_adds_while_struggling", f"{tag}: offered an add at {diag['overall_rate']:.0%}")

    cur = prog
    nxt = min(today + 1, PROGRAM_DAYS)
    for r in recs:
        was = next((dose_for(p, nxt) for p in cur.habits if p.habit_id == r.habit_id), None)
        cur, notes = apply_recommendation(cur, r, today)
        if any(n.startswith("declined") for n in notes):
            f.add("offered_is_acceptable", f"{tag}: {r.kind} {r.habit_id} refused — {notes[0]}")
        for v in validate(cur):
            f.add("recommendation_leaves_no_violations", f"{tag}: {r.habit_id}: {v}")

        # An advance that does not advance. `scale` rounds, so a resume can land
        # on the same step and offer the user "4 -> 4 glasses": legal, valid,
        # and worthless. Every invariant above passed it 369 times.
        if r.kind == "advance" and was is not None:
            now = next(dose_for(p, nxt) for p in cur.habits if p.habit_id == r.habit_id)
            if now <= was + 1e-9:
                f.add("advance_actually_advances",
                      f"{tag}: {r.habit_id} still asks {was:g} tomorrow")

    before = {p.habit_id: p for p in prog.habits}
    for p in cur.habits:
        was = before.get(p.habit_id)
        if was and was.start_day <= today and p.start_day != was.start_day:
            f.add("underway_habit_not_moved", f"{tag}: {p.habit_id} rescheduled by a suggestion")
        # Suggestions add and give back. None of them may take anything away.
        if was and dose_for(p, today) < dose_for(was, today) - 1e-9:
            f.add("suggestion_never_subtracts", f"{tag}: {p.habit_id} asks for less afterwards")
    for hid in before:
        if hid not in {p.habit_id for p in cur.habits}:
            f.add("suggestion_never_subtracts", f"{tag}: {hid} disappeared")

    # Reported per kind, and the report is part of the check. Half of these
    # assertions only mean anything if `advance` actually fires, and this
    # harness has shipped a vacuously-passing invariant before — an assertion
    # of the form `A and not (A or B)` that ran 2,000 times a go and could never
    # fail. A zero in the summary is the signal that a branch went untested.
    kinds: dict[str, int] = {}
    for r in recs:
        kinds[r.kind] = kinds.get(r.kind, 0) + 1
    return kinds


def synthetic_logs(prog: Program, today: int, rng: random.Random,
                   struggling: bool) -> dict[int, set[str]]:
    """A user who is doing fine, or one who has stopped."""
    logs: dict[int, set[str]] = {}
    for day in range(1, today):
        done = set()
        for p in active_on(prog, day):
            keep = 0.35 if struggling else 0.9
            keep -= 0.05 * (habit(p.habit_id).friction - 1)
            if rng.random() < max(0.05, keep):
                done.add(p.habit_id)
        logs[day] = done
    return logs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--users", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--live", action="store_true", help="use a real Architect")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    f = Failures()
    names = list(ADVERSARIES)
    live_llm = None
    if args.live:
        from life_reset.nodes import AnthropicLLM

        live_llm = AnthropicLLM()

    day_renders = 0
    sources = {"llm": 0, "fallback": 0}
    patched_users = 0
    offered: dict[str, int] = {}

    for i in range(args.users):
        kind = names[i % len(names)]
        budget = rng.choice([30, 45, 60, 75, 90, 120])
        llm = live_llm if args.live and kind == "well_formed" else Scripted(ADVERSARIES[kind](rng))

        prog, meta = build_program(llm, "intake", f"u{i}", START, budget)
        sources[meta["source"]] = sources.get(meta["source"], 0) + 1
        check_program(prog, f"{kind}/u{i}", f)
        day_renders += PROGRAM_DAYS

        if meta["violations_remaining"]:
            for v in meta["violations_remaining"]:
                f.add("repair_leaves_no_violations", f"{kind}/u{i}: {v}")

        # Half the users hit a wall around week three and get one patch.
        if i % 2 == 0:
            today = rng.randint(15, 60)
            struggling = i % 4 == 0
            logs = synthetic_logs(prog, today, rng, struggling)
            diag = diagnose(prog, logs, today)
            # The invariant is the implication, not the intent: a *generated*
            # struggler is only probably struggling, but a measured rate below
            # the threshold must always trigger.
            if diag["overall_rate"] < INTERVENTION_RATE and not diag["needs_intervention"]:
                f.add(
                    "intervention_fires",
                    f"{kind}/u{i}: rate {diag['overall_rate']:.0%} did not trigger",
                )
            if diag["needs_intervention"]:
                patched_users += 1
                after, pmeta = adapt_program(None, prog, diag, today)
                check_patch(prog, after, pmeta, today, diag, f"{kind}/u{i}", f)
                check_program(after, f"{kind}/u{i}+patch", f)
                day_renders += PROGRAM_DAYS
                # The recommender against a *patched* programme, which is where
                # anything eased back lives and so the only place `advance` can
                # fire at all.
                got = check_recommendations(after, logs, today, diag, f"{kind}/u{i}+patch", f)

                # And again a fortnight later, having got back on it.
                #
                # This branch exists because the summary said `advance 0`. The
                # patch leaves habits eased, but the user it was written for is
                # by definition not keeping them — so on the day of the patch
                # there is nothing to give back, and the whole advance half of
                # the recommender was passing without ever running. Recovery is
                # the only state it fires in, and nothing here modelled it: the
                # harness patched people and then stopped watching, which is the
                # same shape as the ratchet bug the op was written to fix.
                later = min(today + TRAILING_DAYS, PROGRAM_DAYS)
                back = {d: {p.habit_id for p in active_on(after, d)} for d in range(1, later)}
                for k, n in check_recommendations(
                    after, back, later, diagnose(after, back, later), f"{kind}/u{i}+back", f
                ).items():
                    offered[k] = offered.get(k, 0) + n
            else:
                got = check_recommendations(prog, logs, today, diag, f"{kind}/u{i}", f)
            for k, n in got.items():
                offered[k] = offered.get(k, 0) + n

    print("=" * 72)
    print(f"{args.users} users · {day_renders:,} day-renders · {patched_users} patched")
    print(f"architect source: {sources}")
    # A zero here is a branch that went untested, not a branch that behaved.
    split = ", ".join(f"{k} {n}" for k, n in sorted(offered.items())) or "none"
    print(f"recommendations offered and accepted: {sum(offered.values())} ({split})")
    print("=" * 72)
    if not f.by_kind:
        print("\n  no invariant violations\n")
        return 0

    print(f"\n  {f.total} violations across {len(f.by_kind)} bug classes\n")
    for kind, examples in sorted(f.by_kind.items(), key=lambda kv: -len(kv[1])):
        print(f"  {kind:<32} {len(examples):>6}")
        for e in examples[:2]:
            print(f"      {e}")
    print()
    return 1


if __name__ == "__main__":
    sys.exit(main())
