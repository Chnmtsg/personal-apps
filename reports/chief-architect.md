# Chief Architect Ruling — Arise

**Inputs read in full:** `D:\3_Claude\Apps\reports\ui-review.md` (32 findings, 66/100), `D:\3_Claude\Apps\reports\code-review.md` (16 findings, 55/100), `D:\3_Claude\Apps\reports\engineering-manager.md` (39 `WORK-` items, 6 conflicts).

**Measured against:** `D:\3_Claude\Apps\arise\knowledge\project.md`, `coding-standards.md`, `ui-guidelines.md`, `review-conventions.md`, and the Invariants section of `D:\3_Claude\Apps\arise\CLAUDE.md`.

I independently verified the load path (`js/store.js:107-124`), the archive/re-baseline path (`js/store.js:365-382, 496-516`), the best-streak high-water writes (`js/store.js:697-701, 732-735`), `render()` (`js/ui.js:1516-1529`), `banners()` (`js/ui.js:172-188`), the absence of any `safe-area-inset-top` in `styles.css`, and the foreign tooling tree (`tools/harness/salary-width.js`, `tools/harness/debts.js`, `.github/workflows/deploy.yml:79`). Every load-bearing claim in both reviews that I checked, held.

---

## 1. Executive Report

**Does this application ship today? No.**

Two Critical defects are real, verified, and both breach hard constraints written in `project.md` and `CLAUDE.md`. Pausing a goal — a one-tap, non-destructive-looking action — retroactively converts lived partial days into complete days and ratchets `state.bestStreak` upward permanently; that is the "a day you have lived is never re-judged" invariant broken and a number the user did not earn put on the screen, which is this app's equivalent of getting the money wrong. Separately, an unreadable saved state is overwritten with a fresh seed and the user is told nothing, on a device that holds the only copy of the data, in an app whose own documentation says Export is the only recovery there is. Neither defect needs a rewrite: nothing in either report was sized above M, the progression engine and migration discipline are genuinely strong, and the whole merged backlog is roughly four engineer-weeks. The gap between the two scores is almost entirely CODE-02, which the UI reviewer could not see from the surface, plus a narrower reading of the reseed path — I uphold the lower verdict.

**The release gate is six items and about three engineer-days:**

| Gate item | Why it gates |
|---|---|
| WORK-01 | Critical. Past days re-judged, best streak permanently inflated. |
| WORK-02 | Critical. The user's only copy of their data destroyed silently. |
| WORK-03 | A failed write reports success. Same class of loss, same twenty lines. |
| WORK-04 | The tick that completed the day can be lost on backgrounding. XS. |
| WORK-08 | The goal editor lets the user de-select Sunday and then judges them on Sunday. XS. |
| WORK-09 | The header renders under the status bar on the app's stated primary device. XS. |

Plus: `node tools/smoke.js` and `node tools/render.js` green from `D:\3_Claude\Apps\arise`; a new smoke assertion that `dayStatus(pastDay)` and `history().best` are unchanged across a pause and a re-baseline, broken on purpose once to prove it fails; `VERSION` bumped in `D:\3_Claude\Apps\arise\sw.js`; and the WORK-02, WORK-08 and WORK-09 paths driven by hand in a browser over `http://`, because `js/app.js` has no automated coverage at all.

Clear that gate and Arise is releasable. Everything else in this backlog is quality work on a fundamentally sound application.

---

## 2. Approved Improvements

Every item below is approved. "Modified" means I narrowed or redirected the recommendation; the modification is binding and the rejected scope is listed in section 3.

