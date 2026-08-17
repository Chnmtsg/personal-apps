# Handoff

Written at the end of a long session, for whoever picks this up next. Read it
before touching anything. Everything here is a decision already made, a trap
already sprung, or a question nobody has answered yet.

This replaces the previous arise-only handoff. Its traps and product direction
are carried forward below; its numbers are not — it predates about twenty
commits.

---

## 0. Read this first: it is pushed now, and the branch matters

**Remote: https://github.com/Chnmtsg/personal-apps — public.** All six branches
are pushed and the default is `arise-discipline-redesign`, which is where the
app is. Commits are authored as `Chnmtsg` through the GitHub noreply address,
set repo-locally so a real address is not published on a public repo.

Public was the user's explicit decision, asked and answered. The repo carries
their real skincare routine, sleep and wake times, training programme and habit
list as seed data. No key is in it — all 149 tracked files and the full history
were scanned before the first push — and `.gitignore` now covers the patterns
that would hold one. It did not exist before; nothing bad had reached the repo,
but that was luck rather than a rule.

```
master                              a2e6480   the base everything forks from
├─ repo-docs-three-projects         134abfa   root CLAUDE.md: three projects, not two
│  ├─ arise-discipline-redesign     8bccd6e   ALL the arise work — the default branch
│  └─ life-reset-habit-recommender  8173ae3   4 commits — the Python engine work
└─ english-feedback-app-review-fixes da9951a  pre-existing, untouched this session
```

`arise-discipline-redesign` is where the app is. **`master` is 17 commits
behind and still has the pre-rename app**: no Discipline branding, no 66-day
run, no habit picker. Check out `master`, serve it, and you are looking at
something months old. It was pushed as-is rather than fast-forwarded, because
nobody has said whether anything still builds from it.

**The most important open question, asked three times and never answered:** the
user has an existing Netlify site and nobody knows which branch it builds. If it
builds `master`, none of this session's work is deployed — which would account
for a long run of "it didn't connect" reports that turned out to be part real
bug, part stale build. Ask before debugging anything reported about the live
site.

**If the origin changes, every existing user starts empty.** `localStorage` is
per-origin; goals, logs, streaks and journal do not follow a domain move. The
only bridge is More → Export on the old origin, Import on the new one.

---

## 1. State of the tree — `arise-discipline-redesign`

```bash
cd arise
npm test          # smoke 390, render 167, wire 29 — all green
npm run package   # → dist/, exits non-zero if the package is unshippable
serve.cmd         # http://localhost:8123
```

- `sw.js` VERSION → **`discipline-v45`**
- `js/` is **seven** files, loaded in this order:
  `data.js` → `program.js` → `goals.js` → `run.js` → `store.js` → `ui.js` → `app.js`
- `tools/` is `smoke.js`, `render.js`, `wire.js`, `package.js`, `serve.py`,
  `make_icons.py`, `shot.html`
- `STATE_VERSION` is **4** — `arise.state.v1` gained a `run` key, default `null`
- Nothing is half-finished. No stashed edits.

Uncommitted, none of it mine, none of it blocking:
`arise/.claude/scheduled_tasks.lock` (deleted), `reports/arise-2026-08-10/`
(untracked), `arise/arise-redesign/` (untracked — see §4).

---

## 2. What this session built in arise

**Discipline.** Every string the user sees is renamed. The `arise/` folder, the
`window.Arise` globals and the `arise.state.v1` key deliberately did **not**
move — renaming the storage key orphans every user's data with no recovery.

**Reach.** Five tabs (Rewards moved under More). A goal card is worked with the
whole card rather than the tick in its corner: swipe right to keep, left to
skip, press and hold to log part of it. Today ends in a fixed strip carrying the
next thing and one tap. Toasts carry UNDO for five seconds.

**Netlify.** `netlify.toml` at the repo root (`base = arise`,
`command = node tools/package.js`, `publish = dist`). `arise/_headers` carries
the cache policy and a CSP that enforces the app's own no-network invariant at
the browser. `tools/package.js` copies the runtime set byte for byte — **it is
not a build step and must never become one** — and fails the build when `sw.js`
ASSETS and `index.html` disagree about `js/`.

**The 66-day run** (`js/run.js`), a port of the `life-reset` Python engine,
sitting *beside* `goals.js` and sharing nothing with it. The Architect and
Adaptation agents were dropped: both need a language model, and this app makes
no network calls. What crossed over is the deterministic fallback each already
had.

