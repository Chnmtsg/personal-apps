# Arise — Personal Development Tracker (PWA)

An offline-first personal development tracker: set goals that progress from **where you actually are**
to a target **you** choose, keep a streak that survives real life, and plan your training week by week.

**It is not a game.** The streak, the XP and the levels are instruments, not the point — the moment the
number becomes the thing you are protecting, the app has started competing with the life it was built
to serve. So the top bar carries days you actually kept rather than a rank, Today ends on facts rather
than a scoreboard, and Stats opens on *31 hours of deep work* before it mentions a level. The test any
feature has to pass is in `knowledge/project.md`: **does this tell you something true about your life,
or does it only move a counter the app invented?**

No build step, no framework, no server, no account. Plain HTML/CSS/JS + a service worker.

---

## Run it

```cmd
serve.cmd            :: http://localhost:8123 (opens your browser)
serve.cmd 9000       :: pick another port
```

or with any static server:

```cmd
npx serve .
python -m http.server 8123
```

> Open it over **http://**, not by double-clicking `index.html`. Service workers, offline
> caching and "Install app" are blocked on `file://`.

**Install as an app:** Chrome/Edge → address-bar install icon. iOS Safari: Share → *Add to Home Screen*.

---

## The progression engine

This is the heart of the app, and it's built around three rules.

### 1. Every goal has a baseline *and* a target

A goal is `start → target`, not `start + step forever`. You wake at 7:30 and want 6:00; the ladder is
six 15-minute rungs and **it stops at the bottom**. A progression with only a step size is a countdown
to failure — at −15 min/week you're being asked to wake at 3:45am by week twelve, and at −30 you hit
midnight by week fourteen. Arise cannot do that: `valueAt(level)` is clamped to the target, and once
you're there the goal switches to maintenance ("Target reached — now just hold it").

### 2. You level up by performing, never because a week passed

The classic version of this idea advances on the calendar: week 1 is 6:30, week 2 is 6:15, whether or
not you managed week 1. That guarantees the app outruns you and everyone fails on a schedule.

Here, a step is **earned**: by default **5 good days out of the last 7** at your current level. Miss a
week and you stay where you are. Miss **3 scheduled days in a row** and you step *back* one rung, so the
app walks back down to meet you instead of leaving you behind. Both numbers are editable per goal, and
the step-back can be switched off.

### 3. Difficulty changes the size of a step, not the rules for earning one

| Mode | Step | 7:30 → 6:00 |
|---|---|---|
| 🌱 Easy | half | 12 rungs |
| ⚖️ Normal | base (e.g. 15 min) | 6 rungs |
| 🔥 Hard | double (e.g. 30 min) | 3 rungs |

Hard gets you there in half the levels — but only if you keep performing. Switching mode **re-scores
your existing record** at the new step size: nothing is wiped, your streak is untouched, and **days you
already completed stay completed** (see below). The next ask can jump, and the app says so.

### Days you completed can never be un-completed

Every logged entry stores the target it was judged against. Change difficulty, move the baseline,
raise the target — a day you finished in March stays finished. Without this, switching to Hard would
silently re-judge your history and break a streak you'd actually earned.

The same principle already governs the workout plan: the first time you touch a day, its exercise
list is frozen into that day's log, so editing next week never rewrites last week.

---

## Streaks that survive real life

- **Grace window.** The day rolls over at **04:00** by default, not midnight. Finishing at 1am counts
  for the night you meant, not the next morning. Configurable 00:00–06:00.
- **Rest days don't punish you.** A goal scheduled Mon–Fri is not "missed" on Saturday; a day with
  nothing scheduled holds the streak.
- **Streak freezes.** One earned per 10 completed days (max 5), spent **by hand** on a specific past
  day. A freeze holds the chain without adding a day to it — no silent magic on a day you missed.
- **Per-goal streaks and an overall streak.** One bad day doesn't wipe every number in the app.
- **Today is never a failure until it's over.** An unfinished today can lift your level; it can't
  drop it.
- **Best streak is a high-water mark.** Clearing or editing an old day never revokes a record.
- **Clock changes are noticed.** Streaks are dated on this device, so winding the clock back is the
  easy cheat. Arise can't prevent it offline, so it detects it and says so instead of quietly
  rewarding it.

---

## Reading: write first, then it counts

The reading goal is **gated on a summary**. You cannot mark it done — there is no tick to press. Writing
the summary is what completes the day, so there's no separate checkbox to fall out of sync with it.

