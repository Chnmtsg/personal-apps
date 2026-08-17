# Chief Architect — english-feedback-app

**Date:** 2026-08-11
Reports received and read in full: `D:\3_Claude\Apps\reports\ui-review.md` (17 findings, 77/100), `D:\3_Claude\Apps\reports\code-review.md` (18 findings, 82/100), `D:\3_Claude\Apps\reports\engineering-manager.md` (34 `WORK-` items, 3 conflicts). All three present. Measured against `D:\3_Claude\Apps\knowledge\project.md`, `ui-guidelines.md`, `coding-standards.md`, `review-conventions.md` and `D:\3_Claude\Apps\english-feedback-app\CLAUDE.md`.

I verified the mechanism of every load-bearing finding in source before ruling. Confirmed by reading: `worker/src/index.ts:67-84,144-157` and `worker/src/pipeline.ts:171-200` (quota charged once, up to three `callTeacher` calls, no global counter); `app/src/screens/Write.tsx:98-116` and `app/src/lib/db.ts:96-149` (10-second full-store deserialisation, single `by-createdAt` index, `oldVersion < 1` upgrade only); `app/src/screens/Write.tsx:159-169` (`saveEntry` and `clearDraft` share one catch); `app/src/lib/retry.ts:28-34` (`too_large` falls through to `rejected`, which `claim.ts:123-130` makes final); `app/src/lib/stats.ts:178-202` against `shared/patterns.ts:208-213` (grid maps 96 `JOURNAL_PATTERNS`, `pattern_id` reachable only from 49 `DETERMINISTIC_PATTERNS` — I counted both: exactly 49 entries carry `tier: "deterministic"` and all 49 carry a `find` regex); `app/src/screens/Feedback.tsx:307-343` (the `<dl>` of 30px figures precedes `teacher_feedback`); `app/src/index.css:9-51` (I recomputed `#8b8578` on `#faf8f3` at **3.50:1** — UI-02's measurement holds); `app/src/screens/History.tsx:78-82` against `shared/schema.ts:32` ("fifty words" vs `MIN_WORDS = 30`); and a repo-wide grep for `SEVERITY_STYLES` / `SEVERITY_LABELS` / `TAXONOMY_VERSION`, which returns their declarations and nothing else.

---

## Executive Decision

**No — not fit for release today, but the gap is narrow, defined, and entirely pre-deployment work.**

Neither reviewer raised a Critical, and the two things that would genuinely block a release are correct: the Anthropic key exists only as a Worker secret, and the entry-is-never-lost / claim-and-merge data layer is versioned, pure and tested. What stops me signing off is not a defect in the shipped behaviour but a defect in the deployment posture: the only real spend control is a per-IP counter behind a forgeable `Origin` header, and one charged request now buys up to three `claude-opus-5` calls, with no global ceiling and no kill switch — the owner's first signal of abuse is the invoice. Separately, and decisively for ordering, this app has **no deployed users yet**, which makes now the cheapest moment in the product's entire life to land the one IndexedDB migration and the one stored-field addition on the board; every week they wait, they get more expensive and less reversible. The learner-facing Highs (a scoreboard placed before the teaching, and two ink tokens below WCAG AA that carry every label in the app) are contained reorders and token values, not rework. Release is roughly four days of work away, and 32 of 34 items on the board are XS or S.

---

## Approved Improvements

| Item ID | Title | Reason for approval |
|---|---|---|
| WORK-01 | Global hourly spend ceiling; account for the rewrite retries | Verified: quota charged once at `index.ts:155`, pipeline loops to three calls. Unmetered, uncapped spend on a paid key is the one risk here with a real-world bill attached. Deployment blocker. |
| WORK-02 | `by-status` index on `entries` | Verified: `getEntries()` on a 10s interval on the typing screen, plus a 60s readwrite `getAll()`. A schema migration is cheapest with zero users on disk. Also a prerequisite for spaced repetition, `project.md`'s first roadmap item. |
| WORK-03 | Feedback card 1 leads with teaching, not a count and a rate | Direct, verified violation of `ui-guidelines.md:75` ("Scores live on the closing card — after the teaching, never before it") on the app's most-read screen. A block move, no new components. |
| WORK-04 | Darken `ink-faint` / `ink-ghost` | Independently measured at 3.50:1 and 2.62:1 against paper. These tokens carry every label, the inactive tabs, and the one sentence that stops a rising trend reading as failure. Two token values. |
| WORK-05 | Three screens render nothing while loading | `ui-guidelines.md` requires four states. A blank Feedback screen reads as "my entry is gone" — the one fear this app has worked hardest to answer. |
| WORK-06 | History empty state states the wrong minimum | A false statement in the first instruction a new user reads. Interpolate `MIN_WORDS`. |
| WORK-07 | Separate `saveEntry` from `clearDraft` | Verified: a `clearDraft` throw reports a successful save as failed, and the learner's rational next tap stores a duplicate entry and pays for a second analysis. One line; best value on the board. |
| WORK-08 | Map `too_large` to `too_long`; warn before the ceiling | Verified: `applyFailure` sends an over-long entry to `rejected`, which `canRequeue` makes permanent, with a message that tells the learner nothing actionable — while the correct message already exists. |
| WORK-09 | Explain errors-per-100-words where it is a headline | The app's last word to the learner on a new entry is currently a bare number with no direction and no reference point. One sentence of copy. |
| WORK-10 | Feedback back control under 44px | `ui-guidelines.md:87` names back buttons explicitly, and the correct element is already defined and unused in the same file. |
| WORK-11 | Contract the pattern map to the reachable set | Ruled under C2. 47 of 96 cells can never change state; the header counts "seen" against a denominator the code cannot deliver. Fails the app's own honesty standard (`stats.ts:171-177`). |
| WORK-12 (part) | Un-hide the map, add a text alternative, differentiate by shape | `ui-guidelines.md:30` forbids meaning in colour alone, and the grid is `aria-hidden`. The 49-button interaction is rejected separately. |
| WORK-13 | Move `per100`, `topCategories`, analysed count into `stats.ts` | `coding-standards.md` is explicit, `per100` already exists twice byte-for-byte, and two definitions of "analysed" already disagree. Approved **with tests** — moving it without covering it buys nothing. |
| WORK-14 | Cap the two unbounded lists | The per-category example list is the feature `project.md:41` names as carrying the vision; the more valuable the pattern, the slower it renders. A slice, no library. |
| WORK-15 | Retype `StoredCorrection` as the read-back shape | Makes legacy-data handling compiler-enforced instead of convention-enforced, before another screen reads corrections. |
| WORK-16 | Import / restore | Settings promises a recovery path that does not exist, for data that exists only on one device. Durability of the learner's writing outranks everything else on this board. |
| WORK-17 | Reconcile the reference documents with the tree | The stale text sits inside `project.md`'s Hard Constraints — the one section whose purpose is preventing the mistake with no recovery — and points at a 20-name enum in a file that no longer holds it. |
| WORK-18 (part) | Feedback keyboard focus and card-change announcement | The screen currently prints an instruction that is false, and announces nothing on card change. The `App.tsx` focus-move half is deferred. |
| WORK-19 (part) | Label the headline block as all-time | The labelling half of UI-08's own recommendation, at zero cost, while the ranking half is deferred. |
| WORK-20 | Clear the toast timer | Found independently by both reviewers; one ref. |
| WORK-21 | Tokenise hard-coded colours; delete the dead severity constants | Ruled under C1. The ruled-paper gradient hard-codes `#faf8f3`, so changing `--color-paper` would split the writing surface from the page. |
| WORK-22 | One name for the module | Ruled: the name is **Patterns**. `project.md:39` changes to match the code. Folded into WORK-17. |
| WORK-24 (part) | Drop the card-stack shadow, record the exception | Guideline violation on the card; the floating-element exception gets written into `ui-guidelines.md` so this stops recurring every review. |
| WORK-25 | Fluency notes use `EditSpan` | Legacy entries render forever, and a screen reader currently gets two bare phrases with no indication which is which. Reuses an existing component. |
| WORK-26 | Reading-level strings; the zero-corrections headline | `project.md` sets a B1 ceiling; "share" as a noun fails it on the screen the learner is meant to study. "0 corrections to read." turns the app's best moment into a null statement. |
| WORK-27 | Focus ring and label wiring | The weakest focus indicator in the app sits on its largest control. Two one-line fixes. |
| WORK-28 | Correct the two inaccurate comments | A comment asserting a security property the code lacks is worse than no comment. **Fix the words, not the code.** |
| WORK-29 | Store the taxonomy version on every new entry | Promoted from Later. With zero deployed users, writing this field now means the entire corpus carries it; later it permanently bifurcates the corpus. It is the last defence of the "renaming a category rewrites history" invariant. |
| WORK-30 | One pattern hit must label one edit | Verified: `findMatchingHit` never consumes the hit, so `getPatternMap` counts can double. The map's counts matter more after C2, not less. |
| WORK-31 | Evict stale in-memory rate-limit buckets | Same function as WORK-01. One edit, two findings. |
| WORK-32 | Reset Settings state after "Delete all data" | The screen asserts a saved profile that no longer exists, on the destructive path. |
| WORK-34 | Pin the 25 v2 category ids in a test | Promoted to first. Renaming 21 of 25 ids currently leaves `npm run verify` green. Twenty minutes for the only automated guard over data stored inside every past entry. |

---

## Rejected Improvements

| Item ID | Title | Reason for rejection |
|---|---|---|
| WORK-23 | Restructure cards to remove internal scrolling | Discharged, not done. WORK-03 removes most of the summary card's overflow, and UI-10's own recommendation is to accept the corrected-text card as a deliberate exception. What remains is a Low at M effort — the worst ratio on the board. A one-line comment rides along with WORK-03; the restructure is not approved. |
| WORK-33 | Repo-wide `.ts` extension sweep | Rejected as a sweep; **retained as a rule**. A repo-wide import rewrite touches many files for zero behaviour change and buries the real diffs. The failure mode it prevents (a module pulled into `tests/` under bare Node) is loud and immediate, not silent, so it needs no pre-emptive pass. Every file touched by approved work must carry explicit `.ts` extensions on value imports from `shared/`. |
| WORK-12 (part) | 49 focusable `<button>` cells opening the category detail view | Rejected. It adds 49 tab stops to the app's most-read screen, and the destination is the wrong granularity — the cells are *patterns*, the detail view is a *category*, so the interaction would be misleading even when it worked. The ranked list beneath already provides a keyboard-reachable route to the same content. The approved text alternative carries the map's full information content in one sentence. |
| WORK-29 (option) | Delete `TAXONOMY_VERSION` | CODE-12 offered delete-or-store. Deleting discards the only per-entry marker that would make a v3 rename decidable. Store it. |
| WORK-08 (part) | A hard maximum word count on the Write screen | Not proposed, but the obvious over-reach: the approved change is a **soft, conservatively-thresholded caution**. Nothing may block a learner from writing. |

---

## Deferred

| Item ID | Title | What would change the decision |
|---|---|---|
| WORK-19 (main) | Rank the headline pattern over a recent window | Ruled under C3. Defer until the app holds ~50 analysed entries. The window length is currently a guess, and `PATTERN_ACTIVE_WINDOW = 14` already exists in `stats.ts` — introducing a second, differently-sized definition of "recent" on the same screen would be worse than one honest all-time number. When it returns, it must **reuse `PATTERN_ACTIVE_WINDOW`, not invent a second window.** The labelling half is approved now. |
| WORK-18 (part) | Move focus to the screen `<h1>` on tab change in `App.tsx` | Defer until it is decided whether the tab bar is a router or a set of panels. Focus-stealing on every tab change is an anti-pattern when applied to panels. Settle it by deciding the navigation model, then implement to it — not the reverse. |
| EM-REQ | Cost and latency instrumentation before tuning the 540s timeout | The EM asked for this as its own item and I agree with the sequencing. Deferred to immediately after first deploy, because it cannot be measured before real entries exist. The minimal version is approved now inside WORK-01's batch: the client stops discarding `data.cache` (`api.ts:100-105`) and logs it to the console. **No storage, no new UI, and nothing sent anywhere** — this app is private by default and stays that way. Real measurement, then the timeout. |

---

## Conflict Rulings

### C1 — Is there dead code beyond `TAXONOMY_VERSION`?

**Ruled for the UI review. The code review's Clean Areas line is wrong.**

I verified this myself. A repo-wide grep for `SEVERITY_STYLES` and `SEVERITY_LABELS` returns exactly one hit each: their own declarations at `app/src/lib/categories.ts:54` and `:60`. There is no importer anywhere in `app/`, `worker/`, `shared/` or `tests/`. Both are dead by precisely the standard the code review applied to `TAXONOMY_VERSION` in the same report, so the report is internally inconsistent.

`SEVERITY_STYLES` is worse than inert: it hard-codes `bg-slate-100`, `bg-amber-100` and `bg-red-100` — three hues the palette explicitly does not have — so it is a working template for a palette violation, sitting in the file a future contributor would naturally reach for when wiring severity badges. Delete both, inside WORK-21. Git remembers the wording if it is ever wanted.

On score: this does not move the code review's 82 materially — two unused constants in one file is not a band change — but the "no dead code" line is part of what supported that score and the record should show it was overstated. I am correcting it here rather than editing another role's report.

### C2 — Which direction does the top-100 map go?

**Ruled: contract the map. Honesty wins over reach. Accessibility is served by a text alternative, not by 49 buttons.**

The facts are not in dispute and I confirmed them: `getPatternMap` maps `JOURNAL_PATTERNS` (96 cells), `pattern_id` is written only by `labelForHit` from `applyPatterns`, and `applyPatterns` iterates `DETERMINISTIC_PATTERNS` — 49 entries, all with a `find` regex. Forty-seven cells are permanently grey no matter what the learner writes, sitting under a legend that calls them "not seen yet" and a header that counts "N seen" against a field of 96.

This codebase already decided this question in a harder case. `stats.ts:171-177` refuses to add a `fixed` status because "fixed requires knowing the learner ATTEMPTED the structure correctly, not merely avoided it… Congratulating avoidance would be a lie." A denominator of 96 where 49 is the truth is the same lie, cheaper. The app's whole claim over a chat window is that its memory is real; a progress map with a fictional end undercuts that on the screen `project.md:41` names as carrying the vision.

So:

- `getPatternMap` maps `DETERMINISTIC_PATTERNS`. The grid shows 49 cells. The header reads "N of 49".
- The heading stops saying "Your top-100 map." It is no longer that, and calling it that relocates the lie rather than removing it. Name it for what it is — the traps the app can detect automatically.
- **This consequence propagates to copy elsewhere:** the Feedback correction pill's "#42 on your checklist" must not cite a denominator either. No learner-facing string may state a count the code cannot deliver.
- Nothing stored changes. `pattern_id` values already written stay valid; a cell that leaves the grid was, by construction, never populated. There is no migration here.

On UI-06's accessibility half: `aria-hidden` comes off, the grid gains a one-sentence text alternative stating the same fact in words ("N of 49 traps seen; M still happening, K going quiet"), and the three states are differentiated by shape as well as fill. Forty-nine focusable buttons are rejected for the reasons in the rejection table. The result is that both WORK-11 and WORK-12 land smaller than the EM scheduled them.

### C3 — Are the never-decaying error counts work or accepted debt?

**Ruled: accepted debt for this quarter, with a stated trigger and an honest label now. Neither reviewer was wrong — they disagreed on status, and status is my call.**

UI-08 is right that a learner who fixed articles in month two should not be told articles are their number one pattern in month eight, in the app's loudest voice. The code review is right that this is already recorded as a Known Gap. What decides it is that the fix requires choosing a window, and there is no corpus to choose it from — no deployed instance, no real entries. A window picked today is a guess dressed as a measurement, and it would sit on the same screen as `PATTERN_ACTIVE_WINDOW = 14`, giving one screen two competing definitions of "recent". That is a worse outcome than one all-time number that says so.

Trigger to revisit: **~50 analysed entries**, or sooner if the top category visibly stops matching recent entries. When it returns it reuses `PATTERN_ACTIVE_WINDOW`.

Meanwhile the cheap half is approved and lands in Batch 4: the headline block gets a time qualifier. That converts a deferral into an honest deferral, and it is UI-08's own second recommendation.

---

## Development Order

Executable. Each numbered step is one commit. `npm run verify` must be green at every step. Where a step lands in an untested surface, hand-verification is part of the step, not a follow-up.

### Batch 0 — the guard, first

**1. WORK-34 — pin the 25 category ids.** `assert.deepEqual(CATEGORY_IDS, [...])` in `tests/schema.test.ts`, with a comment saying a failure here means a migration, not an edit. This lands before anything else because everything after it that touches `shared/taxonomy.ts` is safer with it in place. `linguistics-curator` must not touch the taxonomy until this exists.

### Batch 1 — before first deploy (the two things that get more expensive with every user)

**2. WORK-02 — `by-status` index.** Bump the schema to 2 in `app/src/lib/db.ts`, guarded `if (oldVersion < 2)`, index creation only. Route `getQueuedEntries`, `reclaimStaleAnalysing` and the Write screen's claim poll through it; open the readwrite transaction only once there is something to write.
*Must not:* touch entry contents, change `getEntries()`'s contract or ordering, or alter the `blocked` / `StorageBlockedError` path. **Risk to state out loud:** that path has never executed, because the version has never been bumped past 1. This step is the first thing that will ever fire it. Hand-test the blocked-upgrade case with a second tab open before committing.

**3. WORK-29 — store the taxonomy version.** Write `TAXONOMY_VERSION` onto every new entry beside `promptVersion`. Optional field; absent means "written before the marker existed"; `normalizeCategory` is unchanged.
*Must not:* bump the IndexedDB schema version (adding an optional field to a stored object needs no migration), backfill existing entries, or become part of step 2's commit.

**4. WORK-01 + WORK-31 — the spend ceiling.** A global hourly counter (`rl:global:<hour>`) alongside the per-IP one in `chargeQuota`, with the ceiling read from `Env` so it can be changed without editing code; `runPipeline` returns how many upstream calls it made so `index.ts` can settle the difference on the retry path. Evict stale buckets from `memoryCounts` on write.
*Must not:* teach `pipeline.ts` about `Env` or KV — the pipeline reports a count, `index.ts` does the accounting. **Must not invent a new error code:** when the global ceiling trips, return the existing `429 rate_limited, retryable: true`. Any new code falls through `applyFailure` to `rejected`, which `canRequeue` makes permanent — a spend spike would then dead-letter every queued entry on every device, irreversibly. This is the single highest-consequence detail in the batch.
Add here: the client stops discarding `data.cache` and logs it (console only, nothing stored, nothing sent).

*Gate: after Batch 1, the Worker is safe to deploy publicly.*

### Batch 2 — the learner's first minute

**5. WORK-03** — delete the `<dl>` from the summary card; `teacher_feedback` becomes the headline; the count demotes to the eyebrow; CEFR moves to the closing card. *Must not:* drop the CEFR figure — it is stored data on legacy entries. Add the one-line comment that the corrected-text card's scroll is a deliberate exception (discharges WORK-23).
**6. WORK-13** — `per100`, `topCategories` and the analysed count into `stats.ts`, `ErrorLog` calls `getAnalysedCount`. **Tests are part of this step.** Explicit `.ts` extensions on `shared/` value imports in every file touched.
**7. WORK-09** — the explanatory sentence on the closing card; "per 100 words" in the History column head. Depends on 5 and 6.
**8. WORK-04** — `--color-ink-faint` ≈ `#6b6559`, `--color-ink-ghost` ≈ `#767061`, `.eyebrow` to 11px, explicit disabled label colours, re-check the two on-accent uses. *Must not:* add tokens or change `ink-soft`.
**9. WORK-21** — tokenise the hard-coded hexes, drive the ruled-paper gradient from `var(--color-paper)`, delete `SEVERITY_STYLES` and `SEVERITY_LABELS`. After 8, so contrast is measured once.

### Batch 3 — cheap correctness

**10. WORK-07** · **11. WORK-08** · **12. WORK-06** · **13. WORK-05** · **14. WORK-32** · **15. WORK-20** · **16. WORK-10.** All XS, all independent, any order within the batch.

### Batch 4 — the map (C2)

**17. WORK-30** — splice the matched hit out, mirroring the `noteQueues.shift()` two lines below. Before the map, so its counts are right when it shrinks.
**18. WORK-11** — `getPatternMap` over `DETERMINISTIC_PATTERNS`; header "N of 49"; heading renamed off "top-100"; the Feedback pill's denominator removed. *Must not:* change anything stored.
**19. WORK-12 (approved part)** — `aria-hidden` off, one-sentence text alternative, shape differentiation.
**20. WORK-19 (approved part)** — time qualifier on the headline block.

### Batch 5 — types, data, docs

**21. WORK-15** — retype `StoredCorrection` as the read-back shape; `CorrectionSchema`'s inferred type stays at the network boundary only.
**22. WORK-16** — import / restore. After 21. *Must:* be additive and idempotent (`put` by `id`, skip existing ids, never delete, never let an older imported entry overwrite a newer stored one); validate every entry against the schema before any write; handle an imported `analysing` status deliberately and write the reason in a comment — an imported claim has no holder. *Must not:* touch the network.
**23. WORK-14** — cap both lists at 50 with "show more"; `getExamples` already sorts newest-first, so a slice is correct.
**24. WORK-17 + WORK-22** — one documentation commit, no code. `knowledge/project.md` is reconciled to the tree; the module is named **Patterns** everywhere; `project.md:39` changes to match `App.tsx`, not the reverse.

### Batch 6 — polish, only once Batches 0–5 are clean

**25. WORK-18 (approved part)** · **26. WORK-24 (card shadow + the `ui-guidelines.md` line recording the floating-element exception)** · **27. WORK-25** · **28. WORK-26** · **29. WORK-27** · **30. WORK-28** (*reword the comment; do not change `safeEqual` — the early length return is correct and standard, only the claim above it is wrong*).

**Why this order.** Batch 0 is the cheapest insurance against this project's one unrecoverable mistake, so it precedes everything. Batch 1 is ordered by irreversibility, not by severity: the schema migration and the stored field are the only two items whose cost rises permanently with every day of real use, and the app has no users today — this is the last free moment for both. The spend ceiling closes the batch because it is what gates deployment. Batch 2 is the learner's first minute and the only place the reviewers found the product contradicting its own stated purpose. Batch 3 is everything that is cheaper to do than to schedule. Batch 4 is grouped because C2's ruling changes all four items at once and splitting them would ship a half-honest denominator. Batch 5 carries the two items with real design in them and the documentation that stops the next contributor navigating by a map of an app that no longer exists. Batch 6 is genuinely optional and must not displace anything above it.

**Subagent routing.** `pipeline-engineer` owns Batches 0–5 except copy. `prompt-engineer` owns no runtime prompt in this plan — **nothing here changes a system prompt, and therefore nothing here bumps `PROMPT_VERSION`.** If any approved item turns out to require a prompt change, stop and escalate rather than bumping it in passing. `linguistics-curator` owns nothing until WORK-34 has landed, and owns no approved item on this board — C2 changes which patterns are *displayed*, not the pattern data itself.

---

## Architecture Strategy — next quarter

**What stays, and is not open for discussion this quarter.** The two-piece topology: a PWA that never calls `api.anthropic.com`, and a Worker that holds the key. Exactly one runtime agent (ADR 0001). Pure logic in `lib/` with no browser or Worker imports. Corrections computed by diff, never asserted by a model; claims about the learner's history counted from stored entries, never asserted. IndexedDB as the only store — no accounts, no sync, no telemetry, no server-side memory of any learner. Offline-first and mobile-first are structural, not aspirational.

**What changes.** Three structural things and nothing else. The `entries` store gains one index and entries gain one version marker — both additive, both before first deploy, both a permanent improvement to how the data can be read for the next decade. The Feedback screen's card order inverts so the teacher speaks before the arithmetic. The pattern map contracts to what the code can actually detect, and `stats.ts` absorbs the last derived numbers still computed inside components — after which every number the app shows a learner is computed in a layer the tests can reach.

**What is off limits.** Bringing back any retired runtime agent without an ADR — the risk classifier included, and any change on that path routes through `safety-reviewer` first. A second decay window anywhere in `stats.ts`. Any virtualisation or charting library added to solve a list-length problem a `slice` solves. Any code that gives `pipeline.ts` knowledge of `Env` or KV. A rewrite of the card stack — WORK-03 is a reorder and must stay one. Any new language dossier written from anything other than real contrastive knowledge. Any edit to `LEGACY_CATEGORY_MAP`. And, permanently: no secret in client code, and nothing about a learner's writing leaving their device.

**Risks I am recording, which neither reviewer raised as findings.** First, the `blocked` / `StorageBlockedError` path in `db.ts` has never executed in any environment, because the schema version has never been bumped; WORK-02 is the first thing that will ever exercise it, and it is the difference between a recoverable message and every screen hanging on a blank branch. Second, `pipeline.ts` and the `fetch` handler still have no integration test, and Batch 1 puts two of the three highest-consequence changes on the board squarely inside that gap — Miniflare coverage is the obvious answer and is not scoped here, so hand-verification is the whole safety net for those two steps. Neither of these is a finding; both are conditions the implementing agents must work under.

---

## Final Recommendation

Do Batch 0 and Batch 1, in that exact order, and do them before the Worker is deployed anywhere public — pinning the category ids costs twenty minutes, and the `by-status` index and the per-entry taxonomy version will never again be as cheap or as safe to land as they are today, with zero user databases in the world. The single next action is **WORK-34**: add the `assert.deepEqual(CATEGORY_IDS, [...])` snapshot to `tests/schema.test.ts`, so that every step that follows is protected against the one mistake this project cannot undo.
