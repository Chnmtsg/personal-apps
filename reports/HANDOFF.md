# Handoff

Written at the end of a long session, for whoever picks this up next. Read it
before touching anything. Everything here is a decision already made, a trap
already sprung, or a question nobody has answered yet.

This replaces the previous arise-only handoff. Its traps and product direction
are carried forward below; its numbers are not — it predates about twenty
commits.

---

## 0. Read this first: it is pushed now, and the branch matters

**Remote: https://github.com/Chnmtsg/personal-apps — public. One branch,
`master`, and one working copy.** Commits are authored as `Chnmtsg` through the
GitHub noreply address, set repo-locally so a real address is not published on
a public repo.

Public was the user's explicit decision, asked and answered. The repo carries
their real skincare routine, sleep and wake times, training programme and habit
list as seed data. No key is in it — all 149 tracked files and the full history
were scanned before the first push — and `.gitignore` now covers the patterns
that would hold one. It did not exist before; nothing bad had reached the repo,
but that was luck rather than a rule.

There were six branches and two working copies. Everything is on `master` now,
and nothing was thrown away to get there: `english-feedback-app-review-fixes`
carried twelve commits and `life-reset-habit-recommender` six that existed
nowhere else, so both were **merged** rather than deleted. The three that were
already contained — `arise-discipline-redesign`, `arise-sprint1-and-visual-pass`,
`repo-docs-three-projects` — were deleted only after `git branch -d` confirmed
it. The branches touched disjoint directories, so both merges were clean.

A second worktree at `D:/3_Claude/Apps-efb` held a whole duplicate checkout,
398MB of it. It was clean and fully merged, so it was removed; `git worktree
add` recreates one if a parallel checkout is ever wanted again.

**The Netlify question is closed.** The user said they do not use it; it was
dropped and `netlify.toml` deleted. The app is published on **GitHub Pages** at
https://chnmtsg.github.io/personal-apps/ by `.github/workflows/pages.yml`, which
runs the three suites and `tools/package.js` on every push to `master` before it
uploads `arise/dist`. A red build is a site that does not update, so check the
Actions tab before believing "it didn't deploy".

**If the origin changes, every existing user starts empty.** `localStorage` is
per-origin; the plan, the logs, the sets and the streaks do not follow a domain
move. The only bridge is More → Export on the old origin, Import on the new one.

---

## 1. State of the tree — `master`

```bash
cd arise
npm test          # smoke 299, render 158, wire 81 — all green
npm run package   # → dist/, exits non-zero if the package is unshippable
serve.cmd         # http://localhost:8123
```

- `sw.js` VERSION → **`discipline-v77`**
- `js/` is **six** files, loaded in this order:
  `data.js` → `program.js` → `photos.js` → `store.js` → `ui.js` → `app.js`
  (`goals.js` and `run.js` were deleted this session — see §2)
- `tools/` is `smoke.js`, `render.js`, `wire.js`, `package.js`, `serve.py`,
  `make_icons.py`, `shot.html`
- `STATE_VERSION` is **8** — v8 adds `body`, the tape and the scale; v7 added
  `log.perf`, the performance record. Both purely
  additive: a day logged before set logging existed gains an empty object and
  keeps its tick. v6 split the muscle tags into nineteen groups and its
  re-derivation is still guarded by `meta.musclesV6`, read BEFORE the
  seed-defaults merge.
- Exercise pictures live OUTSIDE `arise.state.v1`, in their own IndexedDB store
  (`js/photos.js`), and ride in the backup as a `photos` key. That separation is
  the point: photos in the state blob would risk `QuotaExceededError` on every
  write, which would cost the user the ledger.
- `npm test` is green, `npm run package` succeeds, and **every screen has been
  driven in a real browser** (headless Edge against `serve.cmd`, with a seeded
  lived-in state, plus a real tap on Log set inside an iframe). Three bugs came
  out of that which no stub suite could see — see §2.

---

## 2. What this session did: Discipline is a training log now

The user asked for the app to be converted into a **fitness-only** app that
tracks each exercise — sets, weight, reps. Three decisions were put to them and
answered before anything was touched:

