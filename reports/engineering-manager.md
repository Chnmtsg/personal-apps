# Engineering Manager — english-feedback-app

Sources: `D:\3_Claude\Apps\reports\ui-review.md` (17 findings, 77/100) and `D:\3_Claude\Apps\reports\code-review.md` (18 findings, 82/100). 35 findings in, 34 `WORK-` items out (one true duplicate merged).

## Project Health

Neither reviewer found a Critical, and the two hard-constraint areas that would block a release — the API key boundary, and the entry-is-never-lost / claim-and-merge data layer — are reported as correct, versioned and tested by the code review, with the UI review confirming their on-screen behaviour. What both reports describe instead is an app that is right and getting slowly wrong at the edges: two High findings on the money and performance curves (an unmetered per-IP spend gate that now buys three `claude-opus-5` calls per charged request, and a full-store deserialisation on the typing path), and two High findings on the learner's first minute (a scoreboard placed before the teaching, and two ink tokens below WCAG AA that carry every label in the app). The combined picture is 77–82: solid, contained, not yet production-polished. The decisive fact for planning is that 33 of 34 items are XS or S — this is a tuning pass, not rework — and that the two highest-risk fixes (`WORK-01`, `WORK-02`) both land in the Worker `fetch` handler and `db.ts`, the two surfaces `npm run verify` does not cover.

## Priority Matrix

| Item ID | Title | Source IDs | Severity | Priority | Effort | Depends On |
|---|---|---|---|---|---|---|
| WORK-01 | Global hourly spend ceiling; charge quota per upstream call, not per request | CODE-01 | High | P1 | S | — |
| WORK-02 | `by-status` index on `entries`; stop full-store scans on the typing path | CODE-02 | High | P1 | S | — |
| WORK-03 | Feedback card 1 leads with a count and a rate before any teaching | UI-01 | High | P1 | S | — |
| WORK-04 | `ink-faint` / `ink-ghost` fail WCAG AA and carry every label in the app | UI-02 | High | P1 | S | — |
| WORK-05 | Three screens render nothing while loading | UI-03 | Medium | P2 | XS | — |
| WORK-06 | History empty state states 50 words; `MIN_WORDS` is 30 | UI-07 | Medium | P2 | XS | — |
| WORK-07 | A failed `clearDraft` is reported as a failed save (duplicate entry, double charge) | CODE-04 | Medium | P2 | XS | — |
| WORK-08 | Over-long entry dies as "rejected", and nothing warns beforehand | CODE-05 | Medium | P2 | XS | — |
| WORK-09 | Errors-per-100-words is unexplained everywhere it is a headline | UI-04 | Medium | P2 | XS | WORK-03, WORK-13 |
| WORK-10 | Feedback back control is under 44px and inconsistent with every other back control | UI-09 | Medium | P2 | XS | — |
| WORK-11 | Pattern map shows 96 cells; only 49 can ever change state | CODE-06 | Medium | P2 | XS | — |
| WORK-12 | Pattern map is colour-only, `aria-hidden`, and its labels are hover-only | UI-06 | Medium | P2 | S | WORK-11 |
| WORK-13 | Move `per100`, `topCategories` and the analysed count into `stats.ts` | CODE-08 | Medium | P2 | XS | WORK-33 (extensions) |
| WORK-14 | Two lists render every row with no cap | CODE-03 | Medium | P2 | S | — |
| WORK-15 | Retype `StoredCorrection` as the read-back shape | CODE-10 | Medium | P2 | S | — |
| WORK-16 | Export exists; there is no import or restore | CODE-09 | Medium | P2 | S | WORK-15 (advisory) |
| WORK-17 | Reference documents describe an application that no longer exists | CODE-07 | Medium | P2 | S | — |
| WORK-18 | Advertised keyboard navigation does not work; no card or screen change announced | UI-05 | Medium | P2 | S | — |
| WORK-19 | "Your number one pattern" is an all-time count that never decays | UI-08 | Medium | P2 | M | — |
| WORK-20 | Toast timer is never cleared; a second toast is dismissed early | UI-15, CODE-15 | Low | P3 | XS | — |
| WORK-21 | Hard-coded colours in screens, and dead `SEVERITY_STYLES` carrying banned palette steps | UI-12 | Low | P3 | XS | WORK-04 |
| WORK-22 | One module has four names | UI-13, CODE-07 | Low | P3 | XS | WORK-17 |
| WORK-23 | Cards scroll internally, against the one-idea-per-card rule | UI-10 | Low | P3 | M | WORK-03 |
| WORK-24 | Shadows reintroduced for depth | UI-11 | Low | P3 | XS | — |
| WORK-25 | Fluency notes render a before/after pair without `EditSpan` | UI-14 | Low | P3 | XS | — |
| WORK-26 | Strings above the target reading level; the zero-corrections headline | UI-16 | Low | P3 | XS | WORK-03 |
| WORK-27 | Focus ring and label wiring inconsistent in two places | UI-17 | Low | P3 | XS | — |
| WORK-28 | Comments that state something the code does not do | CODE-11 | Low | P3 | XS | — |
| WORK-29 | `TAXONOMY_VERSION` exported, never used, never stored on an entry | CODE-12 | Low | P3 | XS | — |
| WORK-30 | One pattern hit can label several diff edits | CODE-13 | Low | P3 | XS | — |
| WORK-31 | In-memory rate-limit fallback never evicts old buckets | CODE-14 | Low | P3 | XS | WORK-01 (same function) |
| WORK-32 | Settings keeps showing the profile after "Delete all data" | CODE-16 | Low | P3 | XS | — |
| WORK-33 | Value imports from `shared/` inconsistent about the `.ts` extension | CODE-17 | Low | P3 | XS | — |
| WORK-34 | No test pins the 25 v2 category ids | CODE-18 | Low | P3 | XS | — |