- a 25-habit closed catalog, three phases, feasible-by-construction on all 66 days
- checklist habits — `vitamins`, `skincare`, `skincare_pm` — whose dose is a
  list of named items rather than a number, editable per run
- a habit picker, with a "start everything on day one" toggle that is on by
  default and opts out of the two ease-them-in rules while keeping the budget
- the day record: what each day asked, frozen when the day opened
- `runCountsTowardDay` — a kept run day counts toward the streak
- `tools/wire.js`, a third suite that drives `js/app.js` through its click router

---

## 3. State of `life-reset-habit-recommender`

Python, no dependencies, no network, no UI. `life-reset/STATUS.md` is the honest
inventory and is current — read it rather than `README.md` / `AGENTS.md`, which
are a specification written before the code and describe more than exists.

```bash
cd life-reset
python tests.py          # 126
python eval_harness.py   # 2,000 users, zero invariant violations
python demo_program.py   # read the output; it catches what neither suite can
```

Added this session: four self-care habits, an `add`/`advance` recommender,
`state.py` (schema 3 — the stored shape, no I/O), `session.py` (`where`,
`check_in`), a `resume` op, seventeen adversarial Adaptations, partial credit.

---

## 4. Open, in priority order

1. **Confirm the Netlify branch and origin.** §0. Blocks everything about the
   live site.
2. **Custom habits.** The user asked twice to "add and edit things in the
   catalog". Checklist *items* are editable; the catalog of *habits* is closed,
   and that closedness is what makes an unknown id a dropped habit rather than a
   crash on day 41. User-defined habits need a per-run habit table and a story
   for what `validate` does with something that has no catalog entry. It is a
   design decision, not a toggle.
3. **The exfoliation schedule.** Decided, not built. The user's Mon/Thu toner
   cadence is to be a *goal*, not a run habit — `goals.js` already does weekday
   schedules and `run.js` assumes every habit is daily. Nothing was created for
   them: Plan → new goal, schedule Mon/Thu, baseline 2/week → target 3/week.
4. **`arise/arise-redesign/`** — a complete stale copy of `js/` and `styles.css`
   inside `arise/`. Its design was applied and committed long ago. Deleting it
   was offered twice and never authorised; it is exactly the duplicate-snapshot
   hazard §6a is about.
5. **life-reset:** no store, deliberately — `state.py` decides the shape, where
   the bytes go is the caller's. `diagnose` ignores `did`, so somebody doing 80%
   every day looks identical to somebody doing nothing.

---

## 5. How to work here

- **Run all three suites.** `npm test` runs them. `smoke.js` is the data layer,
  `render.js` the views, `wire.js` the click router. The third exists because
  neither of the others loads `js/app.js` at all.
- **Adding a `js/` file touches four places:** `index.html`, `sw.js` ASSETS, and
  the load lists in `smoke.js` and `render.js`. `package.js` cross-checks the
  first two and fails the build when they disagree.
- **Bump `sw.js` VERSION** after any change to `styles.css`, `js/` or `fonts/`.
- **Serve with `serve.cmd`**, which runs `tools/serve.py` (no-store on
  everything). Never `python -m http.server` — see §6.
- Read the invariants in `arise/CLAUDE.md` before touching the run, the record or
  the streak. Each is written as a rule with the bug that produced it.

---

## 6. Traps sprung this session — do not repeat these

- **A class applied is not a style that exists.** `.pick:has(:checked)` survived
  the markup changing from a label-and-checkbox to a button carrying `.on`. The
  chosen habit had the class, had `aria-pressed="true"`, and passed a render test
  that asserted the class — while looking identical to an unchosen one for four
  commits, during which the user was told it worked. `render.js` now asserts the
  stylesheet has a rule for every state class the run UI emits. **A test that
  checks markup has not checked appearance.**
- **`js/app.js` is invisible to two of the three suites.** A stray newline inside
  a string literal left it unparseable while smoke and render both reported
  green — and a syntax error takes the whole file, so nothing wires up and the
  app is dead on open. That is what `wire.js` is for. Run it.
- **The service worker will serve a stale app for days.** Fixed two ways:
  `register(..., { updateViaCache: 'none' })`, because the browser will otherwise
  serve `sw.js` *itself* from HTTP cache and `update()` re-reads the old worker;
  and `tools/serve.py`, which sends `no-store`. Neither rescues a client already
  stuck — that needs one manual unregister. More now prints the running build, so
  "nothing happened" can be told apart from "I am on v26".