| ID | Title | Ruling | Reason for approval |
|---|---|---|---|
| WORK-01 | Pause / re-baseline re-judges past days, inflates best streak | Approve (modified) | Critical. Breaks the app's central promise and puts an unearned number on every screen. Mirror `scheduleHistory` — do not invent a new mechanism. |
| WORK-02 | Unreadable state silently overwritten | Approve (modified) | Critical. Total unrecoverable loss of the only copy. See C-2 for the binding shape. |
| WORK-03 | Failed write logged to console only | Approve | The app reports success while nothing persists. Same twenty lines as WORK-02; free to land together. |
| WORK-04 | Debounced writes never flush on hide/close | Approve | XS. Loses the last action before backgrounding on the only device that holds the data. |
| WORK-05 | Foreign deploy workflow and tooling tree | Approve (modified) | Delete, do not repair. See C-5. A workflow that looks like it deploys Arise and does not is a trap under release pressure. |
| WORK-06 | Today leads with streak/XP | Approve | The rendered order is the inverse of the order `ui-guidelines.md` writes for this exact screen. Reorder only. Requires WORK-16 first. |
| WORK-07 | Every state change destroys keyboard focus | Approve (modified) | Guidelines require keyboard friendliness. Minimal restore only; scope reduced from M to S. Land after WORK-11. |
| WORK-08 | Dead weekday checkboxes and miss-threshold field | Approve | XS, and it gives the user a wrong model of what the app judges them on. Release gate. |
| WORK-09 | Top bar ignores the iOS safe area | Approve | XS. One token, one padding value, on the stated primary device. Release gate. |
| WORK-10 | Unbounded rung rendering | Approve (modified) | Bound the rendered list and validate in the editor. Do **not** clamp `maxLevel` in `goals.js` — see section 3. |
| WORK-11 | No boot/render error boundary | Approve | Converts a white screen into a message with an Export button. The recovery panel must be self-sufficient. |
| WORK-12a | Journal keystroke re-serialises whole state | Approve | Split out from WORK-12. A longer debounce on `setJournal` is XS and removes a real main-thread cost. |
| WORK-13 | Streak-holding rules implemented twice | Approve | XS. A latent divergence in the number at the top of every screen. Land immediately after WORK-01. |
| WORK-14 | Unconfirmed destructive "Copy from…" | Approve | XS. Nine of ten destructive actions are confirmed; this is the tenth. |
| WORK-15 | Archive rows give no sign they open | Approve | XS. `project.md` calls the summary archive the most useful thing in the app. |
| WORK-16 | Header chips unnamed; active tab not exposed | Approve | XS, and it blocks WORK-06. |
| WORK-17 | Transparent sticky search bar in dark mode | Approve | XS. Reads as a rendering glitch in the default theme. |
| WORK-18 | Disabled icon buttons look enabled; daypager unbounded backwards | Approve | XS. One unscoped rule plus one condition. The second prevents the app implying a history the user never had. |
| WORK-19 | Locked future-day rows | Approve (modified) | See C-4. One coherent rule, smaller than either proposal. |
| WORK-20 | Step progress and heat cells meaningful only in `title` | Approve (modified) | `title` does not exist on touch. `advanceHint()` is already computed and already visible on Plan and Stats. |
| WORK-21 | Exercise editor labels wrong for time/distance | Approve | Same dead-control class as WORK-08; reuses the pattern WORK-08 establishes. |
| WORK-22 | Archives show 40 while the header states the total | Approve (modified) | "Honest" is a project principle. State the truncation; do not build a "show all". |
| WORK-23 | Missing / control-less empty states | Approve | `ui-guidelines.md` states the rule verbatim. One `||` for the library, one link for habits. |
| WORK-24 | Targets as "≤ 12" or a bare number | Approve | XS, one function, four call sites. Directly serves "understandable without explanation". |
| WORK-25 | Flame, warn and gold don't hold their meanings | Approve | XS. The project wrote a semantic colour contract; the app breaks it in three places. |
| WORK-26 | Missed vs future distinguished only by colour | Approve | XS. "Never carry meaning in colour alone" is a written rule, and these two facts have opposite emotional weight. |
| WORK-27 | Type below a readable floor in nine places | Approve | Legibility for a user reading at 6am. Navigation labels at 9px are not decoration. |
| WORK-28 | No type scale | Approve (modified) | Token definition and CSS mapping only. One dedicated pass, not a drip. |
| WORK-29 | Layout not on the 8px system | Approve (modified) | Container-level values only, as the reviewer scoped it. |
| WORK-30 | Card radii ignore the `--r` tokens | Approve (modified) | `.item` to `var(--r)` plus one control radius. At most one new token. |
| WORK-31 | Sheet title double-escaped | Approve | One `esc()` deleted. Visible wrong character. |
| WORK-32 | Numeric values into HTML attributes without `esc()` | Approve | The invariant says *everything* reaching `innerHTML` goes through `esc()`, and `importJson` is a real path the render suite already tests for. |
| WORK-33 | Duplicate element IDs in the reading form | Approve (modified) | Take the `idPrefix` parameter. Two documented workarounds already exist to route around this; that is the definition of a standing trap. |
| WORK-34 | Dead code | Approve (modified) | Delete `setNote`, `rev`, the impossible feature test, and fold the `.tabbar` rule. `rev` goes — see WORK-12b. |
| WORK-35 | Direction control discarded on save | Approve (modified) | Make it derived and read-only. Two sources of truth for one fact is the actual defect. |
| WORK-36 | Hard-coded colours and shadows | Approve (modified) | `--on-accent` / `--on-good` tokens and the shadow consolidation. |
| WORK-37 | `theme-color` pinned to dark | Approve | One line. |
| WORK-38 | XP formatting inconsistent in one card | Approve | XS, one helper. |
| WORK-39 | Stats called three things | Approve (modified) | Change the `<h2>`. Leave the route id alone. |

