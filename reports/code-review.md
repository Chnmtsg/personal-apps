# Code Review — Arise

## Scope and method

Reviewed the whole application at `D:\3_Claude\Apps\arise`: `index.html`, `styles.css`, `sw.js`, `js/data.js`, `js/program.js`, `js/goals.js`, `js/store.js`, `js/ui.js`, `js/app.js`, plus `tools/smoke.js`, `tools/render.js`, `package.json`, `eslint.config.mjs`, `.github/workflows/deploy.yml` and `.gitignore`. Measured against `knowledge/project.md`, `knowledge/coding-standards.md`, `knowledge/review-conventions.md` and the Invariants section of `CLAUDE.md`.

Traced one write path end to end (tap tick → `app.js` `goal-hit` → `Store.hitGoalTarget` → `ensureGoalLog` → `commit` → cache clear → `save` → `emit` → `UI.render`) and one read path (`renderToday` → `dayStatus` → `goalsForDay` → `goalTimeline` → `Goals.timeline`/`Goals.streak`).

**Not assessed, and why:** I could not execute `node tools/smoke.js` or `node tools/render.js` — no shell/execution tool was available in this session. All test-coverage statements below are from reading the two suites, not from observing a run.

---

## Executive Summary

The progression engine is the best part of this codebase: `js/goals.js` is pure, storage-free, well commented for *why* rather than *what*, and `tools/smoke.js` covers the ladder maths, earned advancement, step-back, frozen judgements and migrations properly. Layering is respected — `goals.js` never touches storage, `ui.js` never writes state, and escaping of user text is genuinely thorough and even has its own regression test. The two risks that block release are both in the data layer, not the engine: a failed read of `localStorage` silently overwrites the user's only copy of their data with a fresh seed, and pausing or re-baselining a goal retroactively re-scores every day the user has already lived, permanently inflating the best-streak high-water mark and unlocking milestones that were not earned. Alongside those, the repository carries an entire foreign tooling tree (`tools/lint.mjs`, `tools/check-*.mjs`, `tools/harness/`, `eslint.config.mjs`, `.github/workflows/deploy.yml`) belonging to a different application, `expense-pwa`, which means the only deployment automation present publishes a directory that does not exist here. The single biggest risk is the silent data wipe on `store.js:107-124`: it is quiet, it is unrecoverable, and the app's own documentation says export is the only recovery there is.

## Overall Score

**55 / 100** — Significant rework needed before release.

Two Critical findings (silent destruction of stored data on a failed load; past days re-judged and best-streak permanently inflated by ordinary goal edits) put this below the 60 band despite an engine, test suite and escaping discipline that would otherwise score in the eighties.

---

## Findings

### Critical

**CODE-01 — A failed read of saved state silently overwrites the user's data with a fresh seed**

- **Severity:** Critical
- **Location:** `js/store.js:107-124` (`load()`), specifically the `catch` at 118-120 followed by `state = seedState(); save();` at 121-122
- **Evidence:** `load()` wraps *both* `JSON.parse(raw)` and `migrate(parsed)` in one `try`. Any throw — a truncated value, a state object written by a future version whose shape `migrate()` cannot walk (e.g. `s.exercises` not an array reaches `s.exercises.find` in `installProgram`, `store.js:218`; `s.goals` containing a null reaches `g.schedule = ...` at `store.js:178`) — is handled by `console.warn` and then a seed state is written straight over `arise.state.v1` by `save()`. The user sees a working, empty app and no message at all. `knowledge/project.md` states "Stored data is sacred… Backup is More → Export, and it is the only recovery there is"; `knowledge/coding-standards.md` states "Never swallow an error silently, and never leave the user looking at a screen with no explanation."
- **Impact:** Total, unrecoverable loss of goals, logs, streaks, reading summaries and journal for a user who has not exported. The user is not told it happened, so they cannot even restore from a backup they do have — they will just re-onboard on top of the wipe.
- **Recommendation:** In the `catch`, copy the raw string to a quarantine key (`arise.state.v1.unreadable`) *before* seeding, do not call `save()` on the seed path until the user has been told, and set a `meta` flag that `banners()` (`js/ui.js:172-188`) renders as a warning with an export/restore route. `importJson` already models the right behaviour (`js/app.js:594-608` shows the failure in a sheet).
- **Effort:** S