1. **Full strip, data preserved.** Remove the non-fitness features from the code
   and the UI; leave everything they stored in `arise.state.v1` untouched.
2. **Per-set rows with prefill.** Each set is weight × reps, and last session's
   numbers fill the boxes.
3. **Per-unit fields.** A distance exercise logs km and minutes, a time exercise
   logs minutes, only rep exercises get set rows.

### What was removed

`js/goals.js` and `js/run.js` are deleted. Gone with them: the goal ladder
engine, goal templates, the practices installer, the reading gate, the journal,
the Read tab, the 66-day habit run, the fixed-length countdown/challenge, the
daily-habit list, XP, levels, ranks, the eleven-milestone ladder, the weekly
chest, the line-a-day and the cookie jar. The tab bar is four tabs: Today, Plan,
Stats, More.

`styles.css` went from 126KB to 95KB — the rules for the removed screens were
swept out mechanically (`scratchpad/deadcss.js` documents the method: a class
counts as used if its name appears *anywhere* in source, which is deliberately
conservative). All three suites were green before and after.

### What was NOT removed, and must not be

**No user data was deleted.** `migrate()` stops LOOKING at `goals`, `goalLogs`,
`reading`, `journal`, `lines`, `cookies`, `challenges`, `run`, `habits`,
`claimed` and `weeklyClaims`. It does not touch them. They ride along in the
state blob and in every export, forever. There is a smoke test by name — *a goal
from the old app is still in the state* — and the invariant is written at the top
of `arise/CLAUDE.md`. **Do not tidy them out later.** Somebody's year of journal
entries is in there.

The code is recoverable: `git show <commit-before-this>:arise/js/goals.js`.

### What was built

The set log, in `js/data.js` (the vocabulary), `js/store.js` (the record) and
`js/ui.js` (the card).

- A set is `{ w, u, r }` — the weight, **the unit it was typed in**, and the reps.
  Carrying the unit is what makes `settings.weightUnit` a display choice rather
  than a re-valuation of history.
- `w: null` is a bodyweight set, not zero. It counts toward reps and sets and
  contributes nothing to volume.
- `suggestSet` fills the boxes from the set already typed today, else last
  session, else the plan — and says which. It stores nothing.
- `maybeComplete` ticks the exercise when the last prescribed set is filled in,
  and nothing ever un-ticks it.
- `normalisePerf` repairs a half-written record on every load and never invents.
- Stats gained a top-set chart per lift (one column per session, no line across
  the gaps) and a heaviest-set table. The XP/rank row is gone.

Every one of those has a test, in the suite that can see it: the engine in
`smoke.js`, the markup in `render.js`, the tap in `wire.js`.

### The rest timer, and what it did for ember

Added after the conversion, on the user's instruction, and the two open flags it
answers turned out to be one thing. Ember is allowed on exactly one kind of block
— one whose subject is progress through a fixed length of time — and after the
countdown and the run screen went, the only thing still wearing it was Today's
strip, which the brief had given it for carrying "the next ask". That was always
a stretch of the rule. A rest countdown is the rule literally, so the timer took
the strip and ember has an honest subject again rather than being retired.

How it works, and each of these is a rule rather than a detail:

- The interval is parsed out of the plan item's own `note` (`rest 90 s`,
  `rest 2–3 min`), which is where `js/program.js` already writes it. No new
  field, so no migration and no second copy to keep in step.
- A range counts to its **lower** bound. That is when the rest is over; the upper
  bound is how long you are allowed to take.
- An exercise that prescribes no rest **counts up**. Inventing an interval would
  be exactly the made-up number this app refuses to show.
- It is **never stored**. A half-finished rest is not something the user did, and
  a persisted one would tell somebody on the bus they have 40 seconds left of a
  rest they finished at the gym.
- It is derived from `Date.now()`, not from counting ticks, so a throttled tab
  comes back correct.
- `More → Training → Rest timer` switches the whole thing off. On by default,
  which is safe here in a way the other switches are not: it re-scores nothing.

### The programme was replaced with the athlete's real one

`js/program.js` was rewritten in 2026-09 from a full training document the
athlete supplied: push / pull / legs run twice, in both contexts, every exercise
and set count named. It replaces the old Upper/Lower split entirely.

