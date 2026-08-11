"""Runs the factory offline with a scripted agent, so every gate result is real.

The scripted agent deliberately fails the first attempt on one task and fails a
second task permanently — that exercises the retry loop, the escalation path, and
the blocked-task report, which is where these pipelines actually break.

    python demo_factory.py
    python demo_factory.py --live   # real model, ANTHROPIC_API_KEY
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

from factory import build_factory
from life_reset.nodes import AnthropicLLM

IDEA = "A streak tracker: record daily completions and report the current streak."


class ScriptedLLM:
    """Stands in for a coding agent. Attempt 1 on t2 has an off-by-one."""

    def __init__(self):
        self.calls: dict[str, int] = {}

    def complete(self, system: str, user: str) -> str:
        key = system.split("\n", 1)[0][:24]
        self.calls[key] = self.calls.get(key, 0) + 1

        if system.startswith("Turn a product idea"):
            return json.dumps({"goal": IDEA, "criteria": [
                {"id": "c1", "desc": "records completions", "check": "python -m pytest tests/test_store.py -q"},
                {"id": "c2", "desc": "computes current streak", "check": "python -m pytest tests/test_streak.py -q"},
                {"id": "c3", "desc": "exports to CSV", "check": "python -m pytest tests/test_export.py -q"},
                {"id": "c4", "desc": "feels motivating", "check": ""}]})

        if system.startswith("Break the specification"):
            return json.dumps({"tasks": [
                {"id": "t1", "goal": "store completions", "check": "python -m pytest tests/test_store.py -q",
                 "files": ["tracker/store.py"]},
                {"id": "t2", "goal": "streak calculation", "check": "python -m pytest tests/test_streak.py -q",
                 "files": ["tracker/streak.py"]},
                {"id": "t3", "goal": "csv export", "check": "python -m pytest tests/test_export.py -q",
                 "files": ["tracker/export.py"]}]})

        if system.startswith("Write the code"):
            payload = json.loads(user)
            tid = payload["task"]["id"]
            n = self.calls.get(key, 0)
            if tid == "t1":
                return json.dumps({"files": {"tracker/store.py":
                    "def add(days, day):\n"
                    "    return sorted(set(days) | {day})\n"}})
            if tid == "t2":
                if not payload["previous_error"]:
                    return json.dumps({"files": {"tracker/streak.py":   # off-by-one
                        "def streak(days, today):\n"
                        "    n = 0\n"
                        "    while today - n in days:\n"
                        "        n += 1\n"
                        "    return n + 1\n"}})
                return json.dumps({"files": {"tracker/streak.py":
                    "def streak(days, today):\n"
                    "    n = 0\n"
                    "    while today - n in days:\n"
                    "        n += 1\n"
                    "    return n\n"}})
            if tid == "t3":                                             # never passes
                return json.dumps({"files": {"tracker/export.py":
                    "def to_csv(days):\n"
                    "    return ','.join(days)\n"}})
            return "{}"

        if system.startswith("Review a finished"):
            return ("tracker/streak.py takes a bare integer for 'today', so a caller can\n"
                    "silently pass a date and get 0. The checks pass because the tests use\n"
                    "ints too. Worth typing before the next feature builds on it.")
        return ""


def scaffold(ws: Path) -> None:
    (ws / "tracker").mkdir(parents=True)
    (ws / "tracker" / "__init__.py").write_text("")
    (ws / "tests").mkdir()
    (ws / "tests" / "test_store.py").write_text(
        "from tracker.store import add\n"
        "def test_add():\n"
        "    assert add([1, 2], 3) == [1, 2, 3]\n"
        "    assert add([1, 2], 2) == [1, 2]\n")
    (ws / "tests" / "test_streak.py").write_text(
        "from tracker.streak import streak\n"
        "def test_streak():\n"
        "    assert streak({5, 4, 3}, 5) == 3\n"
        "    assert streak(set(), 5) == 0\n")
    (ws / "tests" / "test_export.py").write_text(
        "from tracker.export import to_csv\n"
        "def test_export():\n"
        "    assert to_csv([1, 2, 3]) == '1,2,3'\n")


def main() -> None:
    ws = Path(tempfile.mkdtemp(prefix="factory_"))
    scaffold(ws)
    llm = AnthropicLLM() if "--live" in sys.argv else ScriptedLLM()
    app = build_factory(llm, full_suite="python -m pytest -q")

    out = app.invoke({"idea": IDEA, "workspace": str(ws)},
                     {"recursion_limit": 60})

    print("=" * 70)
    print("PIPELINE TRACE")
    print("=" * 70)
    for e in out["events"]:
        print(" ", e)

    print("\n" + "=" * 70)
    print("TASK OUTCOMES")
    print("=" * 70)
    for t in out["tasks"]:
        print(f"  {t['id']:<4} {t['status']:<8} {t['goal']}")

    print("\n" + "=" * 70)
    print("CRITIC — judgment the gate cannot produce")
    print("=" * 70)
    print(out.get("critique") or "(none)")
    shutil.rmtree(ws)


if __name__ == "__main__":
    main()
