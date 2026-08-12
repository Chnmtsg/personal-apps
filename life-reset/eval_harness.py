"""Walks synthetic users across all 66 days and checks the invariants.

    python eval_harness.py
    python eval_harness.py --users 5000
    python eval_harness.py --live      # includes real Architect calls

This is where bugs in `validate` and `repair` get caught, and it is deliberately
not an agent. An LLM asked to review a programme reads sensible-looking habits
and approves it; the failure modes here are arithmetic — a rounding overshoot on
day 41, a repair loop that swaps two zero-cost habits forever — and no amount of
prose review finds those.

Adversarial Architects and Adaptations are cycled in on purpose. A real model
will eventually produce every one of them, so `repair` and `apply_patch` have to
survive all of them — and the summary reports which adversaries fired and which
op effects landed, because an assertion nothing reaches is not an assertion.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import replace
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
    DayLog,
    Program,
    active_on,
    day_minutes,
    dose_for,
    record_day,
    validate,
)
from life_reset import state
from life_reset.recommend import apply_recommendation, recommend
from life_reset.session import check_in, where

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
# Adversarial Adaptation — the layer that runs most often and had none
# ---------------------------------------------------------------------------
#
# The Architect had twelve adversaries and runs once per user, ever. Adaptation
# runs every time somebody slips, and until now the harness only ever called
# `adapt_program(None, ...)` — which takes the no-op fallback and emits a single
# `soften`. So `freeze`, `defer`, `drop`, `resume` and the `MAX_PATCH_HABITS`
# cap had *zero* coverage in 2,000 users, and four crashes reachable from a
# plausible model response sat in `apply_patch` the whole time: a string factor,
# a null factor, a string days, and a NaN factor that produced a programme
# `validate` called healthy and `state.dumps` then refused to save.


def _ops(rng: random.Random, ids: list[str]) -> str:
    pick = lambda: rng.choice(ids) if ids else "walk"
    return json.dumps({"ops": [
        {"op": rng.choice(["soften", "freeze", "defer", "drop", "resume"]),
         "habit_id": pick(), "factor": rng.choice([0.5, 0.25, 1.0]), "days": 7}
    ]})


ADAPT_ADVERSARIES: dict[str, Callable[[random.Random, list[str]], str]] = {
    "well_formed":     lambda r, ids: _ops(r, ids),
    "malformed_json":  lambda r, ids: '{"ops": [{"op": "soften",,]',
    "prose_not_json":  lambda r, ids: "I think they should just take it easier this week.",
    "empty":           lambda r, ids: "",
    "not_a_list":      lambda r, ids: json.dumps({"ops": {"op": "drop"}}),
    "unknown_op":      lambda r, ids: json.dumps({"ops": [{"op": "obliterate", "habit_id": ids[0] if ids else "walk"}]}),
    "unknown_habit":   lambda r, ids: json.dumps({"ops": [{"op": "drop", "habit_id": "cold_plunge"}]}),
    # The four that used to crash. Every one is something a model really emits.
    "string_factor":   lambda r, ids: json.dumps({"ops": [{"op": "soften", "habit_id": ids[0] if ids else "walk", "factor": "half"}]}),
    "null_factor":     lambda r, ids: json.dumps({"ops": [{"op": "soften", "habit_id": ids[0] if ids else "walk", "factor": None}]}),
    "string_days":     lambda r, ids: json.dumps({"ops": [{"op": "defer", "habit_id": ids[-1] if ids else "walk", "days": "soon"}]}),
    "nan_factor":      lambda r, ids: '{"ops": [{"op": "soften", "habit_id": "%s", "factor": NaN}]}' % (ids[0] if ids else "walk"),
    "negative_factor": lambda r, ids: json.dumps({"ops": [{"op": "soften", "habit_id": ids[0] if ids else "walk", "factor": -5}]}),
    "huge_defer":      lambda r, ids: json.dumps({"ops": [{"op": "defer", "habit_id": ids[-1] if ids else "walk", "days": 10 ** 9}]}),
    "drop_everything": lambda r, ids: json.dumps({"ops": [{"op": "drop", "habit_id": h} for h in ids]}),
    "freeze_everything": lambda r, ids: json.dumps({"ops": [{"op": "freeze", "habit_id": h} for h in ids]}),
    "too_many_ops":    lambda r, ids: json.dumps({"ops": [{"op": "soften", "habit_id": h, "factor": 0.5} for h in ids]}),
    "resume_everything": lambda r, ids: json.dumps({"ops": [{"op": "resume", "habit_id": h} for h in ids]}),
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


def _effects(before: Program, after: Program) -> list[str]:
    """Which op effects actually landed, read off the two programmes.

    An independent oracle for the op coverage line: it never looks at what was
    submitted, only at what changed, so an op that was accepted and then quietly
    ignored cannot inflate the count.
    """
    b = {p.habit_id: p for p in before.habits}
    a = {p.habit_id: p for p in after.habits}
    out: list[str] = []
    for hid, was in b.items():
        now = a.get(hid)
        if now is None:
            out.append("drop")
            continue
        if now.scale < was.scale - 1e-9:
            out.append("soften")
        if now.scale > was.scale + 1e-9 or (was.frozen_day is not None
                                            and (now.frozen_day is None
                                                 or now.frozen_day > was.frozen_day)):
            out.append("resume")
        if was.frozen_day is None and now.frozen_day is not None:
            out.append("freeze")
        if now.start_day > was.start_day:
            out.append("defer")
    return out


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


def check_round_trip(prog: Program, logs: DayLog | None,
                     tag: str, f: Failures) -> int:
    """Per programme. Written down, read back, and still the same run.

    The comparison is against the *original object*, not against a second
    serialisation of it — a codec that drops a field consistently would agree
    with itself all day. Equality on the frozen dataclass is the independent
    oracle here: it compares every field, including ones this check does not
    know about, so a field added later is covered the moment it exists.

    The 66-day walk is repeated on the restored programme for the same reason.
    Round-tripping to something that still parses but no longer means the same
    thing is the failure that would surface on a real device, three weeks in.

    The twin is not decoration either. **This harness cannot prove a codec using
    only its own programmes.** `adapt_program(None, ...)` falls back to `soften`
    every time here, so nothing it generates has ever carried a `frozen_day` —
    deleting that field from `to_dict` passed 2,000 users clean while failing a
    unit test by name. That is gap 1 leaking into a check that has nothing to do
    with adaptation. The twin populates every optional field so this check stops
    inheriting the coverage of the layer above it.
    """

    def round_trip(p: Program, lg: DayLog | None, what: str) -> None:
        try:
            back = state.loads(state.dumps(p, lg))
        except ValueError as exc:
            # ValueError, not StateError: `json.dumps(allow_nan=False)` raises a
            # plain one, and a NaN scale killed the whole harness run instead of
            # being counted. A harness that dies on the bug it found reports
            # nothing about the other 1,900 users.
            f.add("save_round_trips", f"{tag}/{what}: refused its own save — {exc}")
            return
        if back.program != p:
            f.add("save_round_trips", f"{tag}/{what}: {p} came back as {back.program}")
        if lg is not None and back.logs != lg:
            f.add("save_round_trips", f"{tag}/{what}: logs changed across the round trip")
        if back.notes:
            f.add("save_is_clean",
                  f"{tag}/{what}: this build cannot read what it just wrote — {back.notes}")
        # Same state, same bytes. Without this a sync layer reads every load as a
        # write, and content hashing is worthless.
        if state.dumps(back.program, back.logs if lg is not None else None) != state.dumps(p, lg):
            f.add("save_is_deterministic", f"{tag}/{what}: serialising twice gave two answers")
        if sorted(str(v) for v in validate(p)) != sorted(str(v) for v in validate(back.program)):
            f.add("save_preserves_judgement", f"{tag}/{what}: verdict changed across the trip")

    round_trip(prog, logs, "as-is")
    round_trip(
        replace(prog, habits=tuple(
            replace(p, scale=0.25 + 0.25 * (i % 3), frozen_day=p.start_day + 7 + i)
            for i, p in enumerate(prog.habits)
        )),
        logs,
        "every-field-set",
    )
    return 2


def check_recommendations(prog: Program, logs: DayLog, today: int, diag: dict,
                          tag: str, f: Failures, effects: dict[str, int]) -> dict[str, int]:
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
        prior = cur
        cur, notes = apply_recommendation(cur, r, today)
        for eff in _effects(prior, cur):
            effects[eff] = effects.get(eff, 0) + 1
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


def check_session(prog: Program, logs: DayLog, today: int, tag: str, f: Failures) -> str:
    """Per user. The two things `session.py` exists to stop the caller getting
    wrong, asserted on real programmes rather than one hand-built fixture.

    "Step in, or offer more, never both" is a rule with halves in two modules —
    `recommend` refuses an `add` while `needs_intervention`, and the sequencing
    lives in whoever calls them. A rule enforced in two places is a rule that
    holds until someone calls them in a third.
    """
    ci = check_in(prog, logs, today)

    if ci.patched and ci.recommendations:
        f.add("never_both", f"{tag}: patched and offered {len(ci.recommendations)} suggestions")

    # That assertion alone cannot fail here, and saying so is the point. An
    # `advance` needs an *eased* habit the user is keeping, and nothing in this
    # harness eases a habit somebody is succeeding at — so ease it deliberately,
    # the same way the codec check populates its twin. Before this, breaking
    # `check_in` to offer suggestions alongside a patch changed nothing in the
    # summary while failing a unit test by name.
    best = max(ci.diagnosis["per_habit"].items(),
               key=lambda kv: (kv[1]["rate"], kv[1]["asked"]), default=None)
    if best is not None and best[1]["asked"]:
        twin = replace(prog, habits=tuple(
            replace(p, frozen_day=max(1, today - 7)) if p.habit_id == best[0] else p
            for p in prog.habits
        ))
        eased = check_in(twin, logs, today)
        if eased.patched and eased.recommendations:
            f.add("never_both",
                  f"{tag}/eased-twin: patched and offered {len(eased.recommendations)}")

    if ci.patched is not ci.diagnosis["needs_intervention"]:
        f.add("patch_follows_diagnosis",
              f"{tag}: needs_intervention={ci.diagnosis['needs_intervention']} patched={ci.patched}")
    if not ci.patched and ci.program != prog:
        f.add("unpatched_is_untouched", f"{tag}: the programme moved without a patch")
    for v in validate(ci.program):
        f.add("check_in_leaves_no_violations", f"{tag}: {v}")

    # Outside the run there is nothing to decide, and deciding anything would
    # mean softening a run the user has already finished.
    for day in (0, PROGRAM_DAYS + 1, PROGRAM_DAYS + 40):
        out = check_in(prog, logs, day)
        if out.patched or out.recommendations or out.program != prog:
            f.add("nothing_to_decide_outside_the_run", f"{tag}: day {day} did something")

    return "patched" if ci.patched else ("offered" if ci.recommendations else "quiet")


def synthetic_logs(prog: Program, today: int, rng: random.Random,
                   mode: str = "fine") -> DayLog:
    """A user doing fine, one who has stopped, or one who is lopsided.

    Recorded through `record_day`, the same call an app makes, so the asks in
    here are the asks that stood on the day rather than whatever the programme
    looks like by the time the harness gets around to reading it.

    **"lopsided" is not decoration.** Only `add` is gated on
    `needs_intervention`; `advance` is gated on a *per-habit* rate. So a user
    holding one habit at 100% while the rest collapse trips intervention and
    qualifies for an advance on the same day — the only shape in which
    `session.check_in`'s "never both" rule can fail. Without it that assertion
    ran 1,000 times a go and could not have caught anything, which is this
    harness's oldest mistake and the reason the summary reports its outcomes.
    """
    logs: DayLog = {}
    favourite = min((p.habit_id for p in prog.habits), default=None)
    for day in range(1, today):
        done = set()
        for p in active_on(prog, day):
            if mode == "lopsided":
                # One habit kept perfectly; everything else stops dead.
                keep = 1.0 if p.habit_id == favourite else (0.9 if day < today - 6 else 0.0)
            else:
                keep = 0.35 if mode == "struggling" else 0.9
                keep -= 0.05 * (habit(p.habit_id).friction - 1)
            if rng.random() < max(0.0, keep):
                done.add(p.habit_id)
        logs[day] = record_day(prog, day, done)
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
    round_trips = 0
    sessions: dict[str, int] = {}
    adapt_names = list(ADAPT_ADVERSARIES)
    adapt_kinds: dict[str, int] = {}
    ops_seen: dict[str, int] = {}

    for i in range(args.users):
        kind = names[i % len(names)]
        budget = rng.choice([30, 45, 60, 75, 90, 120])
        llm = live_llm if args.live and kind == "well_formed" else Scripted(ADVERSARIES[kind](rng))

        prog, meta = build_program(llm, "intake", f"u{i}", START, budget)
        sources[meta["source"]] = sources.get(meta["source"], 0) + 1
        check_program(prog, f"{kind}/u{i}", f)
        round_trips += check_round_trip(prog, None, f"{kind}/u{i}", f)
        day_renders += PROGRAM_DAYS

        if meta["violations_remaining"]:
            for v in meta["violations_remaining"]:
                f.add("repair_leaves_no_violations", f"{kind}/u{i}: {v}")

        # Half the users hit a wall around week three and get one patch.
        if i % 2 == 0:
            today = rng.randint(15, 60)
            # Only even `i` reaches here, so the spread is over i % 8 rather than
            # i % 4 — keying on the latter made every user who got this far a
            # problem case, and the "offered" outcome went to zero.
            mode = {0: "struggling", 2: "lopsided"}.get(i % 8, "fine")
            logs = synthetic_logs(prog, today, rng, mode)
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
                # A hostile Adaptation, cycled the same way the Architect's are.
                # This used to be `adapt_program(None, ...)`, which takes the
                # fallback path and emits one `soften` — so four of the five ops
                # and the patch cap were never executed at all.
                akind = adapt_names[i % len(adapt_names)]
                allm = Scripted(ADAPT_ADVERSARIES[akind](rng, list(prog.ids())))
                adapt_kinds[akind] = adapt_kinds.get(akind, 0) + 1
                try:
                    after, pmeta = adapt_program(allm, prog, diag, today)
                except Exception as exc:                      # noqa: BLE001
                    f.add("adapt_never_raises", f"{kind}/u{i} [{akind}]: {type(exc).__name__}: {exc}")
                    after, pmeta = adapt_program(None, prog, diag, today)
                # Counted from what the programme *became*, not from the ops
                # that were handed in. `apply_patch` still ignores an unknown
                # op, a drop at the floor and a defer on something underway, so
                # counting submissions reported 20 `obliterate` ops as run.
                for eff in _effects(prog, after):
                    ops_seen[eff] = ops_seen.get(eff, 0) + 1
                # A patched programme has to be storable. A NaN scale validated
                # clean and made every later save throw.
                try:
                    state.dumps(after)
                except ValueError as exc:
                    f.add("patched_run_stays_saveable", f"{kind}/u{i} [{akind}]: {exc}")
                check_patch(prog, after, pmeta, today, diag, f"{kind}/u{i}", f)
                check_program(after, f"{kind}/u{i}+patch", f)
                round_trips += check_round_trip(after, logs, f"{kind}/u{i}+patch", f)
                day_renders += PROGRAM_DAYS
                # The recommender against a *patched* programme, which is where
                # anything eased back lives and so the only place `advance` can
                # fire at all.
                got = check_recommendations(after, logs, today, diag, f"{kind}/u{i}+patch", f, ops_seen)

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
                back = {d: record_day(after, d, [p.habit_id for p in active_on(after, d)])
                        for d in range(1, later)}
                for k, n in check_recommendations(
                    after, back, later, diagnose(after, back, later),
                    f"{kind}/u{i}+back", f, ops_seen
                ).items():
                    offered[k] = offered.get(k, 0) + n
            else:
                got = check_recommendations(prog, logs, today, diag, f"{kind}/u{i}", f, ops_seen)
            outcome = check_session(prog, logs, today, f"{kind}/u{i}", f)
            sessions[outcome] = sessions.get(outcome, 0) + 1
            for k, n in got.items():
                offered[k] = offered.get(k, 0) + n

    print("=" * 72)
    print(f"{args.users} users · {day_renders:,} day-renders · {patched_users} patched")
    print(f"architect source: {sources}")
    # A zero here is a branch that went untested, not a branch that behaved.
    split = ", ".join(f"{k} {n}" for k, n in sorted(offered.items())) or "none"
    print(f"recommendations offered and accepted: {sum(offered.values())} ({split})")
    print(f"saves written and read back: {round_trips}")
    outcomes = ", ".join(f"{k} {n}" for k, n in sorted(sessions.items())) or "none"
    print(f"check-ins: {sum(sessions.values())} ({outcomes})")
    # Every op that actually executed. A zero is an op the adversaries never
    # reached, which is how four of the five went untested for this long.
    print(f"adaptation adversaries: {len(adapt_kinds)}/{len(ADAPT_ADVERSARIES)} kinds, "
          f"op effects landed: {dict(sorted(ops_seen.items())) or 'none'}")
    # All five ops have to land somewhere. `resume` never lands via Adaptation —
    # it needs an already-eased habit, which a struggling user does not have —
    # so it arrives through the recommender's `advance`. A zero for any of them
    # means an op nothing exercised.
    missing = [o for o in ("soften", "freeze", "defer", "drop", "resume") if not ops_seen.get(o)]
    if missing:
        f.add("every_op_is_exercised", f"no run of these landed: {missing}")
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
