"""The stored shape of a run, decided before anything stores one.

This is the boundary an app writes across. It is not a database and does not
touch the filesystem: `to_dict`/`from_dict` are pure, `dumps`/`loads` add
nothing but `json`. Where the bytes go — a file, Postgres, iOS — belongs to the
caller, and keeping I/O out of here is what lets `eval_harness.py` round-trip
2,000 programmes without owning a disk. (`store.py` in `README.md` is a
different thing: a Postgres protocol for the daily graph, which does not exist.)

**Deciding this shape is the point, not the code.** Once 66-day runs exist on
real devices, every added field is a migration against programmes that must not
be re-judged, and the cost of a bad decision is paid by people 40 days into
something they earned. Four rules hold it together:

* **Nothing derived is stored.** Not the current day — that is `day_index` from
  `start_date` and the real date. Not doses, minutes, streaks or completion
  rates — those are `dose_for` and `diagnose` reading the catalog. A stored
  derived value is a value that will disagree with the thing that derives it,
  and the disagreement surfaces on whichever day nobody tested.
* **The version leads, and a newer save is refused.** Silently dropping fields a
  newer build wrote is exactly the re-judging this file exists to prevent, so
  reading stops and says so instead.
* **Loading is faithful. `validate` judges, `repair` fixes.** Three steps, never
  fused. A load that quietly clamped a start day would change what a lived day
  meant without anyone asking for it.
* **Catalog drift drops; corruption raises.** A habit id this build has never
  heard of is the one thing that legitimately changes between releases — it is
  dropped with a note, because refusing to open the file would cost the user the
  whole run over one habit. Anything else malformed is corruption in bytes this
  library itself wrote, and guessing at it manufactures a plausible programme
  that is not theirs.

Adding schema version 2: bump `SCHEMA_VERSION`, and give `from_dict` a branch
that upgrades a v1 dict before it is read. That branch must be additive — it may
fill in a new field with a default, and may never drop or reinterpret one.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable, Mapping

from .catalog import PROGRAM_DAYS, is_known
from .program import Program, ProgramHabit

SCHEMA_VERSION = 1

# Exactly what a save carries, and the guard against a derived value creeping
# in. `tests.py` asserts the written keys are these and nothing else, so adding
# one is a deliberate act with a schema bump attached rather than a field that
# appeared because it was convenient at the call site.
TOP_LEVEL_KEYS = ("version", "user_id", "start_date", "minutes_budget", "habits", "logs")
HABIT_KEYS = ("habit_id", "start_day", "scale", "frozen_day")


class StateError(ValueError):
    """These bytes are not a Life Reset save, or are one this build cannot read."""


@dataclass(frozen=True)
class Loaded:
    """A save, read back.

    `notes` is never decoration. It is how the caller finds out that the
    programme it just loaded is not the programme that was written — a habit
    this build's catalog no longer has, a log dated outside the run. Empty is
    the normal case; non-empty deserves a look before the run continues, and
    possibly a `repair`.
    """

    program: Program
    logs: dict[int, set[str]]
    notes: tuple[str, ...] = ()


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------


def to_dict(program: Program, logs: Mapping[int, Iterable[str]] | None = None) -> dict:
    """A save, as plain JSON-able data. Deterministic: same run, same bytes.

    Habit order is preserved rather than sorted — `program_day` renders in the
    order the habits were chosen, so the order is data. Log ids *are* sorted,
    because they come from a `set` and would otherwise make the same state
    serialise two different ways, which breaks content hashing and makes every
    sync look like a change.
    """
    out: dict[str, Any] = {
        "version": SCHEMA_VERSION,
        "user_id": program.user_id,
        "start_date": program.start_date.isoformat(),
        "minutes_budget": int(program.minutes_budget),
        "habits": [
            {
                "habit_id": p.habit_id,
                "start_day": int(p.start_day),
                "scale": float(p.scale),
                "frozen_day": None if p.frozen_day is None else int(p.frozen_day),
            }
            for p in program.habits
        ],
    }
    if logs is not None:
        out["logs"] = {str(day): sorted(ids) for day, ids in sorted(logs.items())}
    return out


def dumps(program: Program, logs: Mapping[int, Iterable[str]] | None = None,
          *, indent: int | None = None) -> str:
    """`allow_nan=False` on purpose. Python's json writes bare `NaN` and
    `Infinity` by default, which is not JSON, and a scale of NaN would load back
    as a habit whose dose comparisons are all false — silently, on every day."""
    return json.dumps(to_dict(program, logs), indent=indent, allow_nan=False)


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------


def _finite(value: Any) -> float | None:
    """A real number, and not a bool. `isinstance(True, int)` is True in Python,
    which is how `"minutes_budget": true` becomes a 1-minute budget."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