---

## 3. Rejected Improvements

No whole item was rejected — both reviews are evidence-led and there is very little preference in them. What I reject is **scope inside approved items**. These rejections are binding: the work below must not be done under the item it sits in.

| ID | Rejected scope | Reason for rejection |
|---|---|---|
| WORK-10 | Clamping `maxLevel` inside `js/goals.js` | Clamping changes `valueAt`/`targetOn` for any existing goal above the ceiling, which re-judges every past day of that goal. The fix would breach the top invariant. Bound the *rendered* list and validate at input time instead. |
| WORK-10 | Windowed rung rendering with ellipsis | A UI feature. The freeze is removed by the bound alone. Premature. |
| WORK-12b | Memoising `history()` and `totalXp()` | Deferred, not rejected — see section 5. |
| WORK-22 | "Show all 96" button and re-render | Solves a problem nobody reported. The defect is a header that contradicts the list beneath it; one sentence fixes that. |
| WORK-20 | Tapped-cell caption line on the heat map | Speculative new interaction. `aria-label` per cell closes the stated gap. |
| WORK-28 | Sweeping the ~30 inline `style="font-size"` uses in `js/ui.js` | High-churn edit across a 1,570-line file with no automated coverage of rendered output, for zero user-visible change. Replace opportunistically when a line is being edited anyway. |
| WORK-29 | Snapping every padding, gap and margin in `styles.css` | The container values carry the visible rhythm. The rest is churn against no measurable defect. |
| WORK-36 | Re-plumbing the SVG ring gradient to read computed token values | Machinery for a theme change that may never happen. Accept the duplication with a comment naming it as such, which the reviewer offered as the alternative. |
| WORK-39 | Changing the route id `#/progress` | Breaks bookmarks and the hash router for no user benefit. The reviewer said so; I am making it binding. |
| WORK-05 | Porting the four `check-*.mjs` predicates and the harness to Arise | Porting is new feature work wearing a cleanup's clothes. If an escaping or contrast check is wanted for Arise, it is its own proposal with its own justification. |
| WORK-35 | Keeping the user's Direction choice and validating it against the numbers | Preserves two sources of truth for one derived fact. The smaller change removes the risk entirely. |

---

## 4. Deferred

| ID | Title | What would change the decision |
|---|---|---|
| WORK-12b | Memoise `history()` and `totalXp()` on a revision key | Two things, both required. **(a) A measurement.** The code review states plainly "Nothing is wrong today"; `coding-standards.md` says never optimise prematurely. Bring me a frame time from a real low-end phone with a 3+ year account where a tap or a keystroke exceeds ~100 ms, and this is approved immediately. **(b) A correctness precondition.** `history()` and `currentStreak()` *write* `state.bestStreak` and call `save()` during a read (`js/store.js:697-701, 732-735`). Memoising a function that mutates state on read is exactly how a wrong number becomes a permanently sticky wrong number, and this is a high-water mark that nothing can revoke. The write-on-read must be lifted out of the read path before any cache goes in front of it. Until both hold, this stays deferred and `rev` is deleted with WORK-34 rather than kept warm for a cache that may never be built. |

