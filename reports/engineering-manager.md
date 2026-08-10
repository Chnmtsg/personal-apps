# Engineering Roadmap — Arise

**Inputs:** `D:\3_Claude\Apps\reports\ui-review.md` (32 findings, 66/100) and `D:\3_Claude\Apps\reports\code-review.md` (16 findings, 55/100). Both reports were read in full. All 48 source findings are accounted for below across 39 `WORK-` items.

**Merged by:** Engineering Manager. Severities are carried unchanged from the originating reviewer. Priority and effort are mine.

---

## Project Health

Arise is not releasable today, and the two reviews disagree about how far from releasable it is. Code Review found two Critical defects in the data layer — an unreadable saved state is silently overwritten with a fresh seed, and an ordinary "Pause" or re-baseline retroactively re-judges lived days and permanently ratchets the best-streak high-water mark — which is a direct breach of the `CLAUDE.md` invariants and scores 55/100. UI Review, working from the same source but a different angle, scored 66/100 and explicitly concluded that no hard constraint from `project.md` was broken; it did independently find the same silent-reseed path and rated it High. Taken together: the engine, escaping discipline, sheet accessibility and migration tests are genuinely strong, but the storage boundary is dishonest in three separate ways and the primary screen contradicts the project's own written screen order — so the honest reading is the lower of the two scores until the P0 band is closed.

---

## Priority Matrix

