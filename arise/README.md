# Discipline — Training Log (PWA)

An offline-first training log for one person, on one phone. A weekly plan, and a
record of every set you actually did: the exercise, the weight, the reps, and
what it was last time.

Vanilla HTML, CSS and JavaScript. No build step, no bundler, no framework, no
dependencies, no server, no account, and no network calls of any kind. Your data
lives in `localStorage` on your device and is never uploaded anywhere.

> **It used to be more than this.** Until 2026-09 Discipline was a
> personal-development tracker: a goal ladder engine, a reading gate, a journal,
> a 66-day habit run, XP, levels and ranks. All of it was removed in favour of
> one subject done properly. **Nothing was deleted from stored data** — the app
> stopped reading those keys, it did not drop them, and they are still in every
> export. The code is on `master` in the commit before the conversion.

---

## Run it

Serve over `http://`, never `file://` — service workers and install-to-home-screen
are blocked on `file://`.

```bash
cd arise
serve.cmd          # http://localhost:8123
```

Use `serve.cmd` rather than `python -m http.server`: the latter sends no cache
headers, so the browser caches `sw.js` and never notices a new build.

Live at **https://chnmtsg.github.io/personal-apps/**.

---

## The set log

This is the whole app. Every exercise on Today is a card, and every card takes
numbers.

```
✓  Dumbbell Floor Press                    3 × 8
   chest · triceps · front delts — 2 min rest
   ─────────────────────────────────────────────
   1   30 kg × 8                              ✕
   2   30 kg × 8                              ✕
   3   30 kg × 6                              ✕
   ─────────────────────────────────────────────
   [ 30 ] kg   ×   [ 8 ] reps        [ Log set ]
   690 kg moved
   Last time · Thu, Sep 3 · 27.5 kg · 3 × 8, 8, 7
```

**The boxes are already filled in.** With what you lifted last time, or with the
set you just typed above it, or — if you have never done the lift — with the
plan's own prescription. The screen says which of the three it used. Logging a
set is usually confirming a number rather than typing one.

**Tap a set to correct it.** The row loads back into the boxes and the button
becomes *Update*. The ✕ removes it and offers an undo.

**Filling in the last prescribed set ticks the exercise off.** Nothing ever
un-ticks it for you — correcting a typo must not retract a session you know you
did. Taking it back is your own tap on the tick.

**A blank weight is a bodyweight set**, not a zero-kilo one. Eight chin-ups are
eight reps and no load; they count toward your reps and your sets, and nothing
toward the weight you moved.

**Cardio and holds ask for what they are measured in.** A run takes kilometres
and minutes; a plank takes minutes. Only rep exercises get set rows.

### The rest between sets

Logging a set starts the rest. There is no button to press, because a timer you
have to remember to start is a timer nobody starts.

The interval comes out of the plan's own note — `rest 90 s`, `rest 2–3 min` —
and the strip above the tab bar counts it down, filling as it goes and buzzing
once when it is up. A range counts to its **lower** bound: that is when the rest
is over and you may start again, not how long you are allowed to take. Past it
the clock keeps going (`+0:20`), so "how long have I been standing here" stays
answerable.

An exercise whose note prescribes no rest **counts up instead**. The app will not
invent an interval nobody wrote down.

The timer is not saved. Close the app mid-rest and it is gone, because a
half-finished rest is not something you did. Switch it off in More → Training
if you would rather it stayed quiet.

Same honesty as everywhere else in here: it counts from the clock rather than by
ticking, so a phone that locks mid-rest still shows the right number when you
come back — but the buzz only happens if the app is in front of you. A web
app cannot get your attention when it is not on screen, and this one will not
pretend otherwise.

### Kilograms or pounds

Every set stores the number you typed **and the unit you typed it in**. So
switching the display unit in More re-reads your history rather than re-valuing
it — nothing stored moves, no round number becomes 60.01, and a history with both
in it reads correctly either way.

---

## What is never re-judged

A day you have lived is fixed the moment you open it.

- The day's exercise list is **frozen into that day's log** the first time you
  touch it, so editing the weekly plan changes tomorrow and nothing already lived.
- A set stores its own weight, unit and reps, so renaming an exercise, changing
  its prescription, or switching what it is measured in leaves every set you
  already logged exactly as it was.

This is the rule the whole app is built on. It is also the easiest one to break
without anybody noticing, which is why `tools/smoke.js` asserts it by name.

---

## Streaks that survive real life

A streak that shatters on one bad day teaches people to quit.

- **Rest days keep the chain.** A day with nothing scheduled does not break it
  (switchable).
- **A day counts as complete at a threshold you choose** — 60%, 80% or 100% of
  what was scheduled.
- **The day rolls over at 4am by default.** A session logged at 1am belongs to the
  night before.
- **Streak freezes.** One earned per 10 completed days, up to 5. You spend one by
  hand on a specific past day. It holds the chain without pretending the session
  happened.
- **"Never miss twice."** After a broken day, while today is still open and still
  asks for something, Today says so — as a fact and a next action, never as a
  reprimand.

---

## What's in it

### Today

The day's session. The set log above, plus the seven-day rail (tap any day to
open it), the day counter, your streak, and a strip pinned above the tab bar
carrying the next exercise by name.

### Plan

The seven training days. Add, reorder or remove exercises on any weekday, copy
one day onto another, and install either built-in programme.

