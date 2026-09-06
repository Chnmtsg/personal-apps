# Coding Standards — Discipline

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

The comments worth writing here explain *why a rule exists* — why a set carries
its own unit, why a cache is cleared, why logging can tick a row but never
un-tick one.

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

`data.js` → `program.js` → `photos.js` → `store.js` → `ui.js` → `app.js`

Never reach backwards in that order. `data.js` and `program.js` must stay pure
data and pure helpers.

Adding a file means updating four places: `index.html`, `sw.js` ASSETS, and the
load lists in `tools/smoke.js` and `tools/render.js`.

Avoid globals beyond those three namespaces. Module-private state stays inside the
IIFE.

---

## Layers

| File | Responsibility | Must not |
|---|---|---|
| `data.js` | dates, the set vocabulary, constants, seeds | touch storage or the DOM |
| `program.js` | the built-in training programmes, as data | contain logic |
| `photos.js` | the exercise picture store (IndexedDB) | touch app state |
| `store.js` | state, persistence, the set log, streaks | touch the DOM |
| `ui.js` | rendering, sheets, toasts | write state directly |
| `app.js` | event wiring, celebrations, service worker | render HTML |

`data.js` holding the whole set vocabulary — `fmtLoad`, `setVolume`,
`describeEntry`, `targetPhrase`, `convertWeight` — is not style. It is what lets
both `tools/smoke.js` and `tools/render.js` reason about a set without loading
storage or a DOM, and it is why the same sentence renders identically wherever it
appears.

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

## Frozen History

Resolve a past day from what that day recorded, never from what the library or
the plan says now.

Two mechanisms carry this, and every new one must follow them:

- `ensureLog` freezes the day's exercise list into `log.plan` the first time the
  day is opened, and `dayPlan` answers from that copy. Editing the weekly
  template afterwards changes tomorrow and nothing already lived.
- A set stores its own `w`, `u` and `r`. Nothing about the exercise it belongs to
  is needed to read it back, so a rename, a re-prescription, a change of unit or
  a change of measurement shape leaves it exactly as it was.

`describeEntry` is the rule in miniature: it reads the ENTRY and not the
exercise. Asking the exercise's *current* shape for `perf.min` on a day that
recorded rep sets printed `NaN min`, and the fix was to describe what is
actually stored.

Anything new that decides what a day *asked of the user* must be answered from
the day's own record. Reading it off the live object is the bug, every time.

---

## Rendering

Escape every piece of user text with `esc()` before it reaches `innerHTML`.
Exercise names, plan notes, per-exercise notes and reward names are all
user-controlled — and that includes toasts, not just views.

A view reads and returns a string. It never writes. Anything that mutates is an
event owned by `app.js`; a write inside a render is also a hang, because the
commit notifies the view that re-renders that writes again.

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

Three suites, run from `arise/`:

```bash
node tools/smoke.js     # data layer + the set log, fake localStorage
node tools/render.js    # every view, sheet and programmed day, stub DOM
node tools/wire.js      # js/app.js through its real click router
```

Cover the logic where a mistake is silent: volume and unit conversion, the
prefill from the last session, frozen history, streaks and freezes, migrations,
and that nothing a removed feature stored has been thrown away.

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
