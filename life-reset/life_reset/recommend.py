"""What to do next, when the next thing is not a sacrifice.

`agents.adapt_program` answers one question: *this is going badly, what gives?*
For a long time it was the only question the system could answer, and the four
operations it chooses between are all subtractions. A programme could shrink and
never grow back, so a user who stumbled in week three finished the run on a
flattened programme — not because they were still struggling, but because
nothing in the system could notice they had stopped.

This module answers the other two:

    advance   they have earned some of it back — give a notch of ramp back
    add       there is room, budget and appetite for one more thing

Both are pure code, and deliberately so. Whether someone is ready for more is
arithmetic: what they are running, what they have kept, what the phase allows,
what the budget leaves. Only *phrasing* would need a model, and a recommendation
whose numbers came from a model is a recommendation nobody can check.

**A recommendation is a proposal that has already been proved.** Nothing is
returned from here until the programme it would produce has been walked across
all 66 days with zero violations. `repair` exists to clean up after an
adversarial Architect; a suggestion the app makes to a user who is doing well
should never need cleaning up, and one that does is a bug in this file rather
than something for `repair` to absorb.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Literal

from .agents import diagnose
from .catalog import (
    HABITS,
    LAST_INTRO_DAY,
    MAX_NEW_PER_WEEK,
    PROGRAM_DAYS,
    Domain,
    habit,
    phase_for,
)
from .program import (
    DayLog,
    Program,
    ProgramHabit,
    active_on,
    apply_patch,
    day_minutes,
    dose_for,
    validate,
)

Kind = Literal["add", "advance"]

# Evidence thresholds. Higher than `PROTECTED_RATE` (0.7) on purpose: that one
# asks "is this habit the problem?", and these ask "has this person earned more
# work?" — a much stronger claim, and the wrong answer costs them the run.
ADD_READY_RATE = 0.8
ADVANCE_READY_RATE = 0.9
MIN_EVIDENCE_DAYS = 7
MAX_RECOMMENDATIONS = 3

# How many legal start days to try per candidate before giving up on it. The
# earliest legal day is nearly always the answer; the retries exist for the case
# where spacing allows a day that the budget does not.
_START_ATTEMPTS = 4


@dataclass(frozen=True)
class Recommendation:
    """One thing the user could do next, and the case for it.

    Carries the *intent* — kind, habit, and for an add the day — rather than the
    programme it would produce. `apply_recommendation` rebuilds that from the
    intent, so the construction here and the construction there are two paths to
    the same answer and the harness can notice if they ever stop agreeing.
    Storing the finished programme would make that check a tautology.
    """

    kind: Kind
    habit_id: str
    headline: str
    detail: str
    reasons: tuple[str, ...]
    start_day: int | None = None      # "add" only


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _with_added(program: Program, habit_id: str, start_day: int) -> Program:
    return replace(
        program, habits=program.habits + (ProgramHabit(habit_id=habit_id, start_day=start_day),)
    )


def _legal_start_days(program: Program, today: int) -> list[int]:
    """Days a new habit could start without breaking the spacing rule.

    The same rolling-window test `validate` runs, over every window rather than
    only the one ending at the candidate day. Counting backwards alone is not
    the rule and has been the bug here before: a day can look free from its own
    side and quietly make a later day the third start in a week.
    """
    taken = [p.start_day for p in program.habits]
    out: list[int] = []
    for day in range(max(today + 1, 1), LAST_INTRO_DAY + 1):
        days = sorted(taken + [day])
        if all(sum(1 for y in days if x - 6 <= y <= x) <= MAX_NEW_PER_WEEK for x in days):
            out.append(day)
    return out


def _domain_counts(program: Program) -> dict[Domain, int]:
    counts: dict[Domain, int] = {"fitness": 0, "self_care": 0, "development": 0}
    for p in program.habits:
        counts[habit(p.habit_id).domain] += 1
    return counts


def _headroom(program: Program, day: int) -> float:
    return program.minutes_budget - day_minutes(program, day)


# ---------------------------------------------------------------------------
# advance — the way back up
# ---------------------------------------------------------------------------


def _is_eased(p: ProgramHabit) -> bool:
    return p.frozen_day is not None or p.scale < 1.0


def _advance_recommendations(
    program: Program, diagnosis: dict, today: int, limit: int
) -> tuple[list[Recommendation], Program]:
    """Habits that were eased back and are now being kept anyway.

    Only habits `soften` or `freeze` has touched are eligible. A habit at full
    pace has nothing to give back — its ceiling is the catalog's `target_dose`,
    and raising *that* would be inventing a number, which is the one thing this
    codebase does not do.

    Threaded like the adds: each candidate is checked against a programme that
    already carries the ones above it, so a user can accept the whole list. Two
    independently-safe resumes are not necessarily safe together — that is the
    budget arithmetic, and it is exactly the kind of thing that would surface as
    a declined tap rather than as a bug report.

    @returns (recommendations, the programme with all of them applied)
    """
    out: list[Recommendation] = []
    working = program
    for p in program.habits:
        if len(out) >= limit:
            break
        if not _is_eased(p):
            continue
        stat = diagnosis["per_habit"].get(p.habit_id, {})
        if stat.get("asked", 0) < MIN_EVIDENCE_DAYS:
            continue
        if stat.get("rate", 0.0) < ADVANCE_READY_RATE:
            continue

        after = _resumed(working, p.habit_id, today)
        if after is None:
            continue

        h = habit(p.habit_id)
        nxt = min(today + 1, PROGRAM_DAYS)
        was = dose_for(next(q for q in working.habits if q.habit_id == p.habit_id), nxt)
        now = dose_for(next(q for q in after.habits if q.habit_id == p.habit_id), nxt)
        out.append(
            Recommendation(
                kind="advance",
                habit_id=p.habit_id,
                headline=h.name,
                detail=f"{was:g} -> {now:g} {h.unit}",
                reasons=(
                    f"kept {stat['done']} of the last {stat['asked']} it asked for",
                    "eased back earlier; this gives one week of that ramp back",
                ),
            )
        )
        working = after
    return out, working


def _resumed(program: Program, habit_id: str, today: int) -> Program | None:
    """The programme one `resume` later, or None if that resume is not safe.

    Three things have to hold, and each of them has cost this codebase a bug in
    one form or another:

    * every one of the 66 days still validates;
    * no *other* habit moved — `apply_patch` runs `repair`, and a suggestion
      that quietly drops a habit to pay for itself is not a reward;
    * tomorrow's ask actually *rises*, and rises by at most one catalog step.

    Both halves of that last rule are load-bearing, and the lower bound is the
    one that is easy to leave out. `scale` multiplies the week count before it
    is rounded, so raising it from 0.5 to 0.75 can land on the same step: water
    softened at day 24 and resumed at day 38 came back as "4 -> 4 glasses" — a
    button that validated, passed every invariant, ran 369 times across 2,000
    synthetic users, and did nothing the user could see. A recommendation whose
    effect is invisible is worse than no recommendation, because it spends the
    trust that makes the next one work. It is offered again a week later, when
    the arithmetic has caught up and it means something.

    The upper bound is the opposite failure: a quarter of a scale is worth one
    step early in a run and three late in one, and a jump like that breaks the
    streak it was meant to celebrate.
    """
    after, _ = apply_patch(program, [{"op": "resume", "habit_id": habit_id}], today=today)
    if validate(after):
        return None

    before_by_id = {p.habit_id: p for p in program.habits}
    after_by_id = {p.habit_id: p for p in after.habits}
    if set(before_by_id) != set(after_by_id):
        return None
    if any(before_by_id[k] != after_by_id[k] for k in before_by_id if k != habit_id):
        return None
    if before_by_id[habit_id] == after_by_id[habit_id]:
        return None                                   # nothing to give back

    step = habit(habit_id).step
    nxt = min(today + 1, PROGRAM_DAYS)
    gain = dose_for(after_by_id[habit_id], nxt) - dose_for(before_by_id[habit_id], nxt)
    if gain <= 1e-9 or gain > step + 1e-9:
        return None
    return after


# ---------------------------------------------------------------------------
# add — one more thing, and only when it is wanted
# ---------------------------------------------------------------------------


def _add_candidates(program: Program) -> list[str]:
    """Habits not already running, best first.

    The order is the recommendation. Thinnest domain first, because a programme
    of five fitness habits and nothing else is the one that reads as a training
    plan rather than a life; then lowest friction, because a friction-5 habit
    dropped on top of a working programme is how a good run ends; then cheapest,
    so the suggestion leaves the budget room it found.
    """
    counts = _domain_counts(program)
    have = set(program.ids())
    return [
        h.id
        for h in sorted(
            (h for h in HABITS if h.id not in have),
            key=lambda h: (
                counts[h.domain],
                h.friction,
                h.start_dose * h.minutes_per_unit,
                h.id,
            ),
        )
    ]


def _add_recommendations(
    program: Program, diagnosis: dict, today: int, limit: int
) -> list[Recommendation]:
    """One more habit — but only for someone the numbers say is ready for it.

    The gate is the feature. Suggesting extra work to a user who is already
    missing days is the single most reliable way to lose them, and it is what an
    engagement metric would ask for. `needs_intervention` is the same signal
    `adapt_program` acts on; the two must never fire on the same day.

    Several suggestions are offered together and they are **mutually
    compatible**: each is placed against a working programme that already
    contains the ones above it, so taking two of them is legal. Placing them all
    independently is the obvious implementation and it is wrong — three habits
    all offered "from day 31" is two offers the user cannot accept, against a
    rule that allows two starts a week.
    """
    if diagnosis["needs_intervention"]:
        return []
    if diagnosis["overall_rate"] < ADD_READY_RATE:
        return []
    scored = [v for v in diagnosis["per_habit"].values() if v["asked"] >= MIN_EVIDENCE_DAYS]
    if not scored:
        return []                                     # not enough history to say anything

    out: list[Recommendation] = []
    working = program
    while len(out) < limit:
        legal = _legal_start_days(working, today)
        if not legal:
            break
        counts = _domain_counts(working)

        chosen: tuple[str, int] | None = None
        for habit_id in _add_candidates(working):
            for day in legal[:_START_ATTEMPTS]:
                if not validate(_with_added(working, habit_id, day)):
                    chosen = (habit_id, day)
                    break
            if chosen:
                break
        if chosen is None:
            break

        habit_id, placed = chosen
        h = habit(habit_id)
        ph = phase_for(placed)
        live = len(active_on(working, placed))
        free = _headroom(working, placed)
        domain = h.domain.replace("_", " ")
        out.append(
            Recommendation(
                kind="add",
                habit_id=habit_id,
                headline=h.name,
                detail=f"{h.start_dose:g} -> {h.target_dose:g} {h.unit}, from day {placed}",
                reasons=(
                    f"nothing in {domain} yet"
                    if counts[h.domain] == 0
                    else f"{counts[h.domain]} in {domain}, the least of the three",
                    f"{ph.name} allows {ph.max_habits}; day {placed} runs {live}",
                    f"{free:.0f} of your {program.minutes_budget} min is free that day",
                    f"you have kept {diagnosis['overall_rate']:.0%} of the last two weeks",
                ),
                start_day=placed,
            )
        )
        working = _with_added(working, habit_id, placed)
    return out


# ---------------------------------------------------------------------------
# The entry points
# ---------------------------------------------------------------------------


def recommend(
    program: Program,
    logs: DayLog,
    today: int,
    limit: int = MAX_RECOMMENDATIONS,
) -> list[Recommendation]:
    """Everything worth offering this user today, best first.

    `advance` outranks `add` and always will. Giving back something they already
    earned costs them nothing and reads as the app noticing; handing them a new
    habit costs them a slot, some budget and some attention. Offer the free one
    first.

    Returns an empty list freely — most days there is nothing to say, and a
    recommender that always has an opinion is a recommender nobody trusts.
    """
    # A programme that is already infeasible somewhere in its 66 days is
    # `repair`'s problem, not this module's. Every check below asks "does the
    # result validate", which a broken starting point fails for reasons that
    # have nothing to do with the suggestion — so say nothing, loudly, rather
    # than silently returning nothing from four different places.
    if validate(program):
        return []

    diagnosis = diagnose(program, logs, today)
    out, working = _advance_recommendations(program, diagnosis, today, limit)
    if len(out) < limit:
        # Against `working`, not `program`: an add checked against the heavier
        # programme is valid on the lighter one too, so this is the safe
        # direction. The reverse — offering an add that only fits if the user
        # declines the advance above it — is a tap that gets refused.
        out += _add_recommendations(working, diagnosis, today, limit - len(out))
    return out[:limit]


def apply_recommendation(
    program: Program, rec: Recommendation, today: int
) -> tuple[Program, list[str]]:
    """Take one up. Refuses rather than repairs.

    Re-checked here rather than trusted, because a recommendation is a value the
    caller can hold on to: the programme may have been patched, or the day may
    have moved, between it being made and it being tapped. If it no longer
    validates it is declined — running `repair` to force it through would be the
    app quietly charging the user for its own stale advice.
    """
    if rec.kind == "add":
        if rec.start_day is None:
            return program, [f"declined {rec.habit_id}: no start day"]
        after = _with_added(program, rec.habit_id, rec.start_day)
        problems = validate(after)
        if problems:
            return program, [f"declined {rec.habit_id}: {problems[0]}"]
        return after, [f"added {rec.habit_id} from day {rec.start_day}"]

    after = _resumed(program, rec.habit_id, today)
    if after is None:
        return program, [f"declined resume on {rec.habit_id}: no longer safe"]
    return after, [f"resumed {rec.habit_id}"]
