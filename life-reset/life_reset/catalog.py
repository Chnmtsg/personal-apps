"""Closed lists. Nothing here is generated, and nothing outside this file may
invent a member of one.

The determinism boundary starts here: a model may *choose from* these lists and
may never add to them. Every id an agent returns is checked against this module
before it reaches a program, which is why an invented habit is a dropped habit
rather than a runtime error on day 41.

Adding a habit needs no prompt edit — `architect_system_prompt()` builds its
menu from `HABITS` at call time.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Domain = Literal["fitness", "self_care", "development"]


@dataclass(frozen=True)
class Habit:
    """One thing the user does daily, and the shape of its ramp.

    `friction` is how hard this is to keep going, 1 (trivial) to 5 (brutal). It
    is the sacrifice order for `repair`: when something has to give, the newest
    high-friction habit goes before an established easy one. It is a property of
    the habit, not of the user, so it stays in the catalog.
    """

    id: str
    name: str
    domain: Domain
    unit: str
    start_dose: float
    target_dose: float
    step: float                 # added per week, in `unit`
    minutes_per_unit: float     # the cost model: dose -> minutes
    friction: int               # 1..5

    def __post_init__(self) -> None:
        if self.step <= 0:
            raise ValueError(f"{self.id}: step must be positive")
        if self.target_dose < self.start_dose:
            raise ValueError(f"{self.id}: target below start")
        if not 1 <= self.friction <= 5:
            raise ValueError(f"{self.id}: friction out of range")


HABITS: tuple[Habit, ...] = (
    # --- fitness -----------------------------------------------------------
    Habit("walk", "Walk", "fitness", "min", 10, 45, 5, 1.0, 1),
    Habit("pushups", "Push-ups", "fitness", "reps", 5, 40, 5, 0.12, 2),
    Habit("squats", "Body-weight squats", "fitness", "reps", 10, 60, 5, 0.10, 2),
    Habit("plank", "Plank", "fitness", "sec", 20, 120, 10, 0.02, 2),
    Habit("run", "Easy run", "fitness", "min", 10, 40, 5, 1.0, 4),
    Habit("mobility", "Mobility flow", "fitness", "min", 5, 20, 2.5, 1.0, 2),
    Habit("strength", "Strength session", "fitness", "min", 15, 45, 5, 1.0, 5),
    # --- self-care ---------------------------------------------------------
    Habit("water", "Drink water", "self_care", "glasses", 2, 8, 1, 0.5, 1),
    Habit("sleep_window", "Fixed lights-out", "self_care", "min", 15, 45, 5, 0.2, 3),
    Habit("stretch", "Evening stretch", "self_care", "min", 5, 20, 2.5, 1.0, 1),
    Habit("meditate", "Meditate", "self_care", "min", 3, 20, 2, 1.0, 3),
    Habit("sunlight", "Morning daylight", "self_care", "min", 5, 20, 2.5, 1.0, 2),
    Habit("cold_shower", "Cold finish", "self_care", "sec", 15, 120, 15, 0.02, 4),
    Habit("no_screens", "Screens off before bed", "self_care", "min", 15, 60, 5, 0.1, 4),
    # --- development -------------------------------------------------------
    Habit("read", "Read", "development", "min", 10, 45, 5, 1.0, 2),
    Habit("deep_work", "Deep work block", "development", "min", 25, 90, 10, 1.0, 5),
    Habit("journal", "Journal", "development", "min", 5, 15, 2.5, 1.0, 1),
    Habit("language", "Language practice", "development", "min", 10, 30, 5, 1.0, 3),
    Habit("course", "Course / study", "development", "min", 15, 60, 5, 1.0, 4),
    Habit("write", "Write", "development", "min", 10, 40, 5, 1.0, 4),
)

HABITS_BY_ID: dict[str, Habit] = {h.id: h for h in HABITS}


def habit(habit_id: str) -> Habit:
    """@raises KeyError deliberately — an unknown id must never reach a program."""
    return HABITS_BY_ID[habit_id]


def is_known(habit_id: str) -> bool:
    return habit_id in HABITS_BY_ID


# ---------------------------------------------------------------------------
# Phases
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Phase:
    """A stretch of the 66 days, and the most habits allowed to be live in it.

    The cap is the point: a program that ends up asking for nine things on day 5
    is the one people quit in week one.
    """

    name: str
    first_day: int
    last_day: int
    max_habits: int


PHASES: tuple[Phase, ...] = (
    Phase("foundation", 1, 21, 4),
    Phase("build", 22, 45, 7),
    Phase("consolidate", 46, 66, 9),
)

PROGRAM_DAYS = 66
LAST_INTRO_DAY = 56          # nothing new may start after this
MAX_NEW_PER_WEEK = 2         # in any rolling 7-day window
MIN_HABITS = 3
MAX_HABITS = PHASES[-1].max_habits


def phase_for(day: int) -> Phase:
    for p in PHASES:
        if p.first_day <= day <= p.last_day:
            return p
    raise ValueError(f"day {day} is outside the {PROGRAM_DAYS}-day program")
