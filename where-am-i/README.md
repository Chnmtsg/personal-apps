# Where Am I

A goal tracker that refuses to store a goal until it has been turned into
numbers.

People set vague goals — "get fit", "improve my English" — and then have no
honest answer when someone asks where they are. This app makes you convert the
goal into measurements first, and then answers three questions every time you
open it:

1. **How far have I come** from where I started?
2. **Am I ahead of or behind** the pace the deadline demands?
3. **At my current speed, where will I actually land?**

Offline, on your device, in your browser. No account, no server, no upload.

---

## The rules it enforces

These are the reasons the app exists, and none of them is a preference:

- **A goal cannot be saved with zero indicators.** A goal without numbers is a
  wish, and it does not reach storage.
- **The baseline is measured, never assumed.** The wizard asks "what is this
  number today?" Starting from zero would show instant progress on a falling
  target and none at all on a rising one.
- **At least one leading indicator.** An indicator you control directly
  (sessions a week) next to the outcomes you can only watch (body weight). A
  goal made only of outcomes gives you nothing to change when you fall behind,
  so saving one takes a second, deliberate press.
- **Progress and pace stay two separate numbers.** 60% done and 20% behind is
  the whole picture; averaging them into one score destroys it.
- **No streaks, badges or confetti.** Nothing here rewards you for opening the
  app.
- **A forecast it cannot support is not shown.** No movement means "no
  movement", not a date in 2098.

---

## The maths

All of it lives in `src/core/math.js`, is pure, and is tested by property
before any of it was drawn on screen.

```
indicatorProgress = (current - baseline) / (target - baseline)
```

Falling targets need no special case: the denominator is negative and so is the
numerator. Clamped to `[0, 1.25]`, so beating a target stays visible instead of
flattening at 100%. If `target == baseline`, it is complete once the number is
reached and 0 otherwise — never a division by zero.

```
goalProgress     = sum(weight * indicatorProgress) / sum(weight)
expectedProgress = (today - startDate) / (targetDate - startDate)     [0, 1]
pace             = goalProgress - expectedProgress
```

| pace | reads as |
|---|---|
| `> +0.05` | ahead |
| within `±0.05` | on track |
| `< -0.05` | behind |
| `< -0.20` | at risk |

The bands are exhaustive and mutually exclusive over every finite number, and
the boundaries themselves count as on track.

```
velocity      = least-squares slope of the last 5 check-ins (min 3), per day
projectedDate = today + (target - current) / velocity
```

A regression rather than first-to-last, so one bad weigh-in cannot rewrite the
forecast. Two check-ins on the same day are a **correction**, not two data
points — the later one replaces the earlier, which is also what keeps the
projection stable when a duplicate is added.

The projection returns a status, never a bare date:

| status | meaning |
|---|---|
| `reached` | the target is already met |
| `projected` | a date worth showing |
| `no-movement` | under three check-ins, flat, or travelling away from the target |
| `beyond-horizon` | moving, but so slowly the date would be meaningless |

---

## Running it

```bash
npm install
npm run dev              # http://localhost:5180
npm test                 # 51 tests: maths, storage, and every screen
npm run build            # icons + dist/
npm run preview:screens  # renders every screen to preview/index.html
```

`npm run preview:screens` exists because there is no browser in the test loop.
It seeds plausible data, renders the real views through the real stylesheets,
and writes a page you can open to see whether anything looks wrong. It ships
nothing.

---

## How it is built

Vanilla JS and Vite. No framework, no chart library, no runtime dependencies.

```
src/core/    pure logic and storage — no DOM
  time.js       day-precision dates; the only clock
  math.js       progress, pace, velocity, projection
  model.js      shapes, defaults, and what may be saved
  db.js         IndexedDB, wrapped in promises
  store.js      the domain layer; the cache the screens read
  exchange.js   export and import
src/ui/      rendering — no storage calls except through store.js
  dom.js        element building, never innerHTML
  svg.js        the ring, the sparkline, the projection chart
  router.js     hash routing
  chrome.js     shared furniture
  format.js     numbers into words
  views/        one file per screen
tools/       icons.js, preview.js, dom-stub.js — development only
```

The layering is not style. `math.js` touching neither storage nor the DOM is
what lets the entire engine be tested under plain Node, and `dom.js` building
nodes instead of concatenating HTML is what makes user text safe without an
escaping rule anyone has to remember.

Charts are hand-rolled inline SVG. Each of the three has a rule a general
library would get wrong: overshoot has to stay visible, a flat line must look
flat rather than be auto-zoomed into drama, and the forecast is drawn against
the deadline rather than beside it.

### Storage

IndexedDB, database `where-am-i`, version 1, three stores: `goals`,
`indicators`, `checkIns`. Migrations live in `db.js#migrate` and are applied in
order — adding a version means adding a case, never editing an old one.

**The data lives in one browser and nowhere else.** Clearing site data loses it.
Each origin is its own storage, so `localhost` data does not follow the app to a
published URL. More → Export is the only backup there is.

`indicator.current` is derived, never edited directly: it is recomputed from the
newest check-in on every write, so deleting a mistyped reading puts the number
back.

### Offline

`public/sw.js` precaches the shell by hand and caches everything else on first
use. There is no generated precache manifest — Vite hashes its filenames, so a
list would be wrong the moment it was not regenerated. Navigation is
network-first (a deployed update is picked up on the next online visit); hashed
assets are cache-first, which is safe precisely because a hashed name can never
be stale.

---

## What is not here

- No sync, no accounts, no sharing.
- No editing an indicator's target after creation. Moving the goalposts
  mid-goal is the thing this app exists to make visible, and the honest way to
  do it is a new goal.
- No reminders or notifications.
