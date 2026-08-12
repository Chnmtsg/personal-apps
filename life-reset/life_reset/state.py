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
* **A lived day is a record, not a recomputation.** `logs` stores every habit a
  day asked, what it asked for, and whether it happened — see `DayEntry`. That
  is the one place the first rule is deliberately inverted, and the reason is
  that `dose_for` answers from the habit's *current* state: soften on day 30 and
  it will tell you day 12 asked for less than it did. Fine for a prescription,
  false for a record. Writing the ask down at the time is also what let
  `ProgramHabit` stay a plain four-field row instead of growing a list of dated
  adjustments — nothing asks `dose_for` about the past once the past is written
  down.

Adding a schema version: bump `SCHEMA_VERSION` and give `_upgrade` a branch.
Additive only — an upgrade may fill a new field with a default and may never
drop or reinterpret one, because the run it is touching is one somebody is
partway through. `_upgrade` carries 1 -> 2 as the worked example, including the
part that matters most: what it does with a value the old schema never recorded
and this one cannot honestly reconstruct.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import date
from typing import Any

from .catalog import PROGRAM_DAYS, is_known
from .program import DayEntry, DayLog, Program, ProgramHabit

SCHEMA_VERSION = 2

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
    logs: DayLog
    notes: tuple[str, ...] = ()


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------


def to_dict(program: Program, logs: DayLog | None = None) -> dict:
    """A save, as plain JSON-able data. Deterministic: same run, same bytes.

    Habit order is preserved rather than sorted — `program_day` renders in the
    order the habits were chosen, so the order is data. Days and the habits
    inside them *are* sorted, because they come from dicts built in whatever
    order the app happened to record them; without it the same state serialises
    two different ways, which breaks content hashing and makes every sync look
    like a change.
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
        out["logs"] = {
            str(day): {
                hid: {"asked": entry.asked, "done": bool(entry.done)}
                for hid, entry in sorted(entries.items())
            }
            for day, entries in sorted(logs.items())
        }
    return out


def dumps(program: Program, logs: DayLog | None = None,
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


def _upgrade(raw: dict, version: int) -> tuple[dict, list[str]]:
    """Bring an older save up to `SCHEMA_VERSION`. Additive only.

    An upgrade may fill a new field with a default and may never drop or
    reinterpret an existing one — the programme it is touching is one somebody
    is partway through.

    **1 -> 2: the day record.** Schema 1 stored a day as a list of habit ids and
    meant "these were done". It had nowhere to put what a day *asked*, and
    nowhere to put a habit that was asked and missed. Neither can be recovered:
    the ask is `dose_for` on the programme as it stood that day, and softening
    since then has moved it — recomputing it now is precisely the re-judging the
    record exists to prevent. So what is known is kept (`done`), and what was
    never written down stays unknown (`asked=None`) rather than being invented.
    A missed day in a schema-1 save is simply absent, and stays absent.
    """
    notes: list[str] = []
    if version < 2:
        raw = dict(raw)
        old = raw.get("logs")
        if isinstance(old, dict) and old:
            raw["logs"] = {
                day: {hid: {"asked": None, "done": True} for hid in ids}
                for day, ids in old.items()
                if isinstance(ids, list)
            }
            notes.append(
                f"upgraded {len(raw['logs'])} day(s) from schema 1: they record what was "
                "done but not what was asked, and that number is not recoverable"
            )
        raw["version"] = 2
    return raw, notes


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
    if version < 1:
        raise StateError(f"unknown schema version {version}")
    if version < SCHEMA_VERSION:
        raw, upgrade_notes = _upgrade(raw, version)
    else:
        upgrade_notes = []

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

    logs: DayLog = {}
    raw_logs = raw.get("logs")
    if raw_logs is not None:
        if not isinstance(raw_logs, dict):
            raise StateError("logs is not an object")
        for key, entries in raw_logs.items():
            try:
                day = int(key)
            except (TypeError, ValueError) as exc:
                raise StateError(f"log key {key!r} is not a day number") from exc
            if not isinstance(entries, dict):
                raise StateError(f"the record for day {day} is not an object")
            if not 1 <= day <= PROGRAM_DAYS:
                notes.append(f"a record for day {day} is outside the {PROGRAM_DAYS}-day run")
            # Ids unknown to the catalog are kept here deliberately, and this is
            # the opposite call to the one made for the programme above. A
            # record is what the user actually did; dropping it because the
            # catalog moved would rewrite their history to match our build.
            day_log: dict[str, DayEntry] = {}
            for hid, entry in entries.items():
                if not isinstance(hid, str) or not isinstance(entry, dict):
                    raise StateError(f"day {day}: {hid!r} is not a habit record")
                asked = entry.get("asked")
                if asked is not None:
                    asked = _finite(asked)
                    if asked is None:
                        raise StateError(f"day {day}, {hid}: unreadable asked {entry.get('asked')!r}")
                if not isinstance(entry.get("done"), bool):
                    raise StateError(f"day {day}, {hid}: done is not a boolean")
                day_log[hid] = DayEntry(asked=asked, done=entry["done"])
            logs[day] = day_log

    program = Program(user_id=user_id, start_date=start_date, minutes_budget=budget,
                      habits=tuple(habits))
    return Loaded(program=program, logs=logs, notes=tuple(upgrade_notes + notes))


def loads(text: str) -> Loaded:
    try:
        raw = json.loads(text)
    except (json.JSONDecodeError, TypeError) as exc:
        raise StateError(f"not readable as JSON, so it is not a Life Reset save: {exc}") from exc
    return from_dict(raw)