- **Nothing is drafted any more.** Saturday's accessory session and the whole
  home context had been written for this app because the source named one and
  never described the other. Both arrived. The labels are gone and a test
  asserts they stay gone.
- **The volume is deliberately lopsided** — upper body at the top of the range,
  legs in the middle — because the athlete squats 1.67x bodyweight and benches
  0.92x. Spreading it evenly would preserve that gap. If a later edit "balances"
  the week it has undone the point of it.
- **`DOC_SETS` in `tools/smoke.js` is the source document's own set counts**, and
  every session is asserted against it. Two failure modes are otherwise
  completely silent: `programPlan` resolves by NAME and drops what it cannot
  find, so a typo removes a lift with no error; and a mistyped `sets:` just asks
  for one set fewer, forever. Both were reproduced on purpose to confirm the test
  catches them. **When the programme changes, that table changes with it.**
- The rest intervals in the notes are parsed by the timer, so a test walks every
  item in both contexts and fails if one prescribes a rest the parser cannot read.
- `tools/render.js` now sweeps **both** contexts' seven days. It only ever swept
  the site week before, so the six home sessions — the half with the cables and
  machines in them — had never been rendered by anything.

The one thing that did not fit is in §4: the site block is a rolling
3-on/1-off cycle and this app stores a plan per weekday, which cannot express
one. The closest weekly version ships, and every place the user might read it
says so.

### Body measurement tracking

`state.body` is a sparse map of dateKey to `{ kg, u, neck, waist, arm_l, … }`.
Two cadences, and the difference between them is the design:

- **Body weight**, three mornings a week. Reported as a WEEKLY AVERAGE, because
  a kilo of daily swing is water and food. `weightTrend` gives the rate between
  the first and last week that actually have readings, so a skipped fortnight
  does not read as a plateau, and one week on the record reports `null` rather
  than a rate of zero.
- **The tape**, once a rotation. Ten fields, five of them paired L/R. Every one
  optional; `tapeHistory` works per FIELD rather than per date, because the tape
  gets used unevenly and forcing everything onto one baseline date would drop a
  field or invent a reading for it.

Three rules worth not breaking later, each with a test:

- **It is a record, never a task.** Nothing touches `computeDayStatus`, the
  streak or `historyStart`. The tests snapshot the whole day-status object
  before and after — the first version compared `total` alone and stayed green
  while `done` was sabotaged, which is a guard for half a bug.
- **The tape is NOT pre-filled**, and that is the deliberate difference from the
  set log. A set is confirmed as it is performed; a tape sheet is twenty fields
  saved in one tap, so pre-filling would record ten measurements nobody took.
  The previous reading sits beside the box, never in it.
- **Zero is not a measurement.** A tabbed-through field is dropped; a blank
  clears rather than being skipped.

Entry is from Stats: "Weigh in" (one field) and "Measure" (the full sheet).
Deliberately not on Today — Today is the session, and a non-training row there
would undo the narrowing the conversion was for.

### The design update: Paper + Ember, and four structural changes

Applied from a design handoff the user supplied. `styles.css` and `js/ui.js`,
no new dependency, no migration, no change to stored data.

**Palette is Paper + Ember.** Warm sand ground in light, deep warm brown in
dark, amber accent in both. `--bad` and `--gold` are deliberately held OUT of
the amber ramp: let all five heat-map statuses become steps of one ramp and a
missed day stops being the cell you can scan for.

**The chart steps were validated, and the handoff was right to flag them.** Both
proposed `--chart-did` values passed untouched. Both `--chart-ask` values FAILED
— the dark pair at ΔE 5.3 in normal vision against a floor of 15 — and had to
leave the amber family entirely. They are orchid in both blocks now. That is the
warm-palette problem in one number: a single-hue ground cannot also supply a
second distinguishable categorical mark.

**Four structural changes**, three exactly as written:

1. A progress spine down Today's exercise list, filling to the fraction of the
   session complete, with a ringed node on the live lift.
2. Header bands are three-stop ramps with a lit top edge. `--band` is still the
   BASE stop, so no measured contrast pair moved.
