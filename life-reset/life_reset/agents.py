"""The two program agents: Architect and Adaptation.

Not a graph — two entry points your app calls. Both follow the same contract:

    the model chooses from a closed set, code validates, code repairs.

Re-prompting a model until it stops violating a constraint is not error handling;
it is a slot machine with a latency budget. Every function below is written so
that the *worst* thing a model can return still produces a feasible 66-day
program, which is why `eval_harness.py` can fire malformed JSON, prose, invented
ids and 20-habits-on-day-one at it and expect zero violations afterwards.
"""

from __future__ import annotations

import json
import re
from dataclasses import replace
from datetime import date
from typing import Any, Protocol

from .catalog import (
    HABITS,
    LAST_INTRO_DAY,
    MAX_HABITS,
    MIN_HABITS,
    habit,
    is_known,
)
from .program import (
    MAX_PATCH_HABITS,
    DayLog,
    Program,
    ProgramHabit,
    apply_patch,
    dose_for,
    repair,
    validate,
)


class LLM(Protocol):
    def complete(self, system: str, user: str) -> str: ...


# ---------------------------------------------------------------------------
# Architect — runs once per user, ever
# ---------------------------------------------------------------------------


def architect_system_prompt() -> str:
    """Built from the live catalog, so adding a habit never needs a prompt edit."""
    menu = "\n".join(
        f"  {h.id:<12} {h.name:<26} {h.domain:<12} "
        f"{h.start_dose:g}->{h.target_dose:g} {h.unit}, friction {h.friction}"
        for h in HABITS
    )
    return f"""Design a 66-day habit programme.

Choose {MIN_HABITS + 3}-{MAX_HABITS} habits from this catalog and nothing else:

{menu}

Rules:
- Order the list by importance. The last entries are what gets sacrificed if the
  programme turns out to be infeasible, so put the habit that matters most first.
- Assign each habit a start day between 1 and {LAST_INTRO_DAY}.
- At most 2 habits may start within any 7-day window.
- Early days must stay light. The user is not fit yet and has not built the habit.

Return ONLY JSON:
{{"habits": [{{"id": "walk", "start_day": 1}}, ...]}}
"""


def _json(raw: str) -> dict | None:
    raw = re.sub(r"^```(?:json)?|```$", "", (raw or "").strip(), flags=re.MULTILINE).strip()
    try:
        parsed = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def coerce_program(
    raw: Any, user_id: str, start_date: date, minutes_budget: int
) -> tuple[Program, list[str]]:
    """Whatever the model said -> a Program of known habits. Pure, no repair yet.

    Reports what it threw away rather than silently swallowing it; `meta`
    carrying `rejected` is how you find out a prompt has started drifting.
    """
    rejected: list[str] = []
    entries = (raw or {}).get("habits") if isinstance(raw, dict) else None
    if not isinstance(entries, list):
        return Program(user_id, start_date, minutes_budget, ()), ["no habit list in the response"]

    seen: set[str] = set()
    habits: list[ProgramHabit] = []
    for e in entries:
        if not isinstance(e, dict):
            rejected.append(f"{e!r} is not an object")
            continue
        hid = e.get("id")
        if not isinstance(hid, str) or not is_known(hid):
            rejected.append(f"unknown habit id {hid!r}")
            continue
        if hid in seen:
            rejected.append(f"duplicate {hid}")
            continue
        seen.add(hid)
        try:
            day = int(e.get("start_day", 1))
        except (TypeError, ValueError):
            day = 1
            rejected.append(f"{hid}: unreadable start_day, defaulted to 1")
        habits.append(ProgramHabit(habit_id=hid, start_day=day))
        if len(habits) >= MAX_HABITS:
            break

    return Program(user_id, start_date, minutes_budget, tuple(habits)), rejected