**CODE-02 — Pausing or re-baselining a goal re-judges every past day and permanently inflates the best streak**

- **Severity:** Critical
- **Location:** `js/store.js:365-367` (`goalsForDay` filters on `activeGoals()` and `g.startDate`), `js/store.js:496-501` (`archiveGoal`), `js/store.js:510-516` (`restartGoal` sets `g.startDate = today()`), `js/store.js:628-656` (`computeDayStatus`), `js/store.js:697-701` and `732-735` (best-streak high-water writes)
- **Evidence:** `computeDayStatus(dateKey)` derives a past day's totals from `goalsForDay(dateKey)`, which filters `activeGoals()` — the goal's *current* archived flag and *current* `startDate`. Pause a goal today (`Plan → ✎ → Pause`) and every past day loses it from `total`; a day that was 3/5 (`partial`) becomes 3/3 (`complete`). `history()` then recounts `completeDays` (more freezes earned via `freezeStats`, `store.js:585-589`), `currentStreak()`/`history()` recompute a longer streak, and both write it into `state.bestStreak`, which is a high-water mark that un-pausing can never revoke. `rewards()` (`store.js:795-805`) unlocks milestones off that inflated `best`, and they can then be claimed for XP. `restartGoal` and the re-runnable onboarding (`js/app.js:352, 357` patch `startDate: S.today()`) produce the same effect through the `daysBetween(g.startDate, dateKey) >= 0` half of the filter. This is exactly what `CLAUDE.md` forbids: "Editing a goal, switching difficulty, moving a baseline or changing a schedule must never reach back and change what a past day meant." Schedule changes *are* protected (`scheduleHistory`, `goals.js:109-118`) and tested; archive and re-baseline are not, and `tools/smoke.js` has no assertion for either.
- **Impact:** A normal, one-tap, non-destructive action ("Pause") silently rewrites history, awards streak days and milestone XP the user did not earn, and the inflation is irreversible. It breaks two hard constraints — "a day you have lived is never re-judged" and "Honest — it never shows a number the user did not earn."
- **Recommendation:** Stop deriving a *past* day from a goal's *current* activation. Smallest safe fix: record `archivedOn` when `archiveGoal` sets `archived = true`, and in `goalsForDay` include a goal for dates before `archivedOn` (rather than excluding all archived goals); for `restartGoal`, keep `startDate` and record the new baseline as a dated entry the timeline reads, instead of moving the goal's start forward. Add smoke assertions that `dayStatus(pastDay)` and `history().best` are unchanged across a pause and a re-baseline.
- **Effort:** M

### High

**CODE-03 — Writes are debounced 60 ms with no flush when the page is hidden or closed**

- **Severity:** High
- **Location:** `js/store.js:230-239` (`save()`), no `visibilitychange` / `pagehide` listener anywhere in `js/` (grepped across all six files)
- **Evidence:** Every mutation ends in `commit()` → `save()`, which does `clearTimeout(saveTimer); setTimeout(… localStorage.setItem …, 60)`. `setJournal` (`store.js:562-574`) calls `save()` directly on every keystroke and each keystroke resets the timer. Nothing flushes the pending write when the app is backgrounded; on iOS/Android a home-screen PWA can be frozen or discarded without running a pending timer.
- **Impact:** The last action before switching apps — ticking the final goal of the day, or the last words of a journal entry — can be lost on the one device that holds the only copy of the data. For an app whose whole promise is a streak, losing the tick that completed the day is a serious, silent failure.
- **Recommendation:** Add a `flush()` that clears the timer and writes synchronously, and call it from `document.addEventListener('visibilitychange', …)` when `document.visibilityState === 'hidden'` and from `pagehide`. Wire it in `js/app.js` (the layer that owns event wiring) so `store.js` stays DOM-free.
- **Effort:** XS