3. The pinned strip is charcoal until a rest runs, and ember only while it
   counts. This settles the open question about ember losing its subject: it
   has exactly one now, and the strip reads correctly without it.
4. Logged sets are 44px chips instead of stacked rows, and the row states where
   the boxes were pre-filled from.

**One thing was deliberately not taken.** The handoff specified tap-to-expand on
the exercise row. The row is already inline and always open, built that way so
logging is confirming a number rather than opening something first, and it
happens thirty times a session. Chips get the density win without putting a tap
in front of the app's core action. Put to the user, who chose the same. If a
later handoff asks again, that is the trade being made.

**A new screen, `VIEWS.body`** — reached from More and from Stats, no tab.
Progress photos (pose filter, first-and-latest pair, dated grid) and the full
tape with per-measurement bars. The route is `body` and not `progress` because
Stats already owns that name; worth knowing before hunting a bug that is only a
name.

Photos go in the SAME IndexedDB store as the exercise pictures under a `bp_`
key — one store, one backup path, one quota, one thing that can fail. One
photo per pose per day, so re-taking replaces. `A.Photos.count()` excludes them
so More's library fold still counts the library.

Three icons were added (`warmup`, `stretch`, `chev-back`) plus `tape`, and
`CATEGORY_ICON` gained Warm-up and Stretch — a nine-row Monday was nine
dumbbells before.

