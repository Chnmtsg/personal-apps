# Coding Standards — Arise

## General

Always write readable code.

Never optimize prematurely.

Keep functions small.

One responsibility per function.

Avoid duplication.

Use meaningful names.

Write code that reads like the code around it — match the surrounding comment
density, naming, and idiom.

---

## Comments

Comment to state something the code cannot: a constraint, a reason, a non-obvious
consequence.

Never comment to narrate what the next line does, or to record that a change was
made. That is a note to the reviewer, and it is noise once merged.

The comments worth writing here explain *why a rule exists* — why a target is
frozen, why a cache is cleared, why a heuristic only runs for new goals.

---

## No Build Step

This is vanilla HTML/CSS/JS on purpose. There is no bundler, no transpiler, no
typechecker, and no dependencies.

Keep it that way. Adding a build step is an architectural decision that needs
raising first, not a convenience to reach for.

Write for browsers as they are: plain ES2020, no imports, no JSX, no framework.

---

## Modules

Each `js/` file is a classic script wrapped in an IIFE that hangs one namespace
off `window`: `Arise`, `Store`, `UI`.

Load order is fixed and load order is a dependency graph:

`data.js` → `program.js` → `goals.js` → `store.js` → `ui.js` → `app.js`

Never reach backwards in that order. `goals.js` must not know about storage;
`data.js` and `program.js` must stay pure data and pure helpers.

Adding a file means updating four places: `index.html`, `sw.js` ASSETS, and the
load lists in `tools/smoke.js` and `tools/render.js`.

Avoid globals beyond those three namespaces. Module-private state stays inside the
IIFE.

---

## Layers

| File | Responsibility | Must not |
|---|---|---|
| `data.js` | dates, clock maths, constants, seeds | touch storage or the DOM |
| `program.js` | the built-in training program, as data | contain logic |
| `goals.js` | the progression engine, pure functions | touch storage or the DOM |
| `store.js` | state, persistence, streaks, XP | touch the DOM |
| `ui.js` | rendering, sheets, toasts | write state directly |
| `app.js` | event wiring, celebrations, service worker | render HTML |

`goals.js` being storage-free is not style. It is what lets `tools/smoke.js` test
the whole engine under plain Node.

---

## State and Migrations

All state is one object in `localStorage` under `arise.state.v1`, versioned by
`STATE_VERSION` in `store.js`.

Every migration must be additive and must tolerate state written by an older
version.

Never delete or overwrite user data in a migration. A one-time change must be
guarded by its own flag, not by the version number alone, so re-running a later
migration cannot undo something the user has since edited.

Read an incoming flag *before* merging seed defaults over it, or the default will
mask the real value.

---

## Dated History

Resolve a past day from a dated history, never from a goal's current value.

Anything that decides what a day *asked of the user* — its schedule, whether the
goal was active, which baseline it ran from — must be answered for the date being
scored, not read off the goal as it stands today. A goal attribute read directly
while scoring a past day is the bug, every time: pausing a goal used to drop it
from every day already lived, turning a half-kept day complete and inflating a
best streak that can never be revoked.

`scheduleHistory` is the pattern. `activeHistory` and `baselineHistory` follow it,
and so must the next attribute: a list of `{ from, … }` in ascending date order,
resolved by walking to the last entry on or before the date. Goals written before
the history existed have none and fall back to their current value, which is the
old behaviour exactly.

Migrating an attribute into a dated history must never guess a date it does not
have. Grandfather it to whatever reproduces the history that account already
computes, so the fix itself moves nobody's past.

---

## Rendering

Escape every piece of user text with `esc()` before it reaches `innerHTML`. Goal
names, exercise names, habit names and journal text are all user-controlled — and
that includes toasts, not just views.

Derive, do not store. If a number can be computed from the logs, compute it.

Keep derived work memoised per revision rather than caching values that can drift.

---

## Error Handling

Handle errors where you can do something about them.

Never swallow an error silently, and never leave the user looking at a screen with
no explanation.

Validate and clamp every numeric input. An empty field, `NaN`, and a hostile value
must all land somewhere sane.

---

## Tests

Two suites, run from `arise/`:

```bash
node tools/smoke.js     # data layer + progression engine, fake localStorage
node tools/render.js    # every view, sheet and programmed day, stub DOM
```

Cover the logic where a mistake is silent: ladder maths, earned advancement,
step-back, frozen history, streaks and freezes, migrations.

A test asserts behaviour a user depends on. Name it after that behaviour, not
after the function.

When fixing a bug, add the test that would have caught it — then break the fix on
purpose once and confirm the test fails. A regression test that has never failed
has not been shown to work.

`render.js` runs against a hand-rolled stub DOM. `document.activeElement`,
`document.contains`, `getClientRects` and `isConnected` do not exist on it. Guard
any new DOM API so the stub degrades instead of throwing.

Neither suite loads `app.js`, so click routing has no automated coverage. Say so
when a change lands there.

---

## Shipping

After changing `styles.css` or anything in `js/`, bump `VERSION` in `sw.js`. The
fetch handler is cache-first; without a new version an installed copy keeps
serving the old shell.

---

## Project Rules

Never modify unrelated files.

Never break existing functionality.

Always preserve backward compatibility — including the shape of data already
written to a user's device.

Always explain major changes.