| Item ID | Title | Source IDs | Severity | Priority | Effort | Depends On |
|---|---|---|---|---|---|---|
| WORK-01 | Pausing or re-baselining a goal re-judges past days and permanently inflates best streak | CODE-02 | Critical | P0 | M | — |
| WORK-02 | Unreadable saved state is silently overwritten with a fresh seed, with no user-visible explanation | CODE-01, UI-04 | Critical (CODE-01) / High (UI-04) — see Conflicts | P0 | S | — |
| WORK-03 | A failed write (quota, private mode) is logged to console only; UI keeps reporting success | UI-03, CODE-04 | High | P1 | S | WORK-02 |
| WORK-04 | 60 ms debounced writes never flush on `visibilitychange` / `pagehide` | CODE-03 | High | P1 | XS | WORK-03 |
| WORK-05 | Deploy workflow publishes `expense-pwa`, and a foreign non-functional tooling tree is checked in | CODE-05, CODE-06 | High (CODE-05) / Medium (CODE-06) | P1 | S | — |
| WORK-06 | Today leads with streak/XP; what the day asks is below the fold | UI-01 | High | P1 | M | WORK-16 |
| WORK-07 | Every state change destroys keyboard focus | UI-02 | High | P1 | M | — |
| WORK-08 | Goal editor shows dead weekday checkboxes and a dead miss-threshold field | UI-05 | High | P1 | XS | — |
| WORK-09 | Top bar ignores the iOS safe area on a home-screen install | UI-06 | High | P1 | XS | — |
| WORK-10 | Goal detail renders one DOM node per rung with no upper bound | CODE-07 | Medium | P2 | S | WORK-11 |
| WORK-11 | No boot/render error boundary: a throw leaves a blank screen | CODE-08 | Medium | P2 | S | WORK-02, WORK-03 |
| WORK-12 | `history()` and `totalXp()` unmemoised; whole state re-serialised per journal keystroke | CODE-09 | Medium | P2 | M | WORK-01, WORK-13 |
| WORK-13 | Streak-holding rules implemented twice (`holdsStreak` vs inlined in `currentStreak`) | CODE-10 | Medium | P2 | XS | WORK-01 |
| WORK-14 | "Copy from…" replaces a whole training day with one unconfirmed tap | UI-13 | Medium | P2 | XS | — |
| WORK-15 | Past summaries and journal entries give no sign that they open | UI-14 | Medium | P2 | XS | — |
| WORK-16 | Header chips announce as "0"/"Lv 1"; active tab not exposed to assistive tech | UI-15 | Medium | P2 | XS | — |
| WORK-17 | Exercise picker's sticky search bar is transparent in dark mode | UI-11 | Medium | P2 | XS | — |
| WORK-18 | Disabled icon buttons look enabled; daypager can walk back indefinitely | UI-12, UI-31 | Medium (UI-12) / Low (UI-31) | P2 | XS | — |
| WORK-19 | Locked future-day rows: sub-text below AA, goal detail unreachable, Enter is a silent no-op | UI-16, UI-32 | Medium (UI-16) / Low (UI-32) | P2 | S | — |
| WORK-20 | Step progress and heat-map cells carry meaning only in a `title` tooltip | UI-17 | Medium | P2 | S | WORK-06 |
| WORK-21 | Exercise editor shows "Sets / min" and "Reps" for time and distance exercises | UI-18 | Medium | P2 | S | WORK-08 |
| WORK-22 | Archives silently show the first 40 entries while the header states the true total | UI-19 | Medium | P2 | XS | — |
| WORK-23 | Missing empty state on the exercise library; empty states that name a destination but offer no control | UI-20, UI-28 | Medium (UI-20) / Low (UI-28) | P2 | S | — |
| WORK-24 | Goal targets stated as "≤ 12" or a bare number with no verb | UI-21 | Medium | P2 | XS | — |
| WORK-25 | Flame, warn and gold do not hold their assigned meanings | UI-22 | Medium | P2 | XS | — |
| WORK-26 | Missed and future days distinguished only by colour; heat legend omits future/no-data | UI-23 | Medium | P2 | XS | — |
| WORK-27 | Type below a readable floor in nine places (8.5px–10.5px) | UI-07 | Medium | P2 | S | — |
| WORK-28 | No type scale: ~24 distinct font sizes, ~30 set inline in `js/ui.js` | UI-08 | Medium | P2 | M | WORK-27 |
| WORK-29 | Layout is not on the 8px spacing system | UI-09 | Medium | P2 | M | — |
| WORK-30 | Card radii ignore the `--r` tokens | UI-10 | Medium | P2 | S | — |
| WORK-31 | Plan editor sheet title is escaped before `textContent`, so it double-escapes | UI-29, CODE-11 | Low | P3 | XS | — |
| WORK-32 | Numeric state values interpolated into HTML attributes without `esc()` | CODE-12 | Low | P3 | XS | — |
| WORK-33 | Reading form's element IDs are duplicated in the document | CODE-13 | Low | P3 | S | — |
| WORK-34 | Dead code: unused `rev` counter, unused `setNote`, superseded `.tabbar` rule, impossible feature test | CODE-14, CODE-16 | Low | P3 | XS | WORK-12 |
| WORK-35 | Goal editor's Direction control is discarded on save | CODE-15 | Low | P3 | XS | WORK-08 |
| WORK-36 | Hard-coded colours in view code; inconsistent and partly hard-coded shadows | UI-24, UI-25 | Low | P3 | S | — |
| WORK-37 | `theme-color` pinned to the dark palette in both themes | UI-26 | Low | P3 | XS | — |
| WORK-38 | XP number formatting inconsistent within a single card | UI-27 | Low | P3 | XS | — |
| WORK-39 | The Stats module is called three different things | UI-30 | Low | P3 | XS | — |

---

## Quick Wins

Items at XS or S effort that remove a Medium or higher severity finding. Do these first **inside their priority band** — a quick win does not jump the queue past a Critical.

**P0 band:** WORK-02 (S, Critical).

**P1 band:** WORK-08 (XS, High) — one `hidden` attribute stops the goal editor lying about scheduling. WORK-09 (XS, High) — one token plus one padding value fixes the header on every notched iPhone install. WORK-04 (XS, High) — a `flush()` and two listeners stop losing the last tick before backgrounding. WORK-03 (S, High) and WORK-05 (S, High/Medium).

**P2 band:** WORK-13, WORK-14, WORK-15, WORK-16, WORK-17, WORK-18, WORK-22, WORK-24, WORK-25, WORK-26 (all XS, Medium); WORK-10, WORK-11, WORK-19, WORK-20, WORK-21, WORK-23, WORK-27, WORK-30 (all S, Medium).

