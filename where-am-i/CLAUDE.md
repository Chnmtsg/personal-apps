# Where Am I — working guide

Read `README.md` first. It carries the maths, the layering and the storage
contract. This file is only the things that must not be broken, and the reasons.

---

## Invariants

**The gate holds.** A goal reaches storage only through
`model.js#validateGoalDraft`. Validation lives there, not in the wizard, so that
import cannot smuggle in a goal the wizard would have refused. A new rule goes
in that function.

**`math.js` stays pure.** No storage, no DOM, no clock of its own — `today` is
always passed in. It is what lets the whole engine be tested under Node, and it
is the first thing a hurried change breaks.

**Progress and pace are never merged.** Not in a view, not in a summary, not in
a sort order. Two numbers, always.

**A forecast the data does not support is not shown.** `projection` returns a
status. Adding a fifth status is fine; returning a date when the trend runs
away from the target is not.

**`indicator.current` is derived.** It is recomputed from the check-ins on every
write in `store.js#deriveCurrent`. Nothing else may assign to it, or deleting a
mistyped reading stops putting the number back.

**Storage is the user's only copy.** `arise.state.v1`'s lesson applies here too:
the IndexedDB name, version and store names are load-bearing. Changing them
without a migration in `db.js#migrate` orphans every goal, check-in and streak
of history, with no recovery — there is no server-side copy.

**Never `innerHTML`.** `dom.js` builds nodes and sets `textContent`. Goal
titles, units and notes are user text and there is no server to sanitise them.

---

## Layers

| File | Responsibility | Must not |
|---|---|---|
| `core/time.js` | day-precision dates | anything else |
| `core/math.js` | progress, pace, velocity, projection | touch storage, the DOM, or the clock |
| `core/model.js` | shapes, defaults, validation | touch storage or the DOM |
| `core/db.js` | IndexedDB | know what a goal is |
| `core/store.js` | domain operations, the cache, events | touch the DOM |
| `core/exchange.js` | export and import | write to storage itself |
| `ui/*` | rendering and wiring | reach past `store.js` to `db.js` |

Never reach backwards through that table.

---

## Verifying

Run from `where-am-i/`. Never report a change as done without these.

```bash
npm test                 # maths (property-based), storage, and every screen
npm run build            # icons + dist/; fails loudly if the bundle will not build
npm run preview:screens  # look at it — the tests have no layout
```

`test/math.test.js` is property-based over the engine. `test/store.test.js`
drives the real IndexedDB semantics through `fake-indexeddb`.
`test/views.test.js` renders every screen against `tools/dom-stub.js` and fails
on any screen that prints `undefined`, `NaN` or `[object Object]`.

There is no typechecker. Those three files are the whole safety net, so a change
they cannot cover needs saying so out loud.

---

## Traps

- **The stub DOM has no layout.** A passing `views.test.js` says the screen
  renders, not that it looks right. Use `npm run preview:screens`.
- **Headless Edge on this machine never completes an IndexedDB request**, so a
  screenshot of the live app comes back blank. That is the harness, not the app.
  The preview page is the way to see the screens.
- **The wizard draft is module state on purpose.** Walking away from step three
  and coming back keeps the work. Tests that want a clean wizard have to cancel
  out of the old one.
- **The check-in screen keeps its own draft** for the same reason: the screen
  redraws on every store change, and a redraw must not empty boxes the user has
  just filled.