**CODE-04 — A failed write (quota exceeded) is logged to the console and nothing else**

- **Severity:** High
- **Location:** `js/store.js:234-237`
- **Evidence:** `catch (err) { console.error('Arise: save failed (storage full?).', err); }`. There is no user-visible signal and no retry. Because saving is fire-and-forget inside a timer, callers such as `hitGoalTarget` still return success and the UI still renders the change from in-memory state.
- **Impact:** Once `localStorage` is full or blocked (Safari private mode, aggressive storage eviction), the app looks like it is working while nothing persists. The user discovers it on the next launch, with days of work gone. `knowledge/coding-standards.md`: "Never swallow an error silently."
- **Recommendation:** On the catch path, set a `meta.saveFailed` flag and surface a persistent banner via `banners()` (`js/ui.js:172-188`) offering Export, rather than only a console line. A toast is not enough here — it disappears.
- **Effort:** S

**CODE-05 — The only deployment automation publishes a directory that does not exist in this app**

- **Severity:** High
- **Location:** `.github/workflows/deploy.yml:79` (`path: expense-pwa`), plus the header comments at lines 3-11
- **Evidence:** The workflow's `verify` job runs `npm run verify` (which is `node tools/smoke.js && node tools/render.js` — correct for this app), but the `deploy` job uploads `path: expense-pwa`, which does not exist under `arise/`. The comments describe another application ("The repo root carries reports/, knowledge/, tools/…", "index.html lands at the top of the site").
- **Impact:** Running Actions → Deploy cannot publish Arise. Release is blocked on a broken pipeline, and the header comments will mislead whoever tries to fix it under time pressure.
- **Recommendation:** Point `path:` at the app root (`.`) or delete the workflow if Arise is not deployed from here. Rewrite the header to describe Arise's actual publish rules, including the `sw.js` VERSION bump.
- **Effort:** XS

### Medium

**CODE-06 — Foreign tooling for a different application is checked in and non-functional**

- **Severity:** Medium
- **Location:** `tools/lint.mjs:1,24,116`; `tools/check-saves.mjs:42,227`; `tools/check-escaping.mjs:46,100`; `tools/check-contrast.mjs:36`; `tools/harness/run.mjs:73`; `tools/harness/fixture.js:1`; `eslint.config.mjs` (whole file); `.gitignore:1`
- **Evidence:** All of these read `join(root, 'expense-pwa', 'index.html')` — a path that does not exist in `arise/`; each would fail with ENOENT. `eslint.config.mjs` documents rules for "a classic inline `<script>`", allow-lists a `firebase` global "loaded at runtime only when Cloud Sync is configured", and references `renderCalendar()`, `downloadJSON` and `navigator.canShare` — none of which exist in this codebase; it also omits `module` and `globalThis`, which `js/goals.js:282-283` uses, so `no-undef` would report false errors if it were ever run against `js/`. There is no `lint` npm script, so none of it runs. `.gitignore:1` says "The application in expense-pwa/ has no dependencies". `README.md:190-207` lists `tools/` and does not mention any of these files.
- **Impact:** The repo's stated safety net is `smoke.js` + `render.js`; surrounding them with four dead "predicates" and a harness that appear to be part of the safety net is actively misleading, and the eslint devDependency exists only to serve them. A future maintainer will spend real time working out which tools are real.
- **Recommendation:** Delete `tools/lint.mjs`, `tools/check-*.mjs`, `tools/harness/`, `eslint.config.mjs` and the `eslint` devDependency, or port them to Arise deliberately. Fix `.gitignore:1`'s text. Keep `package.json` as the two-script tooling manifest it already documents itself to be.
- **Effort:** XS

**CODE-07 — Goal detail renders one DOM node per rung with no upper bound**