No P0 items. Neither reviewer raised a Critical, so nothing on this board blocks release by the convention's own rule.

## Quick Wins

XS effort, each removing a Medium — do these first inside P2. Together they are under a day and they close the four moments where the app currently loses the learner's trust plus the one path that can double-charge an entry.

- **WORK-07** — one line separating two writes; removes a duplicate-entry-plus-second-analysis path. Highest value per minute on the board.
- **WORK-08** — one line mapping `too_large` to `too_long`; the helpful message is already written.
- **WORK-06** — one string; it currently tells every new user the wrong word count.
- **WORK-05** — three `return null` branches become header-plus-`role="status"`, using markup already in each file.
- **WORK-13** — moves the app's headline number into the layer the tests can reach, and resolves two disagreeing definitions of "analysed".
- **WORK-09** — one sentence of copy; removes the app's most likely misreading.
- **WORK-10** — the correct back button is already defined in the same component and unused.
- **WORK-11** — render only the reachable pattern set, so the denominator stops lying.

S effort, also qualifying: **WORK-01, WORK-02, WORK-03, WORK-04** (High — they lead by priority anyway), then **WORK-12, WORK-14, WORK-15, WORK-16, WORK-17, WORK-18**.

## Sprint Plan

**Sprint 1 — "Stop the bleeding, then meet the teacher first."**

WORK-01, WORK-02, WORK-03, WORK-04, WORK-06, WORK-07, WORK-08, WORK-13, WORK-09, WORK-34.

Effort: 4 × S + 6 × XS ≈ **3.5–4 focused days**, in a one-week sprint. The remaining slack is deliberate: WORK-01 lands in `worker/src/index.ts`'s `fetch` handler and WORK-02 adds a version-2 IndexedDB upgrade step in `app/src/lib/db.ts` — both are inside the two surfaces with no automated coverage, so each needs hand-verification in a browser (migration from an existing v1 database especially, since a careless migration is this project's one unrecoverable mistake). WORK-03, WORK-09 and WORK-13 all touch the Feedback cards; sequence them in that order and typecheck between.