---

## 5. Conflict Rulings

### C-1 — Severity of the silent reseed. **Critical stands.**

`review-conventions.md` lists "data loss" first in the Critical band, and `project.md` states "Stored data is sacred… Backup is More → Export, and it is the only recovery there is." A path that overwrites the user's only copy with a seed and says nothing is data loss by any reading. The UI reviewer's framing — a missing *state* rather than destruction — is a legitimate surface-level read and the finding is correctly reported as High from that vantage; it is not wrong, it is narrower. UI Review's separate statement that "no hard constraint from `project.md` is broken" is set aside: it was made without sight of CODE-02, and it is not the UI reviewer's call on the storage layer. Severity remains as the originating reviewer set it, per the conventions.

### C-2 — May an unreadable state be overwritten at all? **BLOCKING. Ruled. Implementable shape below.**

Neither reviewer's position is adopted whole. UI-04's "do not change the reseed behaviour, only surface it" is rejected: a banner that explains a destruction which has already been committed is an apology, not a fix, and the bytes it apologises for are gone. CODE-01's "do not `save()` on the seed path at all" is rejected as stated: it leaves the app booting into an unsaved seed indefinitely, which invents a second, subtler failure mode.

**The ruling — `load()` in `D:\3_Claude\Apps\arise\js\store.js:107-124`:**

1. In the `catch`, **before anything else**, copy the raw string to a quarantine key `arise.state.v1.unreadable`. **Write once only** — if that key already exists, do not overwrite it. The first failure holds the real bytes; every later failure is of something we wrote ourselves.
2. **Read the quarantine key back and compare.** This is the pivot of the whole decision. If the quarantine write verifiably succeeded, the original bytes are preserved and overwriting the primary key is no longer destructive — seed and `save()` normally, so the next boot is clean and the quarantine is never at risk of being re-entered. If the quarantine write failed or read back wrong, **do not `save()`**: boot the seed in memory only, so the unreadable original survives on disk for a later attempt.
3. Set `meta.storageError = 'unreadable'` and render a persistent, non-dismissible `.banner.warn` through the existing `banners()` (`js/ui.js:172-188`) carrying **two** routes: *Restore from backup* wired to the existing import action, and *Download the unreadable copy*, which dumps the quarantined raw string to a file. The second matters — it gets the user's bytes off the device even though the app cannot parse them, and it costs almost nothing next to the export code that already exists.
4. **Suppress the 400 ms onboarding auto-open (`js/app.js:769`) while `meta.storageError` is set.** Inviting the user to re-onboard on top of a wipe is a large part of what makes the current path so damaging. This is inside UI-04's own stated evidence; it is not a new finding.

Rationale: the smallest change that removes the risk is *preserve the bytes first, then decide*. Once the bytes are preserved the question "may we overwrite?" stops being consequential, which is why the read-back is the load-bearing step rather than the save policy. This is still S.

### C-3 — Contention over `render()` (`js/ui.js:1516-1529`). **One owner, one defined pipeline.**

`render()` gets exactly this shape, and the three items land in this order:

1. Capture a focus key from `document.activeElement` — `data-act` + `data-id` + `data-date` — **guarded** so the stub DOM in `tools/render.js` degrades instead of throwing, consistent with the existing guard at `js/ui.js:970`.
2. `try { el.innerHTML = fn() } catch { el.innerHTML = recoveryPanel(err); return }`.
3. Restore focus by key. **Never on the catch path** — on a throw, focus goes to the recovery panel's Export button and nowhere else.
4. Tab state and the two header chips.

Precedence between the two surfaces is settled: the recovery panel owns `#view` unconditionally and **must be self-sufficient** — it carries its own Export button and must not depend on `banners()`, because `banners()` is rendered inside `renderToday()`, i.e. inside the `try` that just failed.