- **Severity:** Medium
- **Location:** `js/ui.js:1289-1293` (`for (let i = 0; i <= tl.maxLevel; i++) rungs.push(…)`), fed by `js/goals.js:56-61` (`maxLevel = ceil(span / step)`)
- **Evidence:** The goal editor accepts any `target` (`js/ui.js:1130`, `min="0"`, no max) and a step as small as `0.25` (`js/app.js:137`). A goal of baseline 0 → target 10000 at step 0.25 gives `maxLevel` 40,000, and opening the goal (tapping its row on Today → `goal-detail`) builds 40,000 rung elements in one `innerHTML` string.
- **Impact:** A typo in the target field makes tapping that goal freeze or crash the tab on a phone. It is recoverable (the goal editor via Plan does not render rungs), but the user has no way to know that.
- **Recommendation:** Render a window of rungs around the current level (e.g. ±6 with an ellipsis), and/or clamp `maxLevel` to a sane ceiling in `goals.js` with a validation message in the editor when `span / step` exceeds it.
- **Effort:** S

**CODE-08 — There is no top-level error boundary: a throw during render leaves a blank screen with no explanation**

- **Severity:** Medium
- **Location:** `js/app.js:766-775` (boot sequence), `js/ui.js:1516-1529` (`render()`), no `window.addEventListener('error', …)` anywhere in `js/`
- **Evidence:** Boot is `S.load(); UI.go(…)` with no `try`. `render()` assigns `el.innerHTML = fn()` unguarded, and every store subscriber calls it (`js/app.js:706-715`). Any exception from a view — for example the unbounded-rung path in CODE-07, or a state shape `migrate()` let through — produces a white screen and a console message the user will never see.
- **Impact:** The app's failure mode is "nothing happens", which for an offline app with no telemetry means the user has no route to diagnosis or recovery (not even "Export your data").
- **Recommendation:** Wrap the boot sequence and `render()` in a `try/catch` that writes a plain recovery panel into `#view` — an apology, the error message, and an Export button that calls `S.exportJson()`. Add a `window.onerror` that raises the same panel once.
- **Effort:** S

**CODE-09 — Whole-state serialisation and unmemoised O(days) aggregates run several times per interaction**

- **Severity:** Medium
- **Location:** `js/store.js:705-737` (`history()`), `js/store.js:750-776` (`totalXp()`), `js/store.js:230-239` (`save()` stringifies the entire state), `js/app.js:15-28, 69-74` (`snapshot()` is called twice per `act()`)
- **Evidence:** `dayStatus` and `goalTimeline` are memoised (`dsCache`, `tlCache`) as the standards require, but `history()` and `totalXp()` are not: each walks every day since install / every log, goalLog and reading key on every call. One tap through `act()` calls `snapshot()` twice, and each `snapshot()` calls `progress()` (→ `totalXp`) and `rewards()` (→ `history()` twice, at `store.js:796` and `809` via `nextMilestone`); `render()` then calls `progress()` and `currentStreak()` again. Separately, every journal keystroke calls `setJournal` → `save()` → `JSON.stringify(state)` of the *entire* state (`store.js:234`), which at a few years of logs is a multi-megabyte serialise on the main thread every 60 ms of typing.
- **Impact:** Linear degradation that a two-year synthetic account (README:226-231, ~50 ms per tap) already shows. At five-plus years, or on a low-end phone, typing in the journal and tapping a goal will visibly stutter. Nothing is wrong today; it gets worse every day the app is used.
- **Recommendation:** Memoise `history()` and `totalXp()` on the same revision key the other caches use (that is what the unused `rev` counter was for — see CODE-14), and give `setJournal` a longer debounce than mutation saves (e.g. 500 ms) so typing does not re-serialise the whole state per character.
- **Effort:** M

**CODE-10 — Streak-holding rules are implemented twice and will drift**

- **Severity:** Medium
- **Location:** `js/store.js:660-665` (`holdsStreak`) versus `js/store.js:686-693` (`currentStreak` inlines the same three rules)
- **Evidence:** `holdsStreak(s)` encodes "complete, or rest with `restCountsAsStreak`, or frozen". `currentStreak()` re-implements exactly those three branches inline instead of calling it; `history()` (line 721) calls `holdsStreak`. Any future change to what holds a streak must be made in both places or the current streak and the best streak will disagree.
- **Impact:** A latent correctness bug in the number the app puts at the top of every screen. Cheap now, expensive after it diverges.
- **Recommendation:** Have `currentStreak()` call `holdsStreak(s)` and only count `complete`/`rest` toward `count`, keeping the "frozen holds but does not add" behaviour explicit in one place.
- **Effort:** XS