def fallback_program(user_id: str, start_date: date, minutes_budget: int) -> Program:
    """A working programme beats a spinner.

    Deliberately dull and low-friction: if the model failed, the user is already
    waiting, and this is the moment to be reliable rather than clever.
    """
    picks = ["walk", "water", "read", "stretch", "journal", "pushups"]
    habits = tuple(
        ProgramHabit(habit_id=h, start_day=1 + i * 7) for i, h in enumerate(picks)
    )
    prog, _ = repair(Program(user_id, start_date, minutes_budget, habits))
    return prog


def build_program(
    llm: LLM | None,
    intake: str,
    user_id: str,
    start_date: date,
    minutes_budget: int = 60,
) -> tuple[Program, dict]:
    """Runs once per user, ever. The one place a large model earns its price.

    @returns (program, meta) where meta.violations_remaining must be empty. If it
             is not, that is a bug in `repair`, not in the model, and
             `eval_harness` is where it gets caught.
    """
    meta: dict[str, Any] = {"source": "llm", "rejected": [], "repairs": []}

    raw = None
    if llm is not None:
        try:
            raw = _json(llm.complete(architect_system_prompt(), intake))
        except Exception as exc:  # a dead model must not be a dead onboarding
            meta["error"] = f"{type(exc).__name__}: {exc}"

    prog, rejected = coerce_program(raw, user_id, start_date, minutes_budget)
    meta["rejected"] = rejected

    if len(prog.habits) >= MIN_HABITS:
        prog, repairs = repair(prog)
        meta["repairs"] = repairs

    # Checked *after* repair as well as before it. Repair will strip a programme
    # below the habit floor rather than ship a day the user cannot physically
    # do, so a sub-floor result is the signal that these habits never fitted
    # this budget — at which point the cheap, dull fallback is the right answer.
    if len(prog.habits) < MIN_HABITS:
        meta["source"] = "fallback"
        meta["repairs"] = meta.get("repairs", []) + ["below the habit floor after repair"]
        prog = fallback_program(user_id, start_date, minutes_budget)

    meta["violations_remaining"] = [str(v) for v in validate(prog)]
    return prog, meta


# ---------------------------------------------------------------------------
# Adaptation — runs on a failure signal
# ---------------------------------------------------------------------------

TRAILING_DAYS = 14           # the window every rate below is measured over
INTERVENTION_RATE = 0.6      # below this across the window, step in
INTERVENTION_MISSES = 3      # or this many consecutive misses on one habit
PROTECTED_RATE = 0.7         # a habit doing this well is not the problem


def diagnose(program: Program, logs: DayLog, today: int) -> dict:
    """Per-habit completion, consecutive misses, and whether to step in at all.

    Pure code. Whether the user is struggling is arithmetic; only *what to
    sacrifice* is a judgement, and that is the only part a model is asked for.

    **Which days counted is read from the record, not re-derived.** This used to
    ask `d >= p.start_day` — the habit's *current* start day — so deferring a
    habit on day 30 retroactively decided that days 20 to 29 had never asked for
    it, and the user's completion rate moved for a fortnight they had already
    lived. A day that carries a record is answerable from that record alone; a
    day without one was never lived through this app and is not judged.
    """
    per: dict[str, dict] = {}
    # `today - TRAILING_DAYS` up to but not including today. Written as an
    # off-by-one before: `today - 13` is a 13-day window under a comment, a
    # constant and a spec that all said 14.
    window = range(max(1, today - TRAILING_DAYS), today)

    for p in program.habits:
        asked = [d for d in window if p.habit_id in logs.get(d, {})]
        done = [d for d in asked if logs[d][p.habit_id].done]
        missed_streak = 0
        for d in sorted(asked, reverse=True):
            if logs[d][p.habit_id].done:
                break
            missed_streak += 1
        per[p.habit_id] = {
            "asked": len(asked),
            "done": len(done),
            "rate": (len(done) / len(asked)) if asked else 1.0,
            "missed_streak": missed_streak,
        }

    scored = [v for v in per.values() if v["asked"]]
    overall = (sum(v["rate"] for v in scored) / len(scored)) if scored else 1.0
    needs = overall < INTERVENTION_RATE or any(
        v["missed_streak"] >= INTERVENTION_MISSES for v in per.values()
    )
    return {"per_habit": per, "overall_rate": overall, "needs_intervention": needs}