The third strand dissolves. **WORK-12 does not touch `render()` at all.** The chips must reflect current state, so the `S.progress()` and `S.currentStreak()` calls stay; if 12b is ever approved it makes those calls cheap rather than removing them. Order: **WORK-11, then WORK-07.** The `try/catch` shape lands first so the focus restore is written against its final surroundings.

### C-4 — What a future-day row is allowed to do. **Reference material is reachable; nothing that mutates is.**

`ui-guidelines.md` already states the rule: "A future day is read-only and must look it — but its reference material, like how-to notes, stays readable." Applied literally, both reviewer proposals shrink into one smaller change:

- **Delete** `.goal.locked { pointer-events: none }` (`styles.css:550`) entirely.
- Add `disabled` to the tick and the action buttons in `goalRow` and the workout row builder when `locked` — they leave the tab order and the browser communicates the state, which is what UI-32 asked for.
- Do **not** disable `goal-main`. It opens the ladder and the next step — reference material. It stays focusable and tappable, exactly like the how-to button that `.item.locked` already excepts.

No `pointer-events` escape hatch is needed, because a disabled button does not fire and an enabled one should. This is smaller than either proposal and it removes a CSS mechanism rather than adding one. The contrast half of UI-16 is approved as written: dim the tick chrome rather than the whole row, and put `.sub` on `--faint`, which already clears AA.

### C-5 — Delete or repair the deployment path. **Delete the deploy job. Delete the foreign tree. Keep the verify job.**

Arise is a single-user, offline, local-only PWA. There is no evidence it is deployed from this repository, and `.github/workflows/deploy.yml:3-11, 79` was written for a different application. Repairing a foreign workflow to publish an app that may never be published is speculative work; if hosting is wanted later, five lines written for Arise beat a repaired inheritance.

- Delete the `deploy` job and rewrite the header.
- **Keep the `verify` job** — `npm run verify` is `node tools/smoke.js && node tools/render.js`, which is correct for this app and is the only automated safety net there is. Do not throw it out with the deploy job.
- Delete `tools/lint.mjs`, `tools/check-saves.mjs`, `tools/check-escaping.mjs`, `tools/check-contrast.mjs`, `tools/harness/`, `eslint.config.mjs` and the `eslint` devDependency. I confirmed the tree is foreign — `tools/harness/salary-width.js` and `tools/harness/debts.js` belong to an expense tracker. Fix the text at `.gitignore:1`.
- This also closes the unpinned-`npm install` debt for free: with `eslint` gone the app has zero dependencies and CI simply runs node.
- **Two commits, not one.** The workflow and the tooling tree are one root cause but two independent changes.

### C-6 — The two overall scores. **The honest figure is 55/100. Not fit for release today.**

The reviewers did not contradict each other; they saw different things. UI Review scored the surface accurately and cannot be faulted for missing a defect that only shows up by tracing `goalsForDay` through `archiveGoal`. Where the two reports overlap — the reseed path — they agree on the observation and differ only on framing. The eleven-point gap is CODE-02 plus C-1, exactly as the Engineering Manager diagnosed. When one reviewer finds a Critical the other could not see, the finding decides the band, not the average. Re-score after the release gate closes: with both Criticals and the storage boundary shut, the remaining backlog is Medium-and-below consistency work and the app moves into the 75-89 band on its own findings.

---

## 6. Implementation Priority

Five stages. The order is not the Engineering Manager's priority order in two places, and I say why.

### Stage 1 — The release gate (~3 engineer-days)

`WORK-02` → `WORK-03` → `WORK-04` → `WORK-01` → `WORK-13` → `WORK-08` → `WORK-09` → `WORK-05`