### Low

**CODE-11 — One sheet title is HTML-escaped before being assigned to `textContent`, so it double-escapes**

- **Severity:** Low
- **Location:** `js/ui.js:1062` (`openSheet(esc(ex.name), …)`) against `js/ui.js:948` (`$('#sheetTitle').textContent = title`)
- **Evidence:** Every other caller passes a raw string (`openSheet(g.name, …)` at 1263, `openSheet(g.icon + ' ' + g.name, …)` at 1295); only the plan-item editor escapes first. Since the title is set with `textContent`, an exercise named `Squats & Lunges` renders as `Squats &amp; Lunges` in that one sheet.
- **Impact:** A visible wrong character, and an inconsistency that invites someone to "fix" it by escaping the others too.
- **Recommendation:** Drop the `esc()` at `ui.js:1062`.
- **Effort:** XS

**CODE-12 — Numeric state values are interpolated into HTML attributes without `esc()`**

- **Severity:** Low
- **Location:** `js/ui.js:1054`, `1056`, `1058-1059`, `1096`, `1130`, `1367`; `js/ui.js:857`
- **Evidence:** e.g. `value="${item.minutes || ex.minutes || 10}"`, `value="${value == null ? '' : value}"` in `valueInput`, `value="${v.step}"`, `value="${s.goalPerWeek}"`. These are numbers when produced by the app's own inputs, but `importJson` accepts arbitrary JSON — `tools/render.js:317-320` explicitly names a hand-edited backup as "a real injection path" and tests icons for exactly this. A string value in any of these fields breaks out of the attribute.
- **Impact:** A narrow, self-inflicted XSS route on an offline single-user app; low real-world likelihood, but it contradicts the invariant "Everything reaching `innerHTML` goes through `esc()`".
- **Recommendation:** Wrap these interpolations in `esc()` as the text paths already do, or coerce with `Number(...)` at the point of render.
- **Effort:** XS

**CODE-13 — The reading form's element IDs are duplicated in the document**

- **Severity:** Low
- **Location:** `js/ui.js:499-530` (`readingForm` hard-codes `#r_book`, `#r_min`, `#r_summary`), used inline at `ui.js:573` and inside a sheet at `ui.js:1134`
- **Evidence:** The Read tab renders the form inline for today while `openReading(pastDay)` puts a second copy in the sheet, so three IDs exist twice at once. The save handler works around it by scoping to `closest('#sheetBody') || closest('.card')` (`js/app.js:277-279`) and the focus call scopes to `#sheetBody` (`ui.js:1137`) — both comments say so explicitly.
- **Impact:** Invalid HTML and a standing trap: any future `$('#r_summary')` written the obvious way silently reads the wrong form.
- **Recommendation:** Give `readingForm(dateKey, idPrefix)` a prefix, or switch these three to `data-field` attributes resolved within the form element.
- **Effort:** S

**CODE-14 — Dead code: an unused revision counter, an unused store method, and a superseded CSS rule**

- **Severity:** Low
- **Location:** `js/store.js:105` and `251` (`rev` is incremented and never read); `js/store.js:904-906` and `1041` (`setNote` is exported but called from nowhere in `js/`); `styles.css:117` (`.tabbar { grid-template-columns: repeat(5, 1fr) }`) overridden unconditionally at `styles.css:502`
- **Evidence:** Grepped all six `js/` files: `rev` appears only at its declaration and its increment; `setNote` appears only at its definition and in the export list. The app has six tabs (`index.html:40-45`); the base `.tabbar` rule declares five columns and the "v2" section at the bottom of the stylesheet re-declares six, so the first declaration is dead and the second is a changelog-shaped patch rather than a component rule (`knowledge/coding-standards.md`: never comment "to record that a change was made").
- **Impact:** Small, but each item costs a reader time and the `.tabbar` pair will confuse anyone adding or removing a tab.
- **Recommendation:** Delete `setNote`, either delete `rev` or use it as the memo key for CODE-09, and fold `styles.css:502-503` into the base `.tabbar` block.
- **Effort:** XS