- **Line-based Python surgery destroyed a file.** `s.split("\r\n")` on a file with
  LF endings returns one element; the index search then matched at 0 and the
  delete took all of `js/run.js`. It was restored from the last commit and redone.
  **Use the Edit tool for surgical edits.** This repo has mixed CRLF and LF,
  sometimes within one file.
- **`str.replace()` fails silently.** Several edits to `styles.css`, `CLAUDE.md`
  and `app.js` no-opped on a whitespace mismatch and were reported as done. One
  was the `.pick.on` bug above; another made a commit message claim documentation
  it did not contain. **Assert the match, or grep afterwards.**
- **Writing JS through a Python heredoc mangles escapes.** `'\n'` becomes a real
  newline and produces an unterminated string — twice this session, once shipping
  a syntax error. Use `String.fromCharCode(10)`, or write the block to a file and
  splice it.
- **A harness only sees what its fixtures reach.** Three invariants were vacuous
  when written: `advance` never fired because recovery was never modelled; the
  codec round-trip never saw a `frozen_day` because the fallback only softens;
  `never_both` needed a conjunction no synthetic user produced. Each is now
  constructed deliberately and the summary prints per-kind counts so a zero is
  visible. **When you add an invariant, ask what input would make it fail. If you
  cannot name one, it is not an invariant.**

Still true from the previous session: headless Chrome enforces a minimum window
width and reports `prefers-color-scheme: dark`; PowerShell 5.1 `Get-Content`
mangles UTF-8; a `/` inside a JS regex literal terminates it; `Number(x) ||
default` treats a valid `0` as missing; tests coupled to implementation details
rot silently; deleting dead code can take live code with it.

---

## 6a. The bundle incident — read before touching `index.html`

A visual-tooling export once replaced `index.html` with a 440KB self-extracting
bundle serving `js/` and `styles.css` from `blob:` URLs decoded from a gzip
payload — a snapshot taken mid-sprint. The app ran three fixes behind the tree
for as long as it was there, and **both suites stayed green the whole time**,
because they load `js/` from disk. It also dropped the manifest and icon links,
breaking PWA install, and added a Google Fonts `preconnect` to an app whose
first constraint is that it makes no network calls.

`index.html` is a shell: `./styles.css` and the seven `./js/*.js` in fixed
order, the manifest and the icons, nothing else. If a tool offers to inline the
app into one file, the answer is no. `tools/package.js` now checks this on every
package, which is the one place that can see it.

---

## 7. Product direction — read before proposing features

`arise/knowledge/project.md` has a section called **"This Is Not A Game"**. It is
a first-class product constraint set by the user, and it is the lens for every
feature question:

> *Does this tell the user something true about their life, or does it only move
> a counter the app invented?*

The user does not want a Duolingo-shaped app. XP, levels and ranks exist but sit
deliberately **below** the real ledger — days kept, hours actually done,
summaries written. The top bar carries days kept, not a rank. Custom rewards pay
out in sneakers and books and grant no XP on purpose.

Three rules the run added, in the same spirit:

- **The run and the goals share nothing, deliberately.** A goal ramps a target
  the user chose from a baseline they set, earning each step by performing. A run
  picks from a closed catalog and ramps on the calendar. Merging them means
  migrating every custom goal onto a catalog id it does not have.
- **A day you have lived is never re-judged.** The one most likely to be broken
  by a well-meaning feature. The run's day record exists for it:
  `computeDayStatus` reads what a day *recorded*, never what the programme says
  now.
- **Feasibility is the product.** `validate` walks all 66 days. An infeasible day
  41 is the most expensive bug this design can have, because the user does not
  find it until day 41 — by which point they have earned 40.

Off limits without raising it first: any build step, bundler, framework or
dependency; any network call, account or sync; a rewrite of the progression
engine; any migration that recomputes a banked `bestStreak`; any expansion of the
game layer onto Today.

---

## 8. Working with this user

They drive product direction directly, test on a real device, and report
symptoms rather than causes — "it didn't connect", "it never updated". Every one
of those turned out to be either a real bug or a stale build, and none of them
was imprecision worth pushing back on. Check the code before assuming the
report is wrong; three times this session the report was right and the
assumption was not.

They respond well to being told plainly what is broken, including — especially —
when the assistant broke it.
