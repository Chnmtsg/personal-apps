"""A build pipeline for turning an idea into working code.

The structural choice: nodes are split by *verifiable artifact*, not by job title.
There is no "reviewer" node that reads code and forms an opinion. There is a
`gate` node that runs the check and reads the exit code.

    idea → spec → plan → ┌─ implement → gate ─┐ → critic → integrate
                         └────── fail ────────┘
                                    │
                              N failures → escalate → plan

Three rules the shape enforces:

1. Every task carries a runnable acceptance check. If you cannot write one, the
   task is underspecified — that is a signal to go back to spec, not to proceed
   and hope the reviewer catches it.
2. The implementer holds the tools. Review without execution is vibes.
3. Agents share a workspace, not a message history. Each one reads the repo as
   it actually is, so nothing is lost in summary at the handoff.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Annotated, Any, Literal, TypedDict
import operator

from langgraph.graph import END, START, StateGraph

MAX_ATTEMPTS = 3


class Task(TypedDict, total=False):
    id: str
    goal: str
    check: str              # shell command; exit 0 == done
    files: list[str]
    status: Literal["pending", "passed", "blocked"]


class BuildState(TypedDict, total=False):
    idea: str
    workspace: str
    spec: dict[str, Any]
    tasks: list[Task]
    cursor: int
    attempts: dict[str, int]
    last_error: str
    critique: str
    events: Annotated[list[str], operator.add]
    replans: int


# --------------------------------------------------------------------------
# spec — turns an idea into criteria that can be checked
# --------------------------------------------------------------------------

_SPEC_SYSTEM = """Turn a product idea into acceptance criteria.

Every criterion must be checkable by running a command. If you cannot write a
command that verifies it, the criterion is too vague — rewrite it until you can.

Return ONLY JSON:
{"goal": "one sentence",
 "criteria": [{"id": "c1", "desc": "...", "check": "pytest tests/test_x.py -q"}]}
"""


def make_spec(llm):
    def spec(state: BuildState) -> dict:
        raw = llm.complete(_SPEC_SYSTEM, state["idea"])
        parsed = _json(raw) or {}
        criteria = [c for c in parsed.get("criteria", []) if c.get("check")]
        dropped = len(parsed.get("criteria", [])) - len(criteria)
        ev = [f"spec: {len(criteria)} checkable criteria"]
        if dropped:
            ev.append(f"spec: dropped {dropped} criteria with no runnable check")
        return {"spec": {"goal": parsed.get("goal", state["idea"]), "criteria": criteria},
                "events": ev}

    return spec


# --------------------------------------------------------------------------
# plan — criteria to an ordered task list
# --------------------------------------------------------------------------

_PLAN_SYSTEM = """Break the specification into implementation tasks.

Each task owns exactly one acceptance criterion and names the files it will touch.
Order them so that a task never depends on a later one.

Return ONLY JSON:
{"tasks": [{"id": "t1", "goal": "...", "check": "<copy the criterion's check>",
            "files": ["src/foo.py"]}]}
"""


def make_plan(llm):
    def plan(state: BuildState) -> dict:
        blocked = [t for t in state.get("tasks", []) if t.get("status") == "blocked"]
        payload = {"spec": state["spec"], "blocked_last_time": blocked}
        parsed = _json(llm.complete(_PLAN_SYSTEM, json.dumps(payload))) or {}

        tasks: list[Task] = []
        for t in parsed.get("tasks", []):
            if not t.get("check"):
                continue
            tasks.append(Task(id=t.get("id", f"t{len(tasks) + 1}"), goal=t.get("goal", ""),
                              check=t["check"], files=t.get("files", []), status="pending"))
        return {"tasks": tasks, "cursor": 0, "attempts": {},
                "events": [f"plan: {len(tasks)} tasks"]}

    return plan


# --------------------------------------------------------------------------
# implement — the only node that writes files
# --------------------------------------------------------------------------

_IMPL_SYSTEM = """Write the code for one task.

You get the task, the current contents of its files, and — if a previous attempt
failed — the exact error output. Fix what the error says is wrong. Do not
restructure code the error did not complain about.

