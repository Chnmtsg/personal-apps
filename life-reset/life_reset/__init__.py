"""Life Reset — the deterministic core of a 66-day self-improvement programme.

Import order matters only in that `catalog` owns the closed lists and everything
else reads them. Nothing in this package touches the network or the clock.
"""

from .catalog import HABITS, PHASES, PROGRAM_DAYS, Habit, Phase, habit, is_known, phase_for
from .program import (
    DayEntry,
    DayLog,
    Program,
    ProgramHabit,
    Violation,
    apply_patch,
    day_index,
    day_minutes,
    dose_for,
    minutes_for,
    program_day,
    record_day,
    render_program_day,
    repair,
    validate,
)
# `agents` is safe to re-export: nothing in it is third-party. `nodes.py` is the
# only file that imports `anthropic`, and `agents` does not import `nodes`.
from .agents import adapt_program, architect_system_prompt, build_program, diagnose
from .recommend import Recommendation, apply_recommendation, recommend
from .session import CheckIn, RunStatus, check_in, where
from .state import SCHEMA_VERSION, Loaded, StateError, dumps, from_dict, loads, to_dict

__all__ = [
    "HABITS", "PHASES", "PROGRAM_DAYS", "Habit", "Phase", "habit", "is_known", "phase_for",
    "Program", "ProgramHabit", "Violation", "apply_patch", "day_index", "day_minutes",
    "dose_for", "minutes_for", "program_day", "render_program_day", "repair", "validate",
    "DayEntry", "DayLog", "record_day",
    "adapt_program", "architect_system_prompt", "build_program", "diagnose",
    "Recommendation", "apply_recommendation", "recommend",
    "CheckIn", "RunStatus", "check_in", "where",
    "SCHEMA_VERSION", "Loaded", "StateError", "dumps", "loads", "to_dict", "from_dict",
]