Ten XS items in the P2 band together cost roughly half a sprint and close the exercise-library blank card, the unconfirmed destructive copy, the invisible disclosure affordance, the assistive-tech gaps, the transparent search bar, the archive that contradicts its own header, the maths-notation targets and the colour language. That is the highest impact-per-day work in the whole backlog after the P0/P1 bands.

---

## Sprint Plan

**Sprint 1 — Make the data layer honest.**

Items: WORK-01, WORK-02, WORK-03, WORK-04, WORK-05, WORK-13, WORK-08, WORK-09.

Effort: 1 × M, 3 × S, 4 × XS ≈ **4.0 engineer-days**, plus manual browser verification for the paths `tools/smoke.js` and `tools/render.js` cannot reach.

What the sprint delivers:
- Both Critical findings closed. A past day can no longer be re-judged by a pause or a re-baseline, and the best-streak high-water mark stops absorbing days the user did not earn.
- All three silent storage failure modes become one visible, recoverable state: unreadable state is quarantined and announced with a restore route, a failed write raises a persistent banner offering Export, and pending writes flush when the app is backgrounded.
- The deploy pipeline either points at Arise or is deleted, and the foreign `expense-pwa` tooling tree stops masquerading as part of the safety net.
- Two XS High UI fixes ride along: the goal editor stops presenting controls that do nothing, and the header stops rendering under the iOS status bar.

Deliberately **not** in Sprint 1: WORK-06 and WORK-07. Both are M, both touch `renderToday`/`render()`, and neither should share a sprint with a Critical change to `computeDayStatus`. Sprint 1 is already full at 4 days once smoke, render and hand-driven browser testing are counted.

Release gate for the sprint: `node tools/smoke.js` and `node tools/render.js` from `D:\3_Claude\Apps\arise`, plus new smoke assertions that `dayStatus(pastDay)` and `history().best` are unchanged across a pause and a re-baseline, plus a `VERSION` bump in `D:\3_Claude\Apps\arise\sw.js`.

---

## Roadmap

**Sprint 1:** WORK-01, WORK-02, WORK-03, WORK-04, WORK-05, WORK-08, WORK-09, WORK-13

**Sprint 2:** WORK-06, WORK-07, WORK-16, WORK-11, WORK-10, WORK-31

**Sprint 3:** WORK-12, WORK-14, WORK-15, WORK-17, WORK-18, WORK-19, WORK-22, WORK-23, WORK-24, WORK-25, WORK-26

**Later:** WORK-20, WORK-21, WORK-27, WORK-28, WORK-29, WORK-30, WORK-32, WORK-33, WORK-34, WORK-35, WORK-36, WORK-37, WORK-38, WORK-39

Nothing is dropped. The Later band is real scheduled work, not a graveyard — WORK-27 through WORK-30 are the project's own written design rules (`knowledge/ui-guidelines.md`) that the app currently does not follow, and WORK-34 is blocked behind WORK-12 rather than deprioritised.

---

## Dependencies

**WORK-02 → WORK-03 → WORK-04.** All three write to the same `save()`/`load()` region of `D:\3_Claude\Apps\arise\js\store.js` and all three surface through `banners()` in `js/ui.js`. WORK-02 establishes the `meta` error-flag plus banner mechanism; WORK-03 reuses it for the write path; WORK-04 adds `flush()` to the same function. Landing them out of order means building the banner twice or merging three conflicting edits to one function.

**WORK-02 / WORK-03 → WORK-11.** The error boundary rewrites `#view` on a throw. It must not be built before the storage banners exist, or the recovery panel and the storage banner will each claim the same surface with no defined precedence.

**WORK-11 → WORK-10.** The boundary is the net; the rung bound is the fix. Ship the net first so an unbounded-rung goal degrades to a message rather than a frozen tab while WORK-10 is still in flight. Note that a 40,000-node `innerHTML` freezes rather than throws, so WORK-11 does not make WORK-10 optional.