- **Any length counts.** There's no minimum, because a character count only ever buys you `asdfasdf`.
  A rotating prompt does the work instead ("Explain what you read as if to a curious twelve-year-old").
- **The gate is necessary, not always sufficient.** Reading is still a progression goal with a
  minutes ladder, so if you log minutes *below* the day's target the summary is saved and kept but
  the goal reads unmet — the app says so on the form. Leave minutes blank and the summary alone
  carries the day. Without this the ladder would be decorative and reading would level up on any
  day you typed something.
- **The journal is a different thing.** A daily journal (free text + mood) and a reading summary
  (book, minutes, what you took from it) are separate records with separate histories. The **Read** tab
  keeps both.
- Clear the summary and the day goes back to incomplete, honestly.

---

## What's in it

**Today** — **DAY 12 / 66** at the top, then To-dos / Done / Skipped and the day's goals as cards, each
with its ask, its streak and how close the next step is; the day's workout; the reading gate; habits;
and a journal box. Page back with `‹` to backfill.

### The run

A **run** is a fixed length to count against — 66 days by default, because that is the figure the
habit-formation research actually landed on rather than the 21 everyone repeats. It's optional: without
one the counter just counts days since you started, because a finish line you didn't choose is a
deadline, and this app doesn't set deadlines for people.

The bar under the counter carries two numbers on one track, and the distinction is the point: grey is
how much of the run has **elapsed**, orange is how many of those days you actually **kept**. Elapsed
time is not progress, and Arise won't draw it as if it were. Starting a new run archives the old one
rather than deleting it; finished runs keep their record. Start or end one from **More → The run**.

**Plan** — your goals (create, edit, pause, re-baseline) and the seven-day workout split. Whatever you
schedule for Wednesday shows up on Wednesday.

**Read** — today's summary form, the daily journal with mood, and the full archive of both.