**CODE-15 — The goal editor's Direction control is discarded on save**

- **Severity:** Low
- **Location:** `js/app.js:215-223` (`data.direction = nt > nb ? 'up' : 'down'`), overriding `#gg_dir` read at `js/app.js:134`
- **Evidence:** The editor presents a Direction select (`js/ui.js:1356-1359`), and the save handler recomputes direction from baseline and target, discarding what the user chose. The value is not entirely inert — it still feeds the `wrapAt` guess at `js/app.js:148-154` — so the control has one hidden effect and one visible effect that is ignored.
- **Impact:** A control that does not do what it says. Minor for one user, but it is the kind of thing that gets "fixed" later by removing the wrong half and breaking midnight-crossing bedtimes.
- **Recommendation:** Either make the field read-only/derived in the UI with a line explaining that direction follows the two numbers, or keep the user's choice and validate it against the numbers instead of silently overwriting it.
- **Effort:** XS

**CODE-16 — A feature test in `render()` can never be true**

- **Severity:** Low
- **Location:** `js/ui.js:1523` — `behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto'`
- **Evidence:** `'instant'` is a scroll-behaviour *value*, not a CSS property, so `'instant' in style` is always false and the branch always resolves to `'auto'`.
- **Impact:** None functionally; it reads as a deliberate capability check that does nothing, which is worse than the plain value.
- **Recommendation:** Use `behavior: 'instant'` directly (valid and ignored gracefully where unsupported) or `'auto'`.
- **Effort:** XS

---

## Review areas — clean results

- **Numeric correctness** (the money-equivalent for this app: clock values, targets, ladders): clean. Times are stored as integer minutes past midnight, never as floats or strings; `key()` deliberately avoids `toISOString()` (`data.js:14-20`); `daysBetween` rounds, so DST cannot shift a day; `norm`/`denorm`/`wrapAt` handle midnight-crossing bedtimes and are tested (`smoke.js:182-188`); every ratio I traced is guarded against divide-by-zero (`Math.max(1, …)` at `store.js:789, 841`, `ui.js:112, 1305`). Rounding lives in one place, `Goals.roundValue` (`goals.js:35-39`).
- **Layer discipline:** clean. `data.js` and `program.js` are pure data, `goals.js` touches neither storage nor the DOM, `store.js` has no DOM reference, `ui.js` never writes state directly, `app.js` renders no view HTML. Load order in `index.html:63-68` matches `sw.js:11-16` and both harness load lists.
- **Offline behaviour:** clean. No `fetch`/`XMLHttpRequest` anywhere in `js/`; the only network code is the service worker, and `app.js:771` correctly skips SW registration on `file:`. No accounts, no telemetry, no secrets.
- **Escaping of user text:** clean apart from CODE-12. Goal, exercise and habit names, journal and summary text all pass through `esc()` on every path I traced, including toasts built in `app.js` (`app.js:41, 323, 485`), and `render.js:315-346` regression-tests it.
- **Service worker:** clean. `VERSION = 'arise-v5'`, asset list matches `index.html`, old caches purged on activate, navigations network-first with a cached shell fallback, cross-origin and non-GET requests correctly ignored (`sw.js:44`).
- **Migrations:** clean and well tested. `migrate()` is additive, reads the incoming `programInstalled` flag *before* merging seed defaults (`store.js:171-175`) exactly as the standards demand, and `smoke.js:421-482` covers the v1 backup, the program install and the "do not reinstall over an edited plan" case.

---

## Technical Debt