**WORK-01 → WORK-13 → WORK-12.** WORK-01 changes what `goalsForDay` and therefore `computeDayStatus` mean for a past date. WORK-13 collapses the duplicated streak-holding rules into one. Only then is it safe to memoise `history()` and `totalXp()` — caching two divergent streak rules over corrected day statuses is how a wrong number becomes a sticky wrong number.

**WORK-12 → WORK-34.** CODE-14 offers a choice: delete the unused `rev` counter, or use it as the memo key for CODE-09. WORK-12 needs a revision key. WORK-34 must not delete `rev` until WORK-12 has decided whether it wants it.

**WORK-16 → WORK-06.** UI-01's recommendation removes the streak and rank from the Today hero on the grounds that they remain permanently visible in the top-bar chips. UI-15 records that those same chips announce as "0" and "Lv 1" with no accessible name. Land the labels first, or the reorder leaves the app's only remaining streak surface unlabelled for assistive tech.

**WORK-06 → WORK-20.** UI-17 asks for `advanceHint()` to be rendered as visible text under the step bar on Today. WORK-06 restructures the order of `renderToday`. Doing WORK-20 first means doing it twice.

**WORK-08 → WORK-21 and WORK-35.** WORK-08 establishes the `hidden`-driven conditional-field pattern in the goal editor sheet. WORK-21 applies the identical pattern to the exercise editor, and WORK-35 touches the same goal editor form. Land the pattern once, then reuse it.

**WORK-27 → WORK-28.** Set the 11px legibility floor before defining the `--fs-*` scale, so the scale's bottom rung is a size the project is willing to ship rather than a rung that codifies 8.5px.

**Cross-cutting release step, not a work item.** `CLAUDE.md` requires bumping `VERSION` in `D:\3_Claude\Apps\arise\sw.js` after any change to `styles.css` or `js/`. Almost every item here qualifies. Make it a per-sprint checklist entry, not a per-item one.

**Coverage caveat carried from Code Review.** `js/app.js` is loaded by neither harness, so WORK-08, WORK-14, WORK-21, WORK-23, WORK-35 and the whole click-routing surface must be driven by hand in a browser over `http://` via `serve.cmd`. WORK-07 additionally introduces DOM APIs (`document.activeElement`) that the stub DOM in `tools/render.js` does not implement, so it needs its own guard.

---

## Conflicts

**C-1 — Severity of the silent reseed (WORK-02).** Code Review rated CODE-01 **Critical**: total, unrecoverable loss of the user's only copy of their data, breaching "stored data is sacred". UI Review rated UI-04 **High**: it treated the reseed as a missing *state* — no banner, no explanation, no restore route — rather than as data destruction, and stated elsewhere in its report that no hard constraint from `project.md` is broken. I have carried Critical, as the rules require, but the two reviewers genuinely disagree about whether this path breaks a hard constraint. That disagreement is the reason the two overall scores are eleven points apart and it needs a ruling.

**C-2 — Whether the reseed *behaviour* may change (WORK-02).** UI-04's recommendation is explicit: "Do not change the reseed behaviour itself — only surface it." CODE-01's recommendation changes it: quarantine the raw string to `arise.state.v1.unreadable` **before** seeding, and do not call `save()` on the seed path at all until the user has been told. These are incompatible. The UI position preserves a working app at the cost of overwriting the unreadable original; the code position preserves the original bytes at the cost of an app that may boot into an unsaved seed state. Chief Architect ruling required.

**C-3 — Contention over `render()` (WORK-07, WORK-11, WORK-12).** Three findings from two reports each prescribe a change to the same 14-line function at `js/ui.js:1516-1529`: UI-02 wants activeElement capture and re-focus after the `innerHTML` swap; CODE-08 wants the whole assignment wrapped in a try/catch that substitutes a recovery panel; CODE-09 wants the redundant `progress()`/`currentStreak()` recomputation removed. None contradicts another outright, but a focus restore inside a try/catch that has just replaced `#view` with a recovery panel is undefined behaviour unless someone specifies the interaction. I am not resolving the ordering semantics.