def _whole(value: Any) -> int | None:
    n = _finite(value)
    if n is None or n != int(n):
        return None
    return int(n)


def from_dict(raw: Any) -> Loaded:
    """Read a save. @raises StateError on anything this build cannot honour."""
    if not isinstance(raw, dict):
        raise StateError("not a Life Reset save: the top level is not an object")

    version = raw.get("version")
    if not isinstance(version, int) or isinstance(version, bool):
        raise StateError("not a Life Reset save: no schema version")
    if version > SCHEMA_VERSION:
        raise StateError(
            f"this save was written by a newer build (schema {version}; this one reads "
            f"{SCHEMA_VERSION}). Update before opening it — reading it here would drop "
            "whatever the newer build added, on a run that is already underway."
        )
    if version < SCHEMA_VERSION:
        # No older schema has ever shipped, so this is corruption rather than
        # history. When v2 arrives, the upgrade branch goes here.
        raise StateError(f"unknown schema version {version}")

    user_id = raw.get("user_id")
    if not isinstance(user_id, str) or not user_id:
        raise StateError("not a Life Reset save: no user_id")

    start_raw = raw.get("start_date")
    if not isinstance(start_raw, str):
        raise StateError("not a Life Reset save: no start_date")
    try:
        start_date = date.fromisoformat(start_raw)
    except ValueError as exc:
        raise StateError(f"unreadable start_date {start_raw!r}: {exc}") from exc

    budget = _whole(raw.get("minutes_budget"))
    if budget is None or budget <= 0:
        raise StateError(f"unreadable minutes_budget {raw.get('minutes_budget')!r}")

    entries = raw.get("habits")
    if not isinstance(entries, list):
        raise StateError("not a Life Reset save: no habit list")

    notes: list[str] = []
    habits: list[ProgramHabit] = []
    seen: set[str] = set()
    for i, e in enumerate(entries):
        if not isinstance(e, dict):
            raise StateError(f"habit {i} is not an object")
        hid = e.get("habit_id")
        if not isinstance(hid, str) or not hid:
            raise StateError(f"habit {i} has no habit_id")

        # The one forgiving branch, and the reason it is forgiving: a habit
        # retired from the catalog must cost the user that habit, not the run.
        if not is_known(hid):
            notes.append(f"dropped {hid!r}: this build's catalog does not have it")
            continue
        if hid in seen:
            notes.append(f"dropped a second copy of {hid}")
            continue
        seen.add(hid)

        start_day = _whole(e.get("start_day"))
        if start_day is None:
            raise StateError(f"{hid}: unreadable start_day {e.get('start_day')!r}")
        scale = _finite(e.get("scale", 1.0))
        if scale is None:
            raise StateError(f"{hid}: unreadable scale {e.get('scale')!r}")
        frozen = e.get("frozen_day")
        if frozen is not None:
            frozen = _whole(frozen)
            if frozen is None:
                raise StateError(f"{hid}: unreadable frozen_day {e.get('frozen_day')!r}")
        # Not clamped, not repaired. An out-of-range start day is `validate`'s
        # to report and the caller's to decide about.
        habits.append(ProgramHabit(habit_id=hid, start_day=start_day, scale=scale,
                                   frozen_day=frozen))

    logs: dict[int, set[str]] = {}
    raw_logs = raw.get("logs")
    if raw_logs is not None:
        if not isinstance(raw_logs, dict):
            raise StateError("logs is not an object")
        for key, done in raw_logs.items():
            try:
                day = int(key)
            except (TypeError, ValueError) as exc:
                raise StateError(f"log key {key!r} is not a day number") from exc
            if not isinstance(done, list) or not all(isinstance(x, str) for x in done):
                raise StateError(f"log for day {day} is not a list of habit ids")
            if not 1 <= day <= PROGRAM_DAYS:
                notes.append(f"log for day {day} is outside the {PROGRAM_DAYS}-day run")
            # Ids unknown to the catalog are kept here deliberately. A log is a
            # record of something the user actually did; dropping it because the
            # catalog moved would rewrite their history to match our build.
            logs[day] = set(done)

    program = Program(user_id=user_id, start_date=start_date, minutes_budget=budget,
                      habits=tuple(habits))
    return Loaded(program=program, logs=logs, notes=tuple(notes))


def loads(text: str) -> Loaded:
    try:
        raw = json.loads(text)
    except (json.JSONDecodeError, TypeError) as exc:
        raise StateError(f"not readable as JSON, so it is not a Life Reset save: {exc}") from exc
    return from_dict(raw)