- **`js/app.js` has no automated coverage at all.** Neither harness loads it (`smoke.js:20`, `render.js:90`), so the entire click router — a 460-line `switch` containing form parsing, validation and every destructive confirmation — is verified only by hand. This is acknowledged in `CLAUDE.md`, which makes it a known debt rather than a finding, but it is the single largest untested surface in the app and it is where CODE-15 lives. Extracting the pure parts (`readGoalForm`, `numVal`) into a testable module would let `smoke.js` cover input validation without loading the DOM.
- **`js/ui.js` is 1,570 lines and mixes six view renderers, twelve sheet builders, the focus trap, toasts and the confetti animation.** Nothing in it is wrong, but "keep functions small, one responsibility per function" is already strained — `renderToday` alone is ~180 lines of nested template literals. Splitting sheets from views would make the file navigable without changing behaviour. Overlaps CODE-13.
- **Derived state is recomputed rather than incrementally maintained.** That is a deliberate, correct architectural choice (it is *why* nothing drifts), but it means every performance fix has to be a cache, and caches are where CODE-09 lives. The `rev` counter (CODE-14) is the half-built version of the right answer.
- **The "reading goal" is found by scanning for `gate === 'summary'` in four separate places** (`store.js:537`, `ui.js:264`, `ui.js:500`, `ui.js:534`). If a second gated goal is ever supported, all four must change together.
- **`package-lock.json` is gitignored** (`.gitignore:5`) while `.github/workflows/deploy.yml:63-65` explains why `npm ci` cannot be used. Once CODE-06 removes the eslint dependency this resolves itself; until then CI installs an unpinned toolchain.

## Future Risks

- **Growth to 10,000+ logged days is bounded by hard guards, not by design.** `Goals.timeline` stops after 4,000 iterations (`goals.js:172`), `history()` after 4,000 (`store.js:715`), `currentStreak()` and `habitStreak()` after 1,000 (`store.js:686`, `1003`). These are sane fuses, but they fail *silently and wrongly*: an account past ~11 years computes a level from a truncated replay, and a streak longer than 1,000 days simply stops counting. Nothing tells the user.
- **`localStorage` is a hard ceiling of roughly 5 MB, and the whole state is one key.** With years of per-day plan snapshots (`ensureLog` copies the full plan and habit list into every day, `store.js:284-300`), journals and summaries, quota exhaustion is a matter of when. When it arrives it lands on CODE-04's silent path.
- **The long-term vision in `project.md` names cloud sync and multi-device.** Two things block it structurally today: state is a single opaque blob with no per-record timestamps or IDs suitable for merge (only `at`/`updatedAt` on some records), and `bestStreak` is a mutable high-water mark written on read (`store.js:697-701`) — two devices reading concurrently would each ratchet it independently. Any sync design will have to make derived-on-read state stop writing.
- **CODE-02's class of bug will recur** every time a new goal attribute is added that `goalsForDay` or `computeDayStatus` reads from the goal's current value rather than a dated history. `scheduleHistory` is the pattern that works; it needs to become the rule.

## Recommended Refactoring

The smallest set of structural changes that removes the most risk, in order:

1. **Make the storage boundary honest** — CODE-01, CODE-03, CODE-04. One change to `store.js`: a `flush()`, a quarantine-on-unreadable path, and a `meta.storageError` flag; one change to `ui.js` `banners()` to render it. This turns three silent data-loss modes into one visible, recoverable one and is under half a day's work.
2. **Give past days a dated view of goals** — CODE-02. Add `archivedOn` and stop `restartGoal` from moving `startDate`, then have `goalsForDay` resolve activation for the date being asked about, the same way `scheduleOn` already resolves schedules. This is the only finding needing real design thought, and it protects the app's central promise.
3. **Delete the foreign tooling tree and fix the deploy path** — CODE-05, CODE-06. Half an hour, and it makes the safety net legible again.
4. **Memoise the two remaining aggregates on the existing revision counter** — CODE-09, CODE-14. Use `rev` as the cache key for `history()` and `totalXp()` and lengthen the journal save debounce; this also retires dead code.
5. **Add a render/boot error boundary and bound the rung list** — CODE-07, CODE-08. Together they convert the two ways the app can currently become a blank or frozen screen into a message the user can act on.

Findings CODE-10 through CODE-16 are small, independent cleanups that can ride along with whichever of the above touches the same file; none of them needs its own change.
