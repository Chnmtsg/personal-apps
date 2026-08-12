"""Life Reset — the deterministic core of a 66-day self-improvement programme.

Import order matters only in that `catalog` owns the closed lists and everything
else reads them. Nothing in this package touches the network or the clock.
"""

from .catalog import HABITS, PHASES, PROGRAM_DAYS, Habit, Phase, habit, is_known, phase_for
from .program import (
    Program,
    ProgramHabit,
    Violation,
    apply_patch,
    day_index,
    day_minutes,
    dose_for,
    minutes_for,
    program_day,
    render_program_day,
    repair,
    validate,
)
from .recommend import Recommendation, apply_recommendation, recommend
from .state import SCHEMA_VERSION, Loaded, StateError, dumps, from_dict, loads, to_dict

__all__ = [
    "HABITS", "PHASES", "PROGRAM_DAYS", "Habit", "Phase", "habit", "is_known", "phase_for",
    "Program", "ProgramHabit", "Violation", "apply_patch", "day_index", "day_minutes",
    "dose_for", "minutes_for", "program_day", "render_program_day", "repair", "validate",
    "Recommendation", "apply_recommendation", "recommend",
    "SCHEMA_VERSION", "Loaded", "StateError", "dumps", "loads", "to_dict", "from_dict",
]
