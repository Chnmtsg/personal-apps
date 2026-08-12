# Discipline Project

## Project Vision

Discipline is a personal-development tracker for one person, on their own phone.

The goal is NOT to record habits and workouts. A notes app does that.

The goal is to carry someone from where they actually are to a target they chose,
at a pace they can survive — and to keep a streak that survives real life.

---

## This Is Not A Game

The streak, the XP, the levels and the ranks are **instruments, not the point**.
They exist to make a real life easier to keep hold of. The moment the number
becomes the thing the user is protecting, the app has started competing with the
life it was built to serve.

The test for any feature: *does this tell the user something true about their
life, or does it only move a counter the app invented?*

- A real total is worth more than a synthetic one. "22 hours of deep work" and
  "61 mornings you got up when you said you would" are facts about a life.
  "238 XP" is a fact about a spreadsheet.
- A reward that costs something real — the sneakers, the next book — beats a
  badge. That is why collecting one grants no XP.
- Never invent a number the user did not earn, and never dress an invented
  number up as an earned one. Elapsed time is not progress; points are not
  achievement.
- Streaks may never become the app's argument for itself. A streak is context.
  Losing one must never read as a verdict, and protecting one must never be more
  attractive than living the day.

Nothing here says delete the game layer. It says keep it in its place, below the
things that are true.

---

## The Three Rules

These are the vision, not implementation detail. No feature may contradict them.

**1. Every goal has a baseline and a target.**

A goal is `start → target`, never `start + step forever`. A progression with only
a step size is a countdown to failure: at −15 min/week you are being asked to wake
at 3:45am by week twelve. `valueAt(level)` is clamped to the target, and on
arrival the goal switches to maintenance.

**2. Levels are earned by performing, never granted by the calendar.**

The obvious version advances on dates — week 1 is 6:30, week 2 is 6:15, whether or
not you managed week 1. That guarantees the app outruns the user and everyone fails
on schedule. Here a step is earned (by default 5 good days in the last 7), and
missing enough scheduled days in a row steps *back* so the app walks down to meet
you.

**3. Difficulty changes the size of a step, not the rules for earning one.**

Easy halves the step, Hard doubles it. Switching re-scores the existing record at
the new step size. Nothing is wiped and no completed day is un-completed.

---

## Core Modules

A core module is one the application ships today and can be reached by name.

| Module | Where it lives |
|---|---|
| Today | Tab bar — the day's goals, workout, reading gate, habits, journal |
| Plan | Tab bar — goal management and the seven-day training split |
| Read | Tab bar — reading summaries and the daily journal, plus both archives |
| Stats | Tab bar — streaks, level/XP, goal ladders, heat map, training mix |
| Rewards | Tab bar — your own rewards, 11 streak milestones, weekly chest, XP, rank ladder |
| More | Tab bar — difficulty, streak rules, exercise library, habits, backup |

**The training program** is content under Plan, not its own screen: a built-in
six-day dumbbell split living in the exercise library and the weekly plan. Every
exercise carries how-to notes reachable from any workout row.

**The run** is an optional fixed length the day counter counts against — DAY 5 / 66. It must stay
optional: a finish line the user did not choose is a deadline, and this app does not set deadlines.
Its progress bar shows elapsed days *and* kept days as separate layers, because elapsed time is not
progress and must never be drawn as if it were. Runs are archived on completion, never deleted.

**Your own rewards** live at the top of Rewards. A reward is a promise the user
makes to themselves — "fourteen days of workouts, then the sneakers" — tied
either to the overall streak or to one goal's streak. It pays out in the real
world, so collecting it records that they actually bought the thing and grants
no XP: inventing points for buying yourself trainers is exactly the unearned
number this app refuses to show. A reward is earned on the *best* run the streak
ever reached, not the current one, so a slip afterwards cannot revoke something
already won.

**Streak freezes** ship under More. They are named here because they serve the
vision directly: a streak that shatters on one bad day teaches people to quit. A
freeze is earned (one per 10 completed days, max 5) and spent by hand on a
specific past day, so it holds the chain without pretending a missed day happened.

---

## Project Principles

The application must be

- Fast
- Simple
- Offline-first
- Mobile-friendly
- Easy to understand
- Reliable
- Honest — it never shows a number the user did not earn

---

## Hard Constraints

A change that breaks one of these is a Critical finding.

**A day you have lived is never re-judged.** Every goal entry stores the target it
was judged against; every day's log freezes its own exercise list; every goal keeps
a `scheduleHistory`. Editing a goal, switching difficulty, moving a baseline or
changing a schedule must never reach back and change what a past day meant.

**Day status is derived, never stored.** Every number is recomputed from the logs
so nothing drifts out of sync. This is why `commit()` must stay O(1), why the
best-streak high-water mark is maintained on read, and why day status and goal
timelines are memoised per revision.

**Stored data is sacred.** Everything lives in `localStorage` on one device and is
never uploaded. A migration must be additive and must tolerate state written by an
older version. Backup is More → Export, and it is the only recovery there is.

**Today is never a failure until it is over.** An unfinished today can lift your
level; it can never drop it.

---

## Target Users

One person tracking their own life.

No training required. No fitness or accounting knowledge assumed.

Every screen should be understandable without explanation.

---

## What Is Deliberately Not Built

These are decisions, not gaps. Re-proposing one needs a reason.

- **Alarms and reliable reminders.** A PWA cannot wake anyone: browsers do not run
  timers in the background, and iOS delivers web push to a home-screen install
  unreliably and without timing guarantees. Discipline tracks a wake-up; it must never
  imply it causes one. The reminder setting fires only while the app is open.
- **Cloud sync and accounts.** Data stays on the device.
- **Anti-cheat.** Winding the device clock back cannot be prevented offline. The
  app detects it and says so rather than quietly rewarding it.

---

## Long-term Vision

Future versions may include

- Cloud sync and multi-device
- Progress photos and body measurements
- Per-lift volume and progression analytics
- Custom training programs beyond the built-in split