What the sprint delivers: the deployed Worker gains a global spend ceiling that counts real model calls, so the owner's first signal is no longer the invoice. The Write screen stops deserialising the whole entry store every ten seconds while the learner types. A learner opening their feedback reads their teacher's words first and the arithmetic last, with one sentence telling them how to read the number. Every label in the app clears WCAG AA. Two silent money-and-data bugs close (double-saved entries, permanently rejected long entries with an unhelpful message), the first instruction a new user reads becomes true, and a snapshot test starts guarding the 25 category ids that are stored inside every past entry.

WORK-34 is Low severity and stays P3; it is in this sprint only because it is 20 minutes and it is the cheapest guard that exists over versioned stored data.

## Roadmap

- **Sprint 1** — WORK-01, WORK-02, WORK-03, WORK-04, WORK-06, WORK-07, WORK-08, WORK-09, WORK-13, WORK-34
- **Sprint 2** — WORK-05, WORK-10, WORK-11, WORK-12, WORK-14, WORK-15, WORK-16, WORK-17
- **Sprint 3** — WORK-18, WORK-19, WORK-20, WORK-21, WORK-22, WORK-24, WORK-26
- **Later** — WORK-23, WORK-25, WORK-27, WORK-28, WORK-29, WORK-30, WORK-31, WORK-32, WORK-33

WORK-33 sits in Later as a standalone sweep, but its rule applies immediately: any module touched in Sprint 1 or 2 must carry explicit `.ts` extensions on value imports from `shared/`.

## Dependencies