**Stats** — **what you've actually done** first: `34 of 41 days kept · 34 training sessions · 14
summaries written`, then the real total per goal — *31 hours* of deep work, *34 days* of getting up
when you said you would. Minutes accumulate into hours; a wake-up time doesn't, because forty mornings
at 06:30 don't sum to anything, so clock goals report days kept and nothing else.

Streaks, level/XP, the goal ladders, an 18-week heat map, weekly goal history and a 30-day training mix
sit below that — deliberately. The app invented XP; it did not invent the hours.

**Rewards** — **your own rewards** first: promise yourself something real ("14 days of workouts → new
sneakers", "30 days of reading → the next book"), tied either to your overall streak or to one goal's
streak. Arise tracks the distance and tells you when you've earned it; collecting it records that you
actually bought the thing. No XP for that one — inventing points for buying yourself trainers is the
kind of unearned number this app refuses to show. A reward is earned on the **best** run the streak
ever reached, so a slip afterwards can't take back something you already won.

Below that: 11 streak milestones from *Ignition* (3 days) to *Year of Arising* (365), a weekly chest,
XP, levels and a rank ladder.

**More** — difficulty, streak rules (rollover hour, freezes, whether goals count toward the day),
reminders, the exercise library, habits, and export / import / reset.

### Seeded goals

Wake up · Lights out · Read (gated) · Meditate · Deep work (weekdays). Cold shower and Water ship
disabled as examples. Add your own in any of seven areas with seven unit types (clock time, minutes,
count, pages, km, litres, seconds).

Bedtimes that cross midnight are handled: with `wrapAt`, 00:30 is correctly *later* than 23:30 rather
than numerically smaller.

---

## The built-in training program

Arise ships with a six-day dumbbell split, and every exercise carries its own coaching notes —
tap **ℹ️** on any row in Today to see how to perform it, what to aim for, and what to avoid.

An earlier version led that sheet with a generated stick-figure animation. It was removed: a figure
that abstract could not tell its own movements apart — every upright pose rendered as the same
vertical stroke — and a demonstration you cannot trust is worse than none. Written cues carry what
actually matters anyway: setup, tempo, and what to avoid.

| Day | Focus |
|---|---|
| Mon / Fri | Chest + shoulders + triceps |
| Tue / Sat | Back + biceps + rear delts (Saturday adds core) |
| Wed / Sun | Legs + calves + core |
| Thu | Recovery — walk, light mobility, full-body stretch |

Two decisions shape how it appears in the app.

**Warm-ups and stretches are one row, not ten.** A day counts as complete only when every item on
it is ticked, so listing seven separate arm-circle rows would bury the six lifts that actually
matter and make finishing a day an exercise in tapping. Each day gets a single `Warm-up` and
`Stretch` item, with the whole sequence in its how-to notes. Nothing is lost.

**Rep ranges are shown as ranges.** A plan item carries an optional `repsMax`, so Monday's floor
press reads `4 × 8–12` rather than being flattened to a single number that misstates the ask.

Installing it on an existing account is additive where it can be and honest where it can't: an
exercise you already had keeps your name, sets and reps and merely gains the notes it was missing,
nothing is ever deleted, but **the weekly template is replaced** — that is what installing a
program means. No logged day changes, because the first time you touch a day its exercises are
frozen into that day's log. It runs exactly once, tracked by a flag, so a plan you rebuild
afterwards is never overwritten by a later update.

---

## What a PWA can't do

Arise **tracks** your wake-up; it cannot wake you. Browsers don't run timers in the background, and iOS
only delivers web push to a home-screen install, unreliably and without timing guarantees. The reminder
setting sends a browser notification when the app is open and the day is nearly over — that's the
honest limit. Keep using your phone's alarm.

Everything lives in `localStorage` under `arise.state.v1` on your device — nothing is uploaded. Use
**More → Export** for a JSON backup. Clearing your browser's site data wipes the app; export first.

If Arise ever finds saved data it cannot read, it does **not** quietly start over. The unreadable bytes
are copied to `arise.state.v1.unreadable` and verified before anything is allowed to overwrite them, and
Today shows a banner offering two routes: restore from a backup, or download the unreadable copy so the
data leaves the device even though the app cannot parse it. If that copy cannot be made, Arise refuses to
write at all rather than replace your only data with a blank app.

The same goes the other way. If a write is refused — storage full, or private browsing blocking it — Arise
says so in a banner and offers an export, instead of showing you green ticks for a day that was never
saved. And because saving is debounced by a fraction of a second, a pending write is forced out when the
app is backgrounded or closed, so the last tap of the day cannot be lost to a timer that never ran.

---

## Layout

```
arise/
  index.html              app shell
  styles.css              design tokens + all views (dark, light-aware, mobile-first)
  manifest.webmanifest    PWA manifest
  sw.js                   service worker — offline app shell
  js/data.js              dates, grace window, clock maths, seeds, modes, units, milestones
  js/program.js           the built-in 6-day dumbbell program + how-to notes
  js/goals.js             the progression engine — pure, storage-free, node-testable
  js/store.js             state, persistence, streaks, freezes, reading/journal, XP
  js/ui.js                view rendering + sheets/toasts/confetti
  js/app.js               event wiring, celebrations, reminders, install prompt, SW
  icons/                  generated PNG + SVG icons
  tools/make_icons.py     regenerates the PNG icons (needs Pillow)
  tools/smoke.js          data + engine tests
  tools/render.js         renders every view and sheet against a stub DOM
  serve.cmd               local HTTP server
```

## Tests

```cmd
node tools\smoke.js     :: 251 assertions — progression, streaks, freezes, gating, migration, storage recovery
node tools\render.js    :: 108 checks — every view, sheet and programmed day
```

`smoke.js` covers the ladder maths (floor, caps, all three modes), earned-not-granted advancement,
step-back, mode switching, frozen judgements, frozen schedules, midnight-crossing bedtimes,
non-daily schedules, the reading gate, freezes, clock tampering, XP that never claws back, and
v1 → v2 migration. It also holds the line on the two ways a lived day used to get re-judged —
pausing a goal and re-baselining one — and on the storage recovery paths: unreadable data is
quarantined before anything overwrites it, a refused write is announced rather than swallowed,
and a pending write can be flushed.

`render.js` runs the whole view layer against a stub DOM and fails on anything that renders
`undefined`, `NaN` or `[object Object]`. It also asserts that the confirm and prompt sheets
resolve correctly — that cancelling never runs the confirm branch, and that a dismissed
confirmation cannot fire later against a different sheet.

### A note on performance

Day status is derived, never stored, so every number in the app is always consistent with the logs. That
means `commit()` must stay O(1): the best-streak high-water mark is maintained on *read*, not on every
tap, and both day status and goal timelines are memoised per revision. On a synthetic two-year account
(730 days × 5 goals) a tap plus a full re-render is ~50ms, and a warm re-render ~11ms.
