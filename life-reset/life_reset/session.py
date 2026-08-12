"""The loop an app actually runs, and the two decisions it must not get wrong.

Everything below this module is a pure function you can call in any order. That
is right for a library and wrong for a caller, because two things about the
order are load-bearing and were only ever written down in comments:

* **A run ends.** `day_index` counts honestly past 66 and every other function
  keeps answering — `render_program_day` will happily print "Day 80 of 66" and
  prescribe a full day's work. Nothing owned the fact that the programme is
  over, so every app would have had to notice for itself, and the one that
  forgot would keep a user running forever.
* **Stepping in and offering more are mutually exclusive.** `adapt_program`
  fires when someone is missing days; `recommend` offers extra work when they
  are not. Firing both on the same day tells a person who is drowning that they
  are ready for a sixth habit. `recommend` refuses `add` while
  `needs_intervention` is true, but that is one half of a rule enforced in one
  place, and the sequencing still lived in whoever called them.

This module owns both, and nothing else. It holds no state, adds no I/O, and
deliberately does not wrap `build_program`, `record_day`, `program_day` or
`dumps` — re-exporting a function under a second name is not an API, it is a
second name. Call those directly; the whole cycle is in `README.md`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from .agents import LLM, adapt_program, diagnose  # noqa: F401  (LLM is re-exported)
from .catalog import PROGRAM_DAYS
from .program import DayLog, Program, day_index
from .recommend import Recommendation, recommend

State = Literal["not_started", "running", "finished"]


@dataclass(frozen=True)
class RunStatus:
    """Where a user is, on a given calendar date.

    `day` is the honest day number and is deliberately not clamped: it is
    negative before the run and greater than `PROGRAM_DAYS` after it. Clamping
    would make day 80 indistinguishable from day 66, which is the difference
    between "you have finished" and "you have one left".
    """

    day: int
    state: State

    @property
    def running(self) -> bool:
        return self.state == "running"

    @property
    def days_over(self) -> int:
        """How far past the end, or 0 while there is still a run to do."""
        return max(0, self.day - PROGRAM_DAYS)


def where(program: Program, on: date) -> RunStatus:
    """The one call an app should make before any other, every time it opens."""
    day = day_index(program.start_date, on)
    if day < 1:
        return RunStatus(day=day, state="not_started")
    if day > PROGRAM_DAYS:
        return RunStatus(day=day, state="finished")
    return RunStatus(day=day, state="running")


@dataclass(frozen=True)
class CheckIn:
    """The result of asking "how is this going, and what now?".

    `patched` and `recommendations` are mutually exclusive by construction, and
    that is the point of the type. A day that needed stepping in offers nothing
    extra; a day that did not is free to.
    """

    diagnosis: dict
    program: Program
    patched: bool = False
    notes: tuple[str, ...] = ()
    recommendations: tuple[Recommendation, ...] = ()


def check_in(
    program: Program,
    logs: DayLog,
    today: int,
    llm: LLM | None = None,
) -> CheckIn:
    """Diagnose, then do exactly one of: step in, or offer more. Never both.

    Call it once a day, or whenever the app opens. It returns a programme —
    patched if it needed patching, unchanged otherwise — so the caller stores
    the result either way and never has to work out which happened.

    Outside the run there is nothing to decide. Adapting a finished programme
    would soften a run the user has already completed, and recommending on it
    would offer a habit starting on a day that will never arrive.
    """
    if not 1 <= today <= PROGRAM_DAYS:
        return CheckIn(diagnosis={"per_habit": {}, "overall_rate": 1.0,
                                  "needs_intervention": False},
                       program=program)

    diagnosis = diagnose(program, logs, today)

    if diagnosis["needs_intervention"]:
        patched, meta = adapt_program(llm, program, diagnosis, today)
        return CheckIn(
            diagnosis=diagnosis,
            program=patched,
            patched=True,
            notes=tuple(meta.get("notes", ())),
        )

    return CheckIn(
        diagnosis=diagnosis,
        program=program,
        recommendations=tuple(recommend(program, logs, today)),
    )