- **WORK-13 before WORK-09.** `per100` is already defined twice byte-for-byte. Adding the previous entry's figure to the closing card before the formula is a single pure function in `stats.ts` produces a third copy.
- **WORK-03 before WORK-09, WORK-23 and WORK-26.** All four edit the Feedback summary and closing cards. WORK-03 moves the stats block off the summary card, which is most of what WORK-23 exists to fix and it changes the line WORK-26 rewrites.
- **WORK-04 before WORK-21.** Darkening the two ink tokens changes the on-accent pairs at `ErrorLog.tsx:144/153` that WORK-21 tokenises. Doing WORK-21 first means measuring contrast twice.
- **WORK-11 before WORK-12.** How many cells the grid renders decides how many become focusable buttons and what the "N seen" denominator says. Building the accessible interaction over a field half of which is unreachable bakes in the wrong answer.
- **WORK-17 before WORK-22.** The name decision lands in `knowledge/project.md` during the documentation pass; the learner-facing copy follows it. Both items edit the same two lines of `project.md` — coordinate rather than doing them independently.
- **WORK-15 before WORK-16, advisory.** The code review's rule is that the retyped `StoredCorrection` should land before any new code reads corrections. An import path validating stored entries is exactly such a reader.
- **WORK-01 with WORK-31.** Both live in `chargeQuota` / `memoryCounts` in `worker/src/index.ts`. One edit, two findings closed.
- **WORK-02 before any read-heavy roadmap feature.** The code review names spaced repetition (`project.md`'s first long-term item) as inheriting the full-store scan on every scheduling pass. The `by-status` index is a prerequisite for that work, not only a fix for today.
- **WORK-34 before any taxonomy edit.** It is the guard that turns a rename into a failing test instead of a silent rewrite of history.
- **WORK-33 alongside WORK-13.** Moving computations into `stats.ts` pulls more modules toward the bare-Node test runner, where extensionless value imports from `shared/` do not resolve.

## Conflicts

Three disagreements. I am not resolving any of them.

**C1 — Is there dead code beyond `TAXONOMY_VERSION`?**
The code review's Clean Areas states: "Dead code. Beyond `TAXONOMY_VERSION` (CODE-12), none found — the retired agents' derivations were removed rather than commented out." The UI review (UI-12) reports `SEVERITY_STYLES` in `app/src/lib/categories.ts:54-58` as exported and referenced nowhere, verified by grep across the repo, and carrying three hues the palette does not have (`bg-slate-100`, `bg-amber-100`, `bg-red-100`). Both cannot be true. The claim matters beyond the constant itself, because the code review's "no dead code" line is part of what supports its 82.

**C2 — Which direction does the top-100 map go?**
UI-06 wants the grid expanded: each cell becomes a focusable `<button>` opening the category detail view, with `aria-label`, shape differentiation and `aria-hidden` removed — 96 interactive targets. CODE-06 wants the grid contracted: render only the 49 patterns that can ever change state, or shade the other 47 and drop them from the denominator. Each recommendation is sound on its own axis (accessibility; honesty). Applied together the visible field, the "N seen" denominator and the number of tab stops all change at once, and neither reviewer costed the combination. This is a product decision about what the map promises the learner, and it belongs to the Chief Architect before WORK-11 and WORK-12 are implemented.

**C3 — Are the Error Log's all-time counts current work or accepted debt?**
UI-08 raises the never-decaying headline count as a Medium finding with a concrete fix (rank the headline over the last 20 analysed entries or 90 days, label both views), on the grounds that the module carrying the product's reason to exist gradually describes a person who no longer exists. The code review records the same behaviour under Future Risks, referencing it as an already-accepted Known Gap in `CLAUDE.md` rather than raising it as a finding. So the two reports disagree on status, not on facts. I have scheduled it as WORK-19 at P2 to keep it visible; whether it is scheduled or formally accepted as debt is the architect's call.

Not conflicts, recorded so they are not mistaken for one: the code review's praise of the errors-per-100-words *provenance* and UI-04's complaint that the figure is *unexplained* are two different axes of the same number, and both are true.

## Estimated Effort

| Band | Items | XS | S | M | Rough total |
|---|---|---|---|---|---|
| P0 | 0 | — | — | — | none |
| P1 | 4 | 0 | 4 | 0 | 1.5–2 days |
| P2 | 15 | 8 | 6 | 1 | 4.5–5.5 days |
| P3 | 15 | 14 | 0 | 1 | 2–2.5 days |
| **Total** | **34** | **22** | **10** | **2** | **8–10 days** |

Effort is implementation only. It excludes hand-verification of the React screens and the Worker handler, which have no automated coverage; budget roughly a further day across Sprints 1 and 2 for that.

## Recommendations

One minute, in order.

Nothing here blocks release by the convention's own rule — no Critical was raised by either reviewer — but I would not deploy the Worker publicly before WORK-01. The advertised "20 requests/hour/IP" is really up to 60 `claude-opus-5` calls/hour/IP behind an `Origin` header that any non-browser client can forge, with no global ceiling and no kill switch. It is an S-effort fix and the owner's current first signal is the invoice.

The whole board is small: 32 of 34 items are XS or S, and the two Ms are both product decisions rather than engineering ones. That means the honest framing for the team is a two-to-three sprint tuning pass, not a rework — and it also means there is no excuse for letting P3 rot, because fourteen of the fifteen P3 items are under thirty minutes each.

You have three decisions to make before Sprint 2 can be planned confidently: the dead-code discrepancy (C1, which touches the code review's own score), the direction of the top-100 map (C2, which blocks WORK-11 and WORK-12), and whether the never-decaying error counts are work or accepted debt (C3). C2 is the only one that costs anything to get wrong.

Finally, two things neither report could measure and both flagged: no automated test reaches `worker/src/pipeline.ts`, the `fetch` handler, or any React component, and nothing in the system reports what an entry costs — `cache.read` / `cache.write` come back from the Worker and are discarded by the client. Sprint 1's two riskiest changes land squarely in that gap. I would ask for cost/latency instrumentation to be scoped as its own item before the 540 s client timeout is tuned, because right now every claim about what the pipeline costs is inference.