_ADAPT_SYSTEM = f"""A user is falling behind on their 66-day programme. Choose the
smallest sacrifice that keeps them going.

Operations, and nothing else:
  soften  — reduce the dose, keep the habit   {{"op":"soften","habit_id":"x","factor":0.5}}
  freeze  — stop the ramp where it is         {{"op":"freeze","habit_id":"x"}}
  defer   — push a not-yet-started habit back {{"op":"defer","habit_id":"x","days":7}}
  drop    — last resort, at most one          {{"op":"drop","habit_id":"x"}}

There is no rewrite and no reset. The day counter never restarts: this user has
earned every day they have done, and taking that away is why people quit.

Touch at most {MAX_PATCH_HABITS} habits. Leave alone anything they are already
doing well — the problem is elsewhere.

Return ONLY JSON: {{"ops": [ ... ]}}
"""


def adapt_program(
    llm: LLM | None,
    program: Program,
    diagnosis: dict,
    today: int,
) -> tuple[Program, dict]:
    """Choose a patch, enforce the rules in code, apply it.

    The prompt's rules are re-stated here as filters because a prompt is a
    request and this is a guarantee. Overcorrecting reads to the user as the app
    giving up on them, so the cap is enforced whatever the model returns.
    """
    meta: dict[str, Any] = {"source": "llm", "ignored": [], "notes": []}
    ops: list[dict] = []

    if llm is not None:
        payload = {
            "today": today,
            "budget_minutes": program.minutes_budget,
            "habits": [
                {
                    "id": p.habit_id,
                    "name": habit(p.habit_id).name,
                    "start_day": p.start_day,
                    "dose_today": dose_for(p, today),
                    "friction": habit(p.habit_id).friction,
                    **diagnosis["per_habit"].get(p.habit_id, {}),
                }
                for p in program.habits
            ],
        }
        try:
            parsed = _json(llm.complete(_ADAPT_SYSTEM, json.dumps(payload))) or {}
            if isinstance(parsed.get("ops"), list):
                ops = [o for o in parsed["ops"] if isinstance(o, dict)]
        except Exception as exc:
            meta["error"] = f"{type(exc).__name__}: {exc}"

    if not ops:
        # No usable answer: soften the worst offender. Doing nothing is also a
        # decision, and the wrong one when the user is already slipping.
        worst = min(
            program.habits,
            key=lambda p: diagnosis["per_habit"].get(p.habit_id, {}).get("rate", 1.0),
            default=None,
        )
        if worst is not None:
            ops = [{"op": "soften", "habit_id": worst.habit_id, "factor": 0.5}]
            meta["source"] = "fallback"

    # A habit they are keeping is not the problem. Strip it out of the patch.
    filtered: list[dict] = []
    for o in ops:
        hid = o.get("habit_id")
        rate = diagnosis["per_habit"].get(hid, {}).get("rate", 0.0)
        asked = diagnosis["per_habit"].get(hid, {}).get("asked", 0)
        if asked and rate >= PROTECTED_RATE:
            meta["ignored"].append(f"{o.get('op')} on {hid}: {rate:.0%} completion, left alone")
            continue
        filtered.append(o)

    drops = [o for o in filtered if o.get("op") == "drop"]
    if len(drops) > 1:
        for o in drops[1:]:
            filtered.remove(o)
            meta["ignored"].append(f"drop on {o.get('habit_id')}: one drop per patch")

    patched, notes = apply_patch(program, filtered, today=today)
    meta["notes"] = notes
    # Submitted, not applied. `apply_patch` still ignores an unknown op, a drop
    # at the habit floor and a defer on something already underway, so calling
    # this "applied" overstated it — a harness counting these reported 20
    # `obliterate` ops as having run.
    meta["ops_submitted"] = filtered
    meta["violations_remaining"] = [str(v) for v in validate(patched)]
    return patched, meta