Return ONLY JSON: {"files": {"path/to/file.py": "<full file contents>"}}
"""


def make_implement(llm):
    def implement(state: BuildState) -> dict:
        ws = Path(state["workspace"])
        task = state["tasks"][state["cursor"]]

        current = {}
        for f in task.get("files", []):
            p = ws / f
            current[f] = p.read_text() if p.exists() else ""

        payload = {"task": task, "current_files": current,
                   "previous_error": state.get("last_error", "")}
        parsed = _json(llm.complete(_IMPL_SYSTEM, json.dumps(payload))) or {}

        written = []
        for rel, content in (parsed.get("files") or {}).items():
            # Containment: an agent must not write outside the workspace.
            target = (ws / rel).resolve()
            if not str(target).startswith(str(ws.resolve())):
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
            written.append(rel)

        n = state.get("attempts", {}).get(task["id"], 0) + 1
        return {"attempts": {**state.get("attempts", {}), task["id"]: n},
                "events": [f"implement: {task['id']} attempt {n} wrote {written or 'nothing'}"]}

    return implement


# --------------------------------------------------------------------------
# gate — the node that decides. No model involved.
# --------------------------------------------------------------------------

def gate(state: BuildState) -> dict:
    task = state["tasks"][state["cursor"]]
    try:
        r = subprocess.run(task["check"], shell=True, cwd=state["workspace"],
                           capture_output=True, text=True, timeout=120)
        ok, out = r.returncode == 0, (r.stdout + r.stderr)[-2000:]
    except subprocess.TimeoutExpired:
        ok, out = False, "check timed out after 120s"

    tasks = [dict(t) for t in state["tasks"]]
    if ok:
        tasks[state["cursor"]]["status"] = "passed"
        return {"tasks": tasks, "last_error": "",
                "events": [f"gate: {task['id']} PASS"]}

    attempts = state.get("attempts", {}).get(task["id"], 0)
    if attempts >= MAX_ATTEMPTS:
        tasks[state["cursor"]]["status"] = "blocked"
        return {"tasks": tasks, "last_error": out,
                "events": [f"gate: {task['id']} BLOCKED after {attempts} attempts"]}
    return {"last_error": out,
            "events": [f"gate: {task['id']} fail ({attempts}/{MAX_ATTEMPTS})"]}


def _route_gate(state: BuildState) -> str:
    task = state["tasks"][state["cursor"]]
    if task["status"] == "blocked":
        # Three failed attempts is evidence the task was wrong, not the code.
        return "escalate" if state.get("replans", 0) < 2 else "critic"
    if task["status"] == "passed":
        return "critic" if state["cursor"] + 1 >= len(state["tasks"]) else "advance"
    return "implement"


def advance(state: BuildState) -> dict:
    return {"cursor": state["cursor"] + 1, "last_error": ""}


def escalate(state: BuildState) -> dict:
    task = state["tasks"][state["cursor"]]
    return {"replans": state.get("replans", 0) + 1,
            "events": [f"escalate: replanning around {task['id']}"]}


# --------------------------------------------------------------------------
# critic — judgment only, once, on what the gate cannot see
# --------------------------------------------------------------------------

_CRITIC_SYSTEM = """Review a finished implementation. Every acceptance check already
passes, so correctness is not your job.

Comment only on what a test cannot detect:
- Does this actually do what the idea asked for, or does it pass the checks while
  missing the point?
- Is the API or interface awkward to use?
- Is there a structural problem that will make the next feature painful?

Be specific and cite files. If nothing is worth raising, say so in one line.
"""


def make_critic(llm):
    def critic(state: BuildState) -> dict:
        ws = Path(state["workspace"])
        sources = {}
        for t in state["tasks"]:
            for f in t.get("files", []):
                p = ws / f
                if p.exists():
                    sources[f] = p.read_text()[:4000]
        payload = {"idea": state["idea"], "spec": state["spec"], "files": sources,
                   "blocked": [t["id"] for t in state["tasks"] if t["status"] == "blocked"]}
        return {"critique": llm.complete(_CRITIC_SYSTEM, json.dumps(payload)).strip(),
                "events": ["critic: reviewed"]}

    return critic


# --------------------------------------------------------------------------
# integrate — full suite, not just the per-task checks
# --------------------------------------------------------------------------

def make_integrate(full_suite: str):
    def integrate(state: BuildState) -> dict:
        try:
            r = subprocess.run(full_suite, shell=True, cwd=state["workspace"],
                               capture_output=True, text=True, timeout=300)
            ok = r.returncode == 0
        except subprocess.TimeoutExpired:
            ok = False
        passed = sum(1 for t in state["tasks"] if t["status"] == "passed")
        return {"events": [f"integrate: suite {'green' if ok else 'RED'} · "
                           f"{passed}/{len(state['tasks'])} tasks passed"]}

    return integrate


# --------------------------------------------------------------------------

def _json(raw: str) -> dict | None:
    raw = re.sub(r"^```(?:json)?|```$", "", (raw or "").strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return None


def build_factory(llm, full_suite: str = "pytest -q"):
    g = StateGraph(BuildState)
    g.add_node("spec", make_spec(llm))
    g.add_node("plan", make_plan(llm))
    g.add_node("implement", make_implement(llm))
    g.add_node("gate", gate)
    g.add_node("advance", advance)
    g.add_node("escalate", escalate)
    g.add_node("critic", make_critic(llm))
    g.add_node("integrate", make_integrate(full_suite))

    g.add_edge(START, "spec")
    g.add_edge("spec", "plan")
    g.add_edge("plan", "implement")
    g.add_edge("implement", "gate")
    g.add_conditional_edges("gate", _route_gate,
                            ["implement", "advance", "escalate", "critic"])
    g.add_edge("advance", "implement")
    g.add_edge("escalate", "plan")
    g.add_edge("critic", "integrate")
    g.add_edge("integrate", END)
    return g.compile()