A **deload cycle** can be switched on — every Nth week, cut every working set by
about 40%. Stress plus recovery is adaptation; stress without recovery is damage,
and the recovery half is a first-class part of this app rather than a footnote.

Plan also carries the **stopping rule**, because the source material gives none:
sharp pain, joint pain, chest symptoms, dizziness or numbness stop the session;
performance falling while effort rises, three broken nights, an injury that will
not resolve, or losing interest mean the block gets reassessed.

### Stats

Everything recomputed from your logs, and nothing invented.

- What you have actually done: days kept, exercises done, sets logged, reps, and
  total weight moved.
- **Top set per session**, one small chart per lift, over 90 days. One column per
  session and nothing at all for the days between — a gap in the record is not a
  zero, and a line across it would invent a climb that never happened.
- **Heaviest set** per exercise, with the date.
- An 18-week heat map, the muscle breakdown over a window you pick, the training
  mix by category, and sessions a week against your target.

There is no XP, no level and no rank. They were removed: a real total outranks a
synthetic one, and "3,150 kg moved" is a fact where "238 XP" is a fact about a
spreadsheet.

### More

Weight unit, sessions a week, the deload cycle, streak rules, the day boundary,
the exercise library, rewards, and backup.

**Your own rewards.** A promise you make to yourself — "fourteen sessions, then
the shoes" — tied to your training streak. It pays out in the real world, so
collecting it records that you actually bought the thing, and it is earned on the
*best* run your streak ever reached, so a slip afterwards cannot take it back.

**The exercise library.** Every exercise carries a category, what it works
(nineteen muscle groups, and the totals overlap on purpose — a deadlift is back
and legs and glutes), how-to notes, and optional pictures you add from your own
photo library. Pictures live in IndexedDB and travel in the backup.

---

## The built-in training programme

Two contexts. The app stores **one** weekly plan, so these are alternatives
rather than a pair — you are on site or you are at home, never both.

**Context 1 — site (dumbbells only).** Mon Upper A, Tue Lower A, Wed rest,
Thu Upper B, Fri Lower B, Sat accessory, Sun rest.

**Context 2 — home (barbell).** The same pattern, assuming a barbell, a rack with
pins, a bench and a bar to hang from. That assumption is stated in the app, along
with the rows to swap if your setup differs.

Two things are **drafted rather than supplied**, and the app says so where you
read it:

- **Saturday, in both contexts.** The source document lists an accessory session
  and points at a section that never arrived. It was built from what the other
  four days leave out — arms and rear delts get one exposure each per week, grip
  and forearms none. It is the lightest day on purpose: it sits between Lower B
  and a rest day, and a fifth hard session there would eat the recovery that makes
  the other four work.
- **The whole home context.** The document described one context and never a
  second.

Installing a programme **replaces the weekly plan and never touches a logged
day**. The library is additive: an exercise you already have keeps your name,
sets and reps, and only gains the coaching notes it was missing.

---

## What a PWA can't do

Being straight with you: a web app **cannot** be an alarm clock. Browsers do not
run timers in the background, and iOS delivers web notifications to a
home-screen install unreliably and without timing guarantees. Discipline tracks
your training; it cannot get you to the gym. Keep using your phone's alarm.

The reminder setting fires only while the app is open, near the day rollover.

**Each origin is its own storage.** Data on `localhost:8123` does not follow the
app to the published URL — `localStorage` is per-origin. Export from More →
Export on the old origin and import on the new one.

---

## Layout

```
index.html              the shell — links the stylesheet and six scripts, nothing inlined
styles.css              design tokens and every view
sw.js                   service worker, offline app shell
manifest.webmanifest    PWA manifest
fonts/                  three Archivo .woff2 cuts, shipped with the app
icons/                  generated PNG and SVG icons
js/
  data.js               dates, the set vocabulary, seeds
  program.js            the two built-in programmes, as data
  photos.js             exercise pictures (IndexedDB)
  store.js              state, persistence, the set log, streaks
  ui.js                 rendering, sheets, toasts
  app.js                event wiring, service worker
knowledge/              project references — read these before changing anything
tools/                  the three test suites and the packager
serve.cmd               local HTTP server
```

---

## Tests

```bash
npm test          # smoke.js, render.js, wire.js
npm run package   # → dist/, exits non-zero if the package is unshippable
```

- **`smoke.js`** loads `js/` into a sandbox with a fake `localStorage` and asserts
  the data layer: the set log, volume, unit conversion, the prefill from the last
  session, frozen history, streaks, freezes, the programme, and every migration —
  including that nothing the removed features stored has been thrown away.
- **`render.js`** renders every view, sheet and programmed day against a stub DOM,
  failing on anything that renders `undefined`, `NaN` or `[object Object]`. It
  also carries the escaping, emoji and design-token guards, and asserts that every
  state class the views emit is actually styled.
- **`wire.js`** drives `js/app.js` through its real click router: typing a weight
  and some reps and pressing Log set has to arrive in the store, and every
  `data-act` the views emit is cross-checked against the handlers that exist.

There is no build step and no typechecker. These three scripts are the whole
safety net.

### A note on performance

Day status is memoised per revision, and `commit()` is O(1). Every number in the
app is derived from the logs rather than stored, which is what keeps them from
drifting out of sync — but it means the derivations have to stay cheap. If you
add one that walks every day since install, memoise it the same way.