**C-4 — Locked rows pull two ways (WORK-19).** UI-32 recommends adding the `disabled` attribute to the tick, `item-main` and action buttons on a locked row, which removes them from the tab order and lets the browser communicate the state. UI-16 recommends `.goal.locked .goal-main { pointer-events: auto }` so that goal detail — the ladder and the next step — becomes reachable on a future day. One makes the locked row inert, the other makes part of it interactive again. Both are from the same reviewer and both are defensible, but implemented naively the second undoes the first for the `goal-main` button specifically. Needs a single ruling on what a future-day row is allowed to do.

**C-5 — Delete or repair the deployment path (WORK-05).** CODE-05 offers two fixes with opposite consequences: point `path:` at the app root so Arise publishes from `.github/workflows/deploy.yml`, or delete the workflow because Arise is not deployed from here. CODE-06 similarly offers "delete the foreign tooling tree, or port it to Arise deliberately", which also decides the fate of `eslint.config.mjs` and the `eslint` devDependency (and, per the Technical Debt section, whether the unpinned `npm install` in CI matters at all). This is a product/infrastructure decision, not an engineering one. I have scheduled the work; I have not chosen the branch.

**C-6 — The two overall scores.** 66/100 "usable but fragile" versus 55/100 "significant rework needed before release". This is not a per-finding conflict, but the Chief Architect should note that the reviewers reached different release verdicts from the same source tree, and that the gap is almost entirely C-1 plus CODE-02, which the UI review had no visibility into.

---

## Estimated Effort

Sizing convention used for totals: XS ≈ 0.25d, S ≈ 0.5d, M ≈ 1.5d.

| Priority | Items | Composition | Approx. engineer-days |
|---|---|---|---|
| P0 | 2 | 1 × M, 1 × S | 2.0 |
| P1 | 7 | 2 × M, 2 × S, 3 × XS | 4.75 |
| P2 | 21 | 3 × M, 7 × S, 11 × XS | 10.75 |
| P3 | 9 | 2 × S, 7 × XS | 2.75 |
| **Total** | **39** | **6 × M, 12 × S, 21 × XS** | **≈ 20.25** |

No item was estimated at L or XL. That is a real signal: nothing in either report requires a rewrite. Roughly four weeks of one engineer clears the entire merged backlog, and the first four days clear both Criticals. Add verification overhead on top — the P2 and P3 UI items concentrate in `js/app.js` and the sheet builders, which have no automated coverage and must be driven by hand.

---

## Recommendations

If I had one minute with the Chief Architect:

1. **Rule on C-2 before Sprint 1 starts.** WORK-02 cannot be implemented until someone decides whether an unreadable state may be overwritten. It is the single most consequential unresolved question in this backlog and it blocks the highest-severity item that has a cheap fix.

2. **CODE-02 is the finding that should change how the team works, not just what it ships.** Code Review's Future Risks section says this class of bug recurs every time a new goal attribute is read from its current value instead of a dated history, and that `scheduleHistory` is the pattern that already works. Make "dated history, not current value" a written rule in `knowledge/coding-standards.md` as part of WORK-01, or the next attribute reintroduces it.

3. **The storage boundary is one change, not three.** WORK-02, WORK-03 and WORK-04 all live in the same twenty lines of `D:\3_Claude\Apps\arise\js\store.js` and surface through the same `banners()` call. Sequencing them across sprints would triple the cost. They are sequenced together in Sprint 1 for that reason.

4. **Take the deployment decision (C-5) as a product decision now.** It is XS either way, but the wrong branch is worse than either: a workflow that looks like it deploys Arise and does not is a trap for whoever reaches for it under release pressure.

5. **Do not let the P2 design-token band (WORK-27 to WORK-30, WORK-36) drift indefinitely.** Every one of those items is the app failing a rule the project wrote for itself. They are Medium and Low and they will always lose a scheduling argument to something more urgent, which is exactly how consistency drift becomes permanent. Give them one dedicated sprint after Sprint 3 rather than dripping them into other work.

6. **Two of the highest-severity UI findings have XS fixes.** WORK-08 and WORK-09 are each a single attribute or a single token. There is no reason for either to survive Sprint 1.
