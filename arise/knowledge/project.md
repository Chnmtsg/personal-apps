# Discipline Project

## Project Vision

Discipline is a training log for one person, on their own phone.

The goal is NOT to tick off that you went to the gym. A notes app does that.

The goal is to hold the one record that answers **"is it going up"** — what you
did, with what weight, for how many reps, against what you did last time — and to
keep a streak that survives real life.

---

## What This App Is Now

Until 2026-09 this was a personal-development tracker: a goal ladder engine, a
reading gate, a journal, a 66-day habit run, XP, levels, ranks and a milestone
ladder. All of it was removed at the user's request in favour of one subject done
properly.

What survived is what serves a training log: the exercise library with its
coaching notes and pictures, the weekly plan and the built-in programme, day
status, streaks and freezes, the muscle breakdown, the deload cycle and the
stopping rule, rewards you promise yourself, and export/import.

**Nothing was deleted from anybody's stored data.** The app stopped reading
`goals`, `goalLogs`, `reading`, `journal`, `lines`, `cookies`, `challenges`,
`run` and `habits`; every one of them still rides along in `arise.state.v1` and
in every export. See the invariants in `arise/CLAUDE.md`.

---

## This Is Not A Game

The streak is an **instrument, not the point**. It exists to make a real habit
easier to keep hold of. The moment the number becomes the thing the user is
protecting, the app has started competing with the life it was built to serve.

The test for any feature: *does this tell the user something true about their
training, or does it only move a counter the app invented?*

- A real total is worth more than a synthetic one. "3,150 kg moved" and "61
  sessions you kept" are facts. "238 XP" is a fact about a spreadsheet. The XP,
  levels, ranks and milestone medals were removed for exactly this reason.
- A reward that costs something real — the shoes, the next plate — beats a badge.
  That is why the only rewards left are the ones the user promises themselves,
  and why collecting one grants nothing but the record that they bought it.
- Never invent a number the user did not earn. A bodyweight set is not zero kilos.
  A day the app was never opened is not a day of failure. A gap in the chart is
  not a zero.
- Streaks may never become the app's argument for itself. A streak is context.
  Losing one must never read as a verdict, and protecting one must never be more
  attractive than training well.

---

## The Rules

These are the vision, not implementation detail. No feature may contradict them.

**1. The plan says what was asked; the log says what was done.**

They are separate objects and neither is derived from the other. A plan item
carries the prescription — `3 × 8`, `5 km`, `3 min`. A log entry carries what
actually happened — `60 kg × 8, 8, 6`. Changing tomorrow's prescription must not
rewrite last Tuesday's record, and a set the user logged must not be re-read
through an exercise that has since been edited.

**2. A set carries everything needed to read it back.**

The weight, the unit it was typed in, and the reps. That is what makes switching
between kilos and pounds a *display* choice rather than a re-valuation of
history, and it is what makes a rename or a re-prescription harmless.

**3. Logging is generous in one direction only.**

Filling in the last prescribed set ticks the exercise off, because that is
obviously what happened. Nothing ever un-ticks it — correcting a typo must not
retract a session the user knows they did. Taking it back is their own tap.

---

## Core Modules

A core module is one the application ships today and can be reached by name.

| Module | Where it lives |
|---|---|
| Today | Tab bar — the day's session, with the set log on every exercise |
| Plan | Tab bar — the seven-day training split and the built-in programmes |
| Stats | Tab bar — streaks, top-set charts, heaviest sets, heat map, muscle mix |
| More | Tab bar — units, streak rules, exercise library, rewards, backup |

**The training programme** is content under Plan, not its own screen: two
contexts (site, dumbbells only; home, full gym) each laying down a push/pull/legs
week run twice. Every exercise carries how-to notes and optional pictures,
reachable from any row on Today.

It is a transcription of a document somebody else wrote, and it is treated as
one: `tools/smoke.js` holds the source's own set counts and fails if the file
drifts from them. The app does not get to quietly re-balance somebody's coach.

**Your own rewards** live behind More. A reward is a promise the user makes to
themselves — "fourteen sessions, then the shoes" — tied to the training streak.
It pays out in the real world, so collecting it records that they actually bought
the thing. A reward is earned on the *best* run the streak ever reached, not the
current one, so a slip afterwards cannot revoke something already won.

**Streak freezes** ship under More. A streak that shatters on one bad day teaches
people to quit. A freeze is earned (one per 10 completed days, max 5) and spent
by hand on a specific past day, so it holds the chain without pretending a missed
session happened.

**The rest timer** starts itself when a set is logged and counts the interval the
plan prescribes. It reads that interval out of the plan's own note and invents
none: an exercise that prescribes no rest counts up rather than being handed a
number the app made up. It is never saved — a half-finished rest is not
something the user did.

**The deload cycle and the stopping rule** are the recovery half, and they are
first-class rather than a footnote. Stress plus recovery is adaptation; stress
without recovery is damage. Every feature that raises the standard is only safe
underneath that sentence.

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

**A day you have lived is never re-judged.** Every day's log freezes its own
exercise list, and every set stores its own weight, unit and reps. Editing the
plan, renaming an exercise, changing a prescription or switching the display unit
must never reach back and change what a past day meant.

**Day status is derived, never stored.** Every number is recomputed from the logs
so nothing drifts out of sync. This is why `commit()` must stay O(1), why the
best-streak high-water mark is maintained on read, and why day status is memoised
per revision.

**Stored data is sacred.** Everything lives in `localStorage` on one device and is
never uploaded. A migration must be additive and must tolerate state written by an
older version — including keys this version no longer reads. Backup is More →
Export, and it is the only recovery there is.

**Today is never a failure until it is over.** An unfinished today can extend your
streak; it can never break it.

---

## Target Users

One person tracking their own training.

No coaching knowledge assumed beyond knowing what a set is.

Every screen should be understandable without explanation.

---

## What Is Deliberately Not Built

These are decisions, not gaps. Re-proposing one needs a reason.

- **Alarms and reliable reminders.** A PWA cannot wake anyone: browsers do not run
  timers in the background, and iOS delivers web push to a home-screen install
  unreliably and without timing guarantees. Discipline tracks training; it must
  never imply it gets you to the gym. The reminder setting fires only while the
  app is open.
- **Cloud sync and accounts.** Data stays on the device.
- **Anti-cheat.** Winding the device clock back cannot be prevented offline. The
  app detects it and says so rather than quietly rewarding it.
- **A prescribed weight.** The programme prescribes sets, reps and an RIR target,
  never a load. What you can lift is a fact about you, and the app has no honest
  way to guess it — so the weight field starts from what you did last time and
  from nothing else.
- **An estimated one-rep max.** It is a formula's opinion, not a lift you did.
  The heaviest set you actually performed is a fact and is what Stats reports.

---

## Long-term Vision

Future versions may include

- Cloud sync and multi-device
- Progress photos and body measurements
- Custom training programmes beyond the two built-in splits