The storage trio goes first even though WORK-01 is the more serious defect. Three reasons: all three live in the same twenty lines of `js/store.js` and surface through the same `banners()` call, so splitting them triples the cost; the fix is S+S+XS against WORK-01's M plus design thought; and until WORK-02 lands, any hand-testing of WORK-01 risks the reseed path eating the tester's own state. WORK-13 follows WORK-01 immediately and never later — both change what a streak means, and merging two divergent streak rules after a correctness fix is how the fix gets undone. WORK-08 and WORK-09 are XS and independent; there is no version of this sprint in which they survive it. WORK-05 is a standalone pair of commits that touches no application code and clears the trap before anyone reaches for CI under release pressure.

**Binding direction for WORK-01.** Mirror `scheduleHistory` (`js/goals.js:109-118`) — record `archivedOn` when `archiveGoal` sets the flag, stop `restartGoal` moving `startDate`, and record the new baseline as a dated entry the timeline reads. Do not invent a second mechanism for the same idea.

**Binding direction on the WORK-01 migration — this decides whether the fix itself re-judges a lived day.** Existing archived goals have no `archivedOn`, and existing re-baselined goals have already had `startDate` moved. Any attempt to reconstruct those dates is a guess, and a guess would move real users' past days — potentially turning complete days back into partial and dropping a live streak, which is the same invariant breach pointing the other way. Therefore: **grandfather.** For a goal already `archived` at migration time, set `archivedOn = startDate` so it is treated as never having been asked, which reproduces today's computed history exactly and moves nobody's past. Do not attempt to un-move a `startDate`. The fix binds from the moment it ships. This is additive, tolerates old state, and destroys nothing — as `coding-standards.md` requires.

**Binding direction on prevention.** Add "resolve a past day from a dated history, never from a goal's current value" to `D:\3_Claude\Apps\arise\knowledge\coding-standards.md` as part of WORK-01. This is the Engineering Manager's second recommendation and I am adopting it. `scheduleHistory` is the pattern that already works; without the written rule, the next goal attribute reintroduces CODE-02 verbatim.

### Stage 2 — Resilience and the primary screen

`WORK-11` → `WORK-10` → `WORK-07`, then `WORK-16` → `WORK-06` → `WORK-20`, then `WORK-31`, `WORK-32`, `WORK-34`

The boundary before the bound: ship the net so an unbounded-rung goal degrades to a message while the bound is still in flight — noting that 40,000 nodes freeze rather than throw, so the net does not make the bound optional. WORK-07 after WORK-11 per C-3. Labels before the reorder: WORK-06 removes the streak from the hero on the grounds that the chip carries it, and WORK-16 is what makes the chip say what it counts. WORK-20 after WORK-06 or `advanceHint` gets placed twice.

### Stage 3 — The honesty and affordance sweep (all XS/S)

`WORK-14`, `WORK-15`, `WORK-17`, `WORK-18`, `WORK-19`, `WORK-21` (after WORK-08), `WORK-22`, `WORK-23`, `WORK-24`, `WORK-25`, `WORK-26`, `WORK-35`, `WORK-37`, `WORK-38`, `WORK-39`, `WORK-12a`

This is the highest impact-per-day work in the backlog once the gate is shut, and the Engineering Manager is right that it should not be dripped. WORK-21 reuses the `hidden` pattern WORK-08 establishes; WORK-35 touches the same goal editor form.

### Stage 4 — One dedicated design-token pass

`WORK-27` → `WORK-28`, `WORK-29`, `WORK-30`, `WORK-36`

Its own change, its own commits, nothing else in flight. Every one of these is the app failing a rule the project wrote for itself, and each will lose a scheduling argument forever if it is allowed to compete with feature work. WORK-27 before WORK-28 so the scale's bottom rung is 11px and not a codified 8.5px.

### Stage 5 — Cleanup

`WORK-33`

**Cross-cutting, per stage and not per item:** bump `VERSION` in `D:\3_Claude\Apps\arise\sw.js`; run both suites; and hand-drive in a browser over `http://` every item that touches `js/app.js` — WORK-08, WORK-14, WORK-21, WORK-23, WORK-35 and the whole click-routing surface — because neither harness loads it. WORK-07 additionally uses `document.activeElement`, which the stub DOM does not implement, so it needs its own guard and its own manual pass.

---

## 7. Architecture Strategy — Next Quarter