**Two things in the handoff were stale** and are noted rather than applied: it
says Measurements is a new screen (it shipped the day before, on Stats — the
tape moved to Progress and the weight trend stayed), and it says the Saturday
accessory day and the HOME context are still drafted (they were replaced with
the athlete's real programme two commits ago).

**A stylesheet rebuild, and why.** A splice walked its start index past the top
of the file and duplicated ~220 lines. It was caught by the class-coverage guard
behaving oddly rather than by a test failing, which is the uncomfortable part.
`styles.css` was rebuilt from a pre-design copy in one pass with an assertion on
every step plus brace-balance and duplicate-selector checks at the end. **If you
splice this file, assert what you cut.**

### Three bugs found while building this, and how

Two by the new tests, one only by the browser — which is the argument for
opening one.

- `describeEntry` printed `NaN min` for an entry whose exercise had since been
  re-measured. It reads the ENTRY now, not the exercise.
- A bodyweight-only session reported "0 kg" in its header, which is a different
  and false claim from "none of it was loaded". It falls back to reps.
- **The rest was started AFTER the store write**, and the write is what
  repaints — so the timer existed in view state and was not on screen until
  something unrelated happened to render. Both stub suites passed it happily.
  `tools/wire.js` now wraps `UI.render` and asserts what the tap's LAST paint
  contained, which is the only shape of test that can see it.

Three plural bugs came out of the browser too ("1 sessions kept"), and
`render.js` grew a guard that strips tags before matching — the count and its
noun usually sit in two elements, which is why the first two versions of that
guard passed the bugs they were written for.

---

## 3. This repository holds one project now

`english-feedback-app/` and `life-reset/` were deleted in 2026-08 at the user's
request, along with `knowledge/` and the four review reports that belonged to
the first. The root `.claude/agents` and `.claude/commands` went with them —
they were the english-feedback-flavoured copies of the review roles, and
`arise/.claude/` carries the arise ones.

**Nothing is lost.** Both projects are in this repository's history, on
`master`, and pushed. To bring one back:

```bash
git log --oneline --diff-filter=D -- life-reset | head -1
git checkout <that-commit>~1 -- life-reset
```

`arise/js/run.js` was a port of the `life-reset` Python engine. It was deleted in
2026-09 with the 66-day run, and comes back from history the same way.

---

## 4. Open, in priority order

1. **Nothing has been opened in a real browser since the conversion.** All three
   suites are green and the package builds, but `render.js` uses a hand-rolled
   stub DOM and `wire.js` a stub click router: neither can tell you a button is
   reachable, visible, or the right size under a thumb. The set-log card is
   **new markup with new CSS** — the two number fields, the button beside them,
   the set rows — and that is exactly the class of thing a stub cannot check.
   Run `serve.cmd`, open `http://localhost:8123`, clear the service worker, and
   log a real session before believing any of it looks right.
2. **Clickjacking protection is gone, and a meta tag cannot bring it back.**
   The CSP itself was restored as a `<meta http-equiv>` in `index.html` and is
   enforced on the live site — but `frame-ancestors` and `X-Frame-Options` are
   both ignored in meta, so the app can be framed by anyone. It needs a host
   that sends response headers. Pages does not.
3. ~~**Ember has no job any more.**~~ **Answered by the rest timer** — and the
   original note was wrong on the facts: ember was never unused, it still
   painted Today's strip. What was gone were the countdown header and the run
   header. The strip's claim to it was weak (a "next ask" is not elapsed time)
   and the rest countdown makes it literal. If the timer is ever removed, ember
   has no subject left and the strip should go charcoal rather than keep a hue
   that means nothing.
4. ~~**The drafted training content is mine, not the owner's document.**~~
   **Resolved.** The athlete supplied the full programme in 2026-09 — both
   contexts, six sessions each, every exercise named — and `js/program.js` is a
   transcription of it now. Nothing is drafted, and a smoke test asserts no day
   title or blurb still claims to be. What replaced that risk is a different
   one: see §4.9 on the volume table.
5. ~~**A rest timer between sets is the obvious next feature.**~~ **Built** —
   see §2. The one thing it deliberately does NOT do is fire when the app is
   not in front of you: a PWA cannot, and `knowledge/project.md` forbids
   implying otherwise. The README says so in as many words.
6. **Muscle tags are read live, not frozen.** Re-tagging an exercise changes what
   past days are credited with in the muscle breakdown on Stats. Day completion,
   streaks and the ledger are untouched — only the attribution moves — and there
   is a test documenting it by name. Freezing them into each day's record, the
   way the exercise list already is, was offered and not yet asked for.
7. **A few dead CSS rules survived the sweep**, because their class names appear
   inside a source comment (`.gatecard`, `.minifield`, `.archive` and a handful
   more). Under 2KB. The sweep is conservative on purpose: a false positive
   leaves one dead rule, a false negative deletes a rule a live screen needs.
8. **The source document's volume table does not match its own sessions, for
   back.** Section B states 14 sets/week for upper back and lats rising to 18 at
   peak. Its own Pull A and Pull B tables prescribe 4+4+3 and 4+3+3, which is 21
   — over the peak before the set-addition schedule adds any. Everything else
   lands inside its stated ranges once carryover is read the way the table
   describes. **The sessions are what was implemented**, because the sessions are
   what somebody actually does and re-balancing another coach's programme is not
   this app's job. Worth putting to whoever wrote it.
9. **Flattening `arise/` to the repo root.** With one project left, the nesting
   is arguably pointless — but the Pages workflow uploads `arise/dist` and the
   folder name is deliberate (see `arise/CLAUDE.md` on the rename). Not done,
   and not obviously worth doing.

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

The user does not want a Duolingo-shaped app. XP, levels, ranks and the
milestone ladder were **removed** in 2026-09 rather than demoted: the real ledger
is days kept, sets logged and kilos moved, and a synthetic number sitting beside
those was competing with them. Custom rewards pay out in shoes and books and
grant nothing but the record that the user bought the thing.

Three rules, in the same spirit:

- **A day you have lived is never re-judged.** The one most likely to be broken
  by a well-meaning feature. Two mechanisms carry it: `ensureLog` freezes the
  day's exercise list, and a set stores its own weight, unit and reps.
- **The plan asks; the log records.** They are separate objects and neither is
  derived from the other. Anything that reads a past day off the live exercise or
  the live plan item is the bug, every time.
- **Never invent a number.** A bodyweight set is not zero kilos. A day the app
  was not opened is not a failure. A gap in a chart is not a zero. An estimated
  one-rep max is a formula's opinion, not a lift that happened.

Off limits without raising it first: any build step, bundler, framework or
dependency; any network call, account or sync; any migration that recomputes a
banked `bestStreak`; any migration that deletes the keys the removed features
left behind; and bringing the game layer back.

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