**What stays, and is off limits to change.** Vanilla HTML/CSS/JS. No build step, no bundler, no transpiler, no framework, no dependencies — after WORK-05 the dependency count is zero and it stays there. The fixed six-file load order off `window.Arise` / `window.Store` / `window.UI`. All state in one `localStorage` key under `arise.state.v1`, versioned, migrations additive. Derive, never store. Fully offline: no network call, no account, no telemetry, no secret. Off limits without a fresh architectural proposal: adding a build step, adding a dependency, splitting state across keys, and any form of cloud sync.

**The single exception to the one-key rule** is the write-once `arise.state.v1.unreadable` quarantine from C-2. It is a lifeboat, not state: nothing in the normal read path ever touches it, and it exists precisely so the one-key rule can never cost a user their history.

**What changes.** Four things, all structural, all small:

1. **The storage boundary gains an explicit error state.** `meta.storageError` becomes the single fact describing storage health, and `banners()` becomes the single place it is surfaced. Today the layer is dishonest in three separate ways; after Stage 1 there is one visible, recoverable condition with a route out of it.
2. **Goal activation joins schedule in being dated rather than current.** `archivedOn` plus a baseline history mirroring `scheduleHistory`. The rule goes into `coding-standards.md` in the same change, because the code review is right that this bug class recurs on every new goal attribute otherwise.
3. **`render()` gets one owner and one defined pipeline** (C-3). Three findings from two reports all wanted to edit fourteen lines; after Stage 2 the order of capture, guard, restore and chip update is written down and further changes go through that shape.
4. **Design tokens become mandatory for new code** once Stage 4 lands. Before Stage 4 the rule is unenforceable, because the drift is already the norm; after it, a hard-coded hex or an off-scale size in a review is a finding.

**Explicitly off limits.**

- **No rewrite of `js/ui.js`.** It is 1,570 lines and the code review is right that "one responsibility per function" is strained. It is also the file with the least automated coverage of its actual output, so a split is maximum risk for zero user-visible benefit. If it splits, it splits when a feature forces it, one extraction at a time, never as a project. A refactor removes this risk; a rewrite does not.
- **No cache in front of any function that writes state on read.** That is the WORK-12b precondition and it is now a standing rule.
- **No incremental maintenance of derived state.** Recompute-and-memoise is *why* nothing drifts. `commit()` stays O(1).
- **No fifth semantic colour**, and no change to the `#/progress` route id.

**Risks I am recording, not findings — neither reviewer raised these as findings and I am not adding any.**

- The best-streak high-water mark is written during a read, inside a render path (`js/store.js:697-701, 732-735`). It is correct today because it is monotone, but it is the structural blocker for the multi-device sync named in `project.md`'s long-term vision, and it is why WORK-12b is deferred rather than approved. Any sync design must begin by lifting this write out of the read path.
- The iteration guards at `goals.js:172`, `store.js:715`, `store.js:686` and `store.js:1003` fail silently and wrongly rather than loudly. Trigger for revisiting: before any account approaches 1,000 consecutive streak-holding days or eleven years of history. Not scheduled; recorded so the trigger is not discovered by a user.
- `localStorage` is a hard ~5 MB ceiling and `ensureLog` copies the full plan and habit list into every day. Quota exhaustion is a question of when. WORK-03 is the right first move because it converts that arrival from silent to visible; state-size work is not scheduled and should not be until WORK-03's banner has actually fired for someone.

---

## 8. Recommended Next Action

Start Stage 1 with WORK-02, implementing the C-2 shape exactly as ruled — quarantine the raw string to a write-once `arise.state.v1.unreadable`, read it back to verify, and only then allow the seed to be saved; if the read-back fails, boot the seed in memory and never write it. That single change is under half a day, it is the cheapest removal of the largest loss in the entire backlog, it establishes the `meta.storageError` flag and the `banners()` mechanism that WORK-03 and WORK-04 immediately reuse, and it is the prerequisite for hand-testing everything that follows without the tester risking their own state. It was also the one thing the Engineering Manager said could not start until I ruled; it is ruled, so it starts now.
