# Code Review — english-feedback-app

## Executive Summary

This is a carefully built codebase. The invariants that matter most are genuinely held: the Anthropic key exists only as a Worker secret, entries are written to IndexedDB before any network call, the claim/merge protocol is a real cross-tab lock with pure, well-tested rules, corrections are computed by diff rather than asserted by a model, and the Worker logs codes and categories but never entry text. The 143 tests cover exactly the places where a mistake would be silent — retry policy, statistics, timezone bucketing, request policy, diff, patterns — and they read like specifications, not coverage padding. No Critical finding.

The single biggest risk is cost exposure on the deployed Worker. The only real spend control is a per-IP hourly counter, the `Origin` gate it sits behind is a header any non-browser client can forge, and one accepted request can now cost up to three `claude-opus-5` calls — so the "20 requests/hour/IP" control the README advertises is really 60 model calls/hour/IP, with no global ceiling and no kill switch anywhere in the system.

The second theme is growth. Every timer tick deserialises the entire `entries` store, including every feedback blob, and two screens render their lists with no cap. Both are fine today and both degrade continuously as the learner accumulates the two hundred entries the product is designed around.

The third theme is drift: `knowledge/project.md`, `CLAUDE.md` and `README.md` all describe the pre-ADR-0001 nine-agent app in places, including inside the hard-constraints section that points at a category enum in a file that no longer holds it.

## Overall Score

**82 / 100** — Solid. No Critical findings; the two High findings are contained (one is a bounded-but-unmetered spend risk with partial mitigations already in place, the other is a performance curve that is invisible at today's data volumes). The data layer — the part that outranks everything else here — is correct, versioned, and tested.

---

## Findings

### High

**CODE-01 — The Worker's only real spend control is per-IP, and one request now buys three model calls**

- Severity: High
- Location: `worker\src\index.ts:15` (`RATE_LIMIT_PER_HOUR = 20`), `:67-84` (`chargeQuota`), `:131-137` (origin and APP_KEY gates), `:153-164`; `worker\src\pipeline.ts:48` (`MAX_REWRITE_ATTEMPTS = 2`), `:171-200`
- Evidence: `resolveOrigin` compares `request.headers.get("Origin")` against the allowlist. That header is client-supplied and is only enforced by *browsers*; `curl -H "Origin: https://english-feedback.pages.dev"` passes the gate, and `APP_KEY` — by the project's own admission in `wrangler.toml:19-23` — ships inside a public bundle. So the effective control is `chargeQuota`: 20 requests per IP per hour. Quota is charged **once per `/analyze`**, but `runPipeline` loops `for (let attempt = 0; attempt <= MAX_REWRITE_ATTEMPTS; attempt++)`, so a single charged request can make three `callTeacher` calls, each with `max_tokens: 12_000` on `claude-opus-5`. There is no global counter, no daily cap and no disable switch anywhere in `index.ts`. The README states the control as "20 req/hour/IP"; the real ceiling is 60 opus calls/hour/IP.
- Impact: the README's known gap ("a determined abuser with many IPs is not stopped by it") understates the exposure by 3×. At the README's own $25/Mtok output figure, one IP's hourly budget is worst-case ~720k output tokens; a hundred IPs is a four-figure hourly bill with nothing in the system that notices or stops it. The owner's first signal would be the Anthropic invoice.
- Recommendation: add a second KV counter that is global rather than per-IP — `rl:global:<hour>` charged in the same `chargeQuota` call, with a ceiling sized to the owner's tolerance — and charge it once per *upstream call* rather than once per request, so the rewrite retries are visible to it. That is one extra `get`/`put` in a function that already does both.
- Effort: S

**CODE-02 — Every timer tick deserialises the whole `entries` store, including on the typing path**

- Severity: High
- Location: `app\src\screens\Write.tsx:98-116`; `app\src\lib\queue.ts:30-53`; `app\src\lib\db.ts:139-149` (`getEntries`, `getQueuedEntries`), `:197-209` (`reclaimStaleAnalysing`)
- Evidence: `Write.tsx` runs `refresh()` on a `window.setInterval(refresh, 10_000)`, and `refresh` calls `getEntries()` — `getAllFromIndex("entries", "by-createdAt")`, i.e. every entry with its full `feedback` object, purely to answer "is a claim active?". `App.tsx:53` runs `processQueue` every 60 s, which does three more full-store reads: `reclaimStaleAnalysing` (`tx.store.getAll()` inside a **readwrite** transaction, held even when there is nothing to reclaim), `getQueuedEntries` (`getAllFromIndex` then `.filter`), and `getEntries` for the ranking context. The `entries` object store has exactly one index, `by-createdAt`; there is no index on `status`.
- Impact: at the two hundred entries the vision in `knowledge/project.md` is written around — each carrying corrections, explanations and a corrected copy of the text — this is several megabytes of structured-clone deserialisation every ten seconds while the learner is typing, on the one screen where input latency is the product. At a thousand entries it is a visible stall on a mid-range phone, and the 60-second readwrite transaction periodically blocks `saveEntry` and `finishAnalysis`. Nothing fails; the app simply gets slower every month it is used, which is the failure mode hardest to notice and hardest to reverse later.
- Recommendation: add a `by-status` index in a version-2 `upgrade` step (guarded by `oldVersion < 2`, exactly as the existing step is), then serve `getQueuedEntries` and the active-claim check from `getAllFromIndex("entries", "by-status", ...)`. `reclaimStaleAnalysing` can iterate the same index instead of `getAll`, and open its readwrite transaction only once it has something to write.
- Effort: S

### Medium

**CODE-03 — Two lists render every row with no cap or virtualisation**

- Severity: Medium
- Location: `app\src\screens\ErrorLog.tsx:103-118`; `app\src\screens\History.tsx:93-146`
- Evidence: `examples.map(...)` renders every `CategoryExample` `getExamples` returns for the selected category — all-time, unbounded. `History` renders one `<li>` per entry, each containing `{entry.text}` in full (the clamp at `line-clamp-2` is CSS; the whole text node is in the DOM).
- Impact: the per-category example list is the feature `knowledge/project.md:41` names as the one that carries the vision. After a year it is the *top* category that has the most examples, so the more valuable the pattern, the slower the screen that shows it. A thousand-entry history builds a thousand DOM rows carrying the full text of every entry in one synchronous render.
- Recommendation: cap both at a first page (say 50) with a "show more" that appends; no library needed. `getExamples` already sorts newest-first, so a slice is correct without further work.
- Effort: S

**CODE-04 — A failed `clearDraft` is reported as a failed save, although the entry is already stored**

- Severity: Medium
- Location: `app\src\screens\Write.tsx:159-169`
- Evidence:
  ```ts
  await saveEntry(entry);
  await clearDraft();
  } catch (err) {
    showToast("We could not save this on your device. Your writing is still here.");
    return;
  }
  ```
  The two writes share one `catch`. If `saveEntry` succeeds and `clearDraft` throws, the entry **is** in IndexedDB, but the user is told it was not saved and is left with the text still in the textarea.
- Impact: the learner does the only sensible thing and taps Analyse again. That mints a fresh `crypto.randomUUID()` and stores a second copy of the same writing, then pays for a second analysis of it. Both copies then count into every statistic on the Errors screen, double-weighting that day's error counts in the trend. This is the "can a failed write leave data half-updated?" case, and the half-state is silently mis-reported.
- Recommendation: only `saveEntry` is fatal. Wrap `clearDraft()` in its own `.catch(err => console.error(...))` after the fatal block — a stale draft is harmless and is overwritten by the next keystroke.
- Effort: XS

**CODE-05 — An over-long entry dies permanently under the wrong reason, and nothing warns the learner beforehand**

- Severity: Medium
- Location: `worker\src\index.ts:18` (`MAX_BODY_BYTES = 12 * 1024`); `worker\src\policy.ts:169`; `app\src\lib\retry.ts:28-34`; `app\src\lib\claim.ts:123-130`; `app\src\lib\categories.ts:45-51`
- Evidence: a body over 12 KB returns `{ error: "too_large", retryable: false }` with status 413. `applyFailure` maps any non-retryable, non-refusal failure whose `code !== "too_long_to_analyse"` to `failReason: "rejected"`. `canRequeue` returns false for `"rejected"`, so the entry is final. The learner sees `FAIL_REASON_MESSAGES.rejected` — *"The server did not accept this writing."* — while the message that would actually help, `too_long` (*"too long to check in one piece. Try splitting it into two entries"*), is reachable only from the truncation path. `Write.tsx` gates on `MIN_WORDS` but has no maximum, so nothing on screen suggests a ceiling exists.
- Impact: a learner writing the "book summary" the placeholder invites loses the analysis with an unhelpful, unactionable message and no route back. The body budget is also shared with `history` and `profile`, so the real text ceiling is lower than 12 KB and varies with how many categories the learner has accumulated.
- Recommendation: map `code === "too_large"` to `failReason: "too_long"` alongside `"too_long_to_analyse"` in `applyFailure` (one line, and `too_long`'s message is already written), and show a soft warning next to the word count once the entry passes a safe word threshold.
- Effort: XS

**CODE-06 — The Top-100 map shows 96 cells, but only 49 of them can ever change state**

- Severity: Medium
- Location: `app\src\lib\stats.ts:178-202`; `shared\patterns.ts:208-213`; `app\src\screens\ErrorLog.tsx:166-201`
- Evidence: `getPatternMap` maps over `JOURNAL_PATTERNS` (96 patterns — all 100 minus the 4 `professional` ones) and assigns `unseen`/`active`/`fading` from `c.pattern_id`. `pattern_id` is only ever written by `labelForHit` in `pipeline.ts:236-241`, and hits only come from `applyPatterns`, which iterates `DETERMINISTIC_PATTERNS` — the 49 entries with a `find` regex. The other 47 cells are structurally unreachable; no amount of writing can turn one of them.
- Impact: the grid presents itself as a checklist with a visible end ("A streak measures attendance; this measures which known traps still catch them"), and the header counts `{seenPatterns.length} seen` against a 96-cell field. A learner reading it will conclude they have half the list still ahead of them when half of it is not wired up. This is the same honesty standard the code applies elsewhere — the deliberate refusal to add a `fixed` status because avoidance cannot be told from mastery — applied inconsistently here.
- Recommendation: render only the reachable set. `getPatternMap` should map over `DETERMINISTIC_PATTERNS`, or `PatternCell` should carry a `reachable` flag the grid uses to shade the rest differently and exclude from the denominator.
- Effort: XS

**CODE-07 — The reference documents describe an application that no longer exists**

- Severity: Medium
- Location: `knowledge\project.md:36`, `:39`, `:64`, `:93`, `:133`; `english-feedback-app\CLAUDE.md:28-29`, `:358`; `english-feedback-app\README.md:81`, `:121`, `:203`, `:214`, `:250`
- Evidence, each verified against the tree:
  - `project.md:93`, inside **Hard Constraints** #3: "The 20 categories in `shared/schema.ts`". There are 25, and they live in `shared/taxonomy.ts:19-45`.
  - `project.md:133`: "Curated contrastive dossiers live in `LEARNER_DOSSIERS` (`shared/schema.ts`)". `LEARNER_DOSSIERS` does not exist anywhere in the repository; the notes are `l1NoteMongolian`/`bridgeMongolian` fields on `TAXONOMY`.
  - `project.md:64`: the pipeline described as "a diff-verified correction, then synthesis, with a coach reply in parallel" — retired by ADR 0001.
  - `project.md:36`: the Feedback module described as shipping scores, CEFR, fluency notes, vocabulary and drills; `project.md:39` labels the tab **Errors**, while `App.tsx:20` labels it "Patterns".
  - `CLAUDE.md:28-29` lists `src/lib/progress.ts` as a layout entry. The file does not exist. `CLAUDE.md:358` cites "the weekly-review card" as typecheck-only — there is no such component.
  - `README.md:214`: "the 20-category enum lives in `shared/schema.ts`". `README.md:203`: "10 KB max body" (`MAX_BODY_BYTES` is 12 KB). `README.md:250`: "`pipeline.ts`'s orchestration of the nine agents". `README.md:121` says to uncomment the `[[kv_namespaces]]` block, which is already live in `wrangler.toml:26-28`. `README.md:81` claims the local `curl` smoke test works "while `ALLOWED_ORIGIN` is `\"*\"`", but the committed `wrangler.toml:17` pins a single origin, so that step returns 403 as written.
- Impact: `CLAUDE.md` instructs every contributor to read `project.md` first, and `project.md`'s *hard constraints* section is one of the stale parts. A contributor following constraint #3 literally would go looking for a 20-name enum in `schema.ts`, and the one thing that section exists to prevent is exactly the mistake with no recovery.
- Recommendation: a single documentation pass reconciling the three files with the post-ADR-0001 tree. No code change.
- Effort: S

**CODE-08 — Derived per-entry statistics live inline in components, duplicated, and untested**

- Severity: Medium
- Location: `app\src\screens\Feedback.tsx:64-67`; `app\src\screens\History.tsx:29-50`; `app\src\screens\ErrorLog.tsx:60`
- Evidence: `per100(entry)` is defined twice, byte-for-byte identically, in `Feedback.tsx` and `History.tsx`. `topCategories(entry)` in `History.tsx:38-50` re-implements the grouping `getErrorCounts` already does, scoped to one entry. `ErrorLog.tsx:60` computes `entries.filter((e) => e.feedback).length` where `stats.ts` exports `getAnalysedCount`, and the two disagree: `getAnalysedCount` requires `status === "analysed" && feedback`, so an entry that carries feedback under a non-analysed status is counted on the Errors header but not in the streak arithmetic.
- Impact: `knowledge\coding-standards.md` is explicit — "Anything computed from stored data belongs in a pure function in `lib/`, not inline in a component. That is what makes it testable." These four computations are the ones the tests cannot reach, and `per100` is the number the app asks the learner to watch. Two copies of a formula drift; two definitions of "analysed" already have.
- Recommendation: move `per100`, `topCategories` and the analysed count into `stats.ts` beside `getTrend`, which already owns the errors-per-100-words definition, and have `ErrorLog` call `getAnalysedCount`.
- Effort: XS

**CODE-09 — Export is the only backup route and there is no way to restore one**

- Severity: Medium
- Location: `app\src\screens\Settings.tsx:78-96` (`handleExport`), `:98-111` (`handleDelete`); `app\src\lib\db.ts:272-296`
- Evidence: `exportAllJson` produces a complete, well-formed archive (`profile`, `draft`, `entries`) and `deleteAllData` clears both stores. There is no corresponding import anywhere in `app/src`.
- Impact: `Settings.tsx:220-222` tells the learner "Use Export below to keep a copy", and `handleDelete`'s confirm text says "Export a copy first if you want to keep it." Both promise a recovery path that does not exist. A learner who clears browser data, changes device, or takes the app at its word before deleting has a JSON file and no way back into the app — and by `project.md`'s own privacy model, that file is the only copy in the world.
- Recommendation: a file-input handler that parses the export, validates each entry against a schema, and `put`s them by `id` (existing ids skipped, so re-import is idempotent). Small, and it closes the loop the UI already advertises.
- Effort: S

**CODE-10 — `StoredCorrection` claims guarantees that stored data does not have**

- Severity: Medium
- Location: `shared\schema.ts:131-141`
- Evidence: `StoredCorrection = z.infer<typeof CorrectionSchema> & { rule?: string }`, so `explanation: string`, `category: CategoryEnum` and `severity: SeverityEnum` are all *required and v2-shaped* in the type. The comment two lines above says the opposite: "A stored correction may be legacy: `rule` instead of `explanation`, no `source`, legacy category/severity names." The code agrees with the comment, not the type — `stats.ts:143` writes `c.explanation ?? c.rule ?? ""`, and `Feedback.tsx:422` writes `{c.explanation ?? c.rule}`.
- Impact: `knowledge\coding-standards.md` calls for modelling "states you actually have". Today every read site defends itself by hand; the type does not force it. A new screen that renders `c.explanation` directly typechecks cleanly and shows `undefined` on every pre-v2 entry, and there is no compiler pressure to catch it.
- Recommendation: define `StoredCorrection` as the read-back shape it really is — `explanation?: string; rule?: string; category: string; severity: string; source?: "pattern" | "model"` — and keep `CorrectionSchema`'s inferred type for the network boundary only. Existing `??` chains then become required rather than optional, and `normalizeCategory` becomes unavoidable at the read sites.
- Effort: S

### Low

**CODE-11 — Comments that state something the code does not do**

- Severity: Low
- Location: `worker\src\policy.ts:61-62`; `app\src\lib\api.ts:16-23`
- Evidence: `/** Length-independent comparison, so a wrong key leaks nothing via timing. */` sits above `safeEqual`, whose first line is `if (a.length !== b.length) return false;` — an early return on length. (The behaviour is fine and standard; the comment is not accurate.) In `api.ts`, the comment justifying `REQUEST_TIMEOUT_MS` describes "up to 3 corrector attempts on an over-rewrite, then synthesize — coach runs in parallel", a pipeline retired by ADR 0001.
- Impact: `coding-standards.md` reserves comments for "a constraint, a reason, a non-obvious consequence". A comment asserting a security property the code lacks is worse than none, because the next reviewer trusts it.
- Recommendation: reword `safeEqual`'s comment to what it does (content compared in constant time; length is not secret here), and rewrite the `api.ts` note around the one-teacher-call-plus-two-retries shape.
- Effort: XS

**CODE-12 — `TAXONOMY_VERSION` is exported, never used, and never stored on an entry**

- Severity: Low
- Location: `shared\taxonomy.ts:17`; `app\src\lib\db.ts:12-45` (`Entry`)
- Evidence: `export const TAXONOMY_VERSION = 2;` has no reader anywhere in `app/`, `worker/`, `shared/` or `tests/`. `Entry` stores `modelId` and `promptVersion` but no taxonomy version.
- Impact: dead code today. It matters at v3: `normalizeCategory` distinguishes v1 from v2 only because their names happen not to collide. If v3 ever *renames* an existing id, a stored `"article"` becomes ambiguous with no per-entry marker to disambiguate it, and the "renaming a category silently rewrites history" invariant loses its last defence.
- Recommendation: either delete the constant, or write it onto every new entry beside `promptVersion` — it costs one field and makes a future migration decidable.
- Effort: XS

**CODE-13 — One pattern hit can label several diff edits**

- Severity: Low
- Location: `worker\src\patterns.ts:137-149`; `worker\src\pipeline.ts:230-243`
- Evidence: `findMatchingHit` uses `hits.find(...)` and the matched hit is never removed from `hitsBySentence[edit.sentIdx]`. Two edits in the same sentence that both satisfy containment both receive `source: "pattern"` and the *same* `pattern_id`.
- Impact: `getPatternMap` counts `hits` per `pattern_id`, so one deterministic fix can register as two, inflating that cell in the progress map. The text of every correction stays verbatim-correct; only the attribution count is affected. This is adjacent to the containment heuristic already recorded in Known Gaps, but the non-consuming match is a separate mechanism and is not described there.
- Recommendation: splice the matched hit out of the array, mirroring the `noteQueues.shift()` already used two lines below for model notes.
- Effort: XS

**CODE-14 — The in-memory rate-limit fallback never evicts old buckets**

- Severity: Low
- Location: `worker\src\index.ts:27`, `:76-83`
- Evidence: `memoryCounts` gains one entry per distinct IP and only ever overwrites on a bucket change — nothing removes IPs that stop calling.
- Impact: unbounded growth in a long-lived isolate. Only reachable when `RATE_LIMIT_KV` is unbound, which the committed `wrangler.toml` avoids, so this is a second-environment hazard rather than a live one.
- Recommendation: drop stale buckets opportunistically on write, or cap the map size.
- Effort: XS

**CODE-15 — The toast timer is never cleared**

- Severity: Low
- Location: `app\src\App.tsx:30-33`
- Evidence: `showToast` calls `window.setTimeout(() => setToast(null), 4000)` without clearing the previous handle.
- Impact: two toasts within four seconds — plausible when `processQueue` finishes just as a submit fails — means the first timer dismisses the second message early, sometimes almost immediately.
- Recommendation: keep the handle in a ref and clear it before setting a new one.
- Effort: XS

**CODE-16 — Settings keeps showing the profile after "Delete all data"**

- Severity: Low
- Location: `app\src\screens\Settings.tsx:98-111`
- Evidence: `handleDelete` calls `deleteAllData()` (which clears the `meta` store, profile included) and shows a toast, but never resets `profile`/`saved` state. The form still displays the old values, `dirty` is false, and the Save button is disabled — so the screen asserts the profile is saved when nothing is stored.
- Impact: the learner believes their profile survived the delete; the next analysis is sent without it, with no visible cause.
- Recommendation: `setProfile({}); setSaved({});` after a successful delete.
- Effort: XS

**CODE-17 — Value imports from `shared/` are inconsistent about the `.ts` extension**

- Severity: Low
- Location: `app\src\lib\db.ts:2`; `app\src\lib\api.ts:1-6`; `app\src\screens\Write.tsx:20`; `app\src\screens\Settings.tsx:2-7` — versus `app\src\lib\categories.ts:9` and `app\src\lib\stats.ts:2-3`, which do carry it
- Evidence: `db.ts` value-imports `LearnerProfileSchema` from `"../../../shared/schema"`; `categories.ts` re-exports `countWords` from `"../../../shared/schema.ts"`.
- Impact: none today — Vite resolves both. It matters the moment a module currently on the extensionless side is pulled into `tests/`, which runs under bare Node with no bundler; `CLAUDE.md`'s pure-logic invariant exists precisely to keep that door open.
- Recommendation: use the explicit `.ts` extension on every value import from `shared/`, as the two `lib/` modules already do.
- Effort: XS

**CODE-18 — No test pins the 25 v2 category ids**

- Severity: Low
- Location: `tests\schema.test.ts:77-86`; `tests\patterns.test.ts:29-45`
- Evidence: the suite asserts that every `LEGACY_CATEGORY_MAP` value is a member of `CATEGORY_IDS`, and spot-checks `normalizeCategory` on four ids (`article`, `run_on`, `word_order`, `capitalisation`). Nothing asserts the *list*. Renaming any of the other 21 — `preposition`, `verb_tense`, `collocation` and so on — leaves `npm run verify` green.
- Impact: the taxonomy ids are declared versioned data stored inside every past entry, and the verification gate that would catch a rename does not cover 21 of the 25.
- Recommendation: one `assert.deepEqual(CATEGORY_IDS, [...])` snapshot with a comment saying that a failure here means a migration, not an edit.
- Effort: XS

---

## Clean Areas

- **Security — key handling.** `grep -ri "sk-ant"` over `app/src` is empty; the key exists only as `env.ANTHROPIC_API_KEY` in `worker/src/index.ts:160`, `wrangler.toml` carries no secret in `[vars]`, and `.gitignore:9` excludes `app/.env.production`.
- **Security — logging.** Every Worker log statement carries a status, an error class name, a refusal category, a token count or a ratio. No path logs entry text (`pipeline.ts:83`, `:91`, `:95`, `:192`; `index.ts:97`).
- **Security — DOM.** No `dangerouslySetInnerHTML` and no `innerHTML` anywhere in `app/src`; all user text goes through JSX text nodes.
- **Security — request validation.** `parseAnalyzeBody` rejects on decoded byte length rather than `Content-Length`, enforces `MIN_WORDS` server-side, and drops malformed `history`/`profile` fields instead of failing the request. Quota is charged after all of it (`index.ts:144-157`), so a rejected request costs nothing.
- **Statistics — no NaN/Infinity path.** Every division is guarded: `getTrend` (`stats.ts:120`), `rewriteRatio` (`diff.ts:231`), `per100` in both screens, and all four percentage renders in `ErrorLog.tsx` (`:98`, `:155`, `:284`).
- **Dates and time zones.** `localDay` (`stats.ts:99-104`) buckets on the learner's calendar day rather than UTC, and `tests/stats.test.ts:279-289` re-runs the trend under a non-UTC `TZ` specifically to hold that.
- **Errors-per-100-words provenance.** Computed from `entry.wordCount`, which is `countWords(text)` on the exact text submitted (`Write.tsx:127`, `:153`), and the Worker analyses that whole text. The metric measures the words actually analysed.
- **Offline behaviour.** Drafts autosave to IndexedDB, entries are stored before any network call, an offline submit navigates to History with a truthful message, and the queue drains on `online`, on visibility, and on a timer.
- **Prompt caching.** `TEACHER_SYSTEM_PROMPT` interpolates only two module-level constants derived from the static taxonomy; everything per-user or per-request is assembled in `buildUserContent` / `learner.ts`. `prompts/teacher.md` and the mirror in `shared/schema.ts` are byte-identical modulo the two documented placeholders.
- **Failure classification and retry.** `retryable` is carried across the wire, honoured by `applyFailure`, bounded by `MAX_ATTEMPTS`, and rate limiting deliberately does not spend the budget — all tested.
- **Claim protocol.** `claimForAnalysis` / `finishAnalysis` / `reclaimStaleAnalysing` each take a single readwrite transaction, and every decision inside them is a pure function in `claim.ts` with test coverage for the racing, stale and late-result cases.
- **Error handling in screens.** Every `useEffect` that loads data handles rejection; `useLoad` distinguishes `StorageBlockedError` from `StorageUnavailableError` and gives each a different, actionable message; `ErrorBoundary` keeps a bad render from hiding Export and Delete.
- **TypeScript.** `strict` on in all three tsconfigs, no `any` in first-party code, network responses validated with the shared Zod schema at both boundaries.
- **Dead code.** Beyond `TAXONOMY_VERSION` (CODE-12), none found — the retired agents' derivations were removed rather than commented out, and the removals are marked with pointers to ADR 0001 (`stats.ts:204-206`, `policy.ts:208-210`).

## Technical Debt

- **`worker/src/pipeline.ts` and the `fetch` handler have no integration test** (Known Gap, accurately described). This is where the money is spent and where the rewrite-retry loop, the notes zip and the acute short-circuit all live. It is the largest untested surface in the system and every finding I could not confirm by reading — the real cost of an entry, how often the zip degrades to `"other"` — sits behind it.
- **No React component has a test.** Acknowledged. CODE-08 is the compounding factor: the derived numbers those components compute inline are unreachable by the one test layer that does exist.
- **No per-entry taxonomy version** (CODE-12). Cheap now, a genuine migration problem at v3.
- **Export without import** (CODE-09) is debt in the strictest sense: the data format is already stable and correct; only the read side is missing, and it gets harder to add once entry shapes have accumulated another era of optional fields.
- **The 540 s client timeout** is still sized for the retired four-call worst case (Known Gap, and the stale comment is CODE-11). Until latency is measured, a hung analysis holds a claim for nine minutes and `STALE_CLAIM_MS` is sized off it.
- **The Recharts precache** (Known Gap) is the largest single item in the ~950 KB shell for one chart on one screen. `React.lazy` around the trend section would remove it from first load without changing behaviour.

## Future Risks

- **The growth curve is the main one.** CODE-02 and CODE-03 both degrade continuously and neither has a threshold at which anything fails — the app just becomes slower, on the schedule of a user who keeps writing. That is the hardest kind of regression to attribute after the fact, and the cheapest to prevent now.
- **Cost visibility.** CODE-01 is the immediate exposure, but the deeper risk is that nothing in the system reports what an entry costs. `cache.read`/`cache.write` come back in the response and are discarded by the client (`api.ts:100-105` ignores `data.cache`). The first real answer to "is prompt caching working?" will come from an invoice.
- **The Error Log's all-time counts** (Known Gap) get monotonically less useful as history grows: a pattern fixed in month one outranks a live one in month twelve forever. The pattern map's active/fading split shows the shape of the fix; the ranked list — the screen `project.md` calls the one that carries the vision — still does not decay.
- **A third taxonomy.** The v1→v2 map works because the two name sets do not collide. That is luck, not design, and CODE-12 is what would turn it into design.
- **Spaced repetition** (`project.md`'s first long-term item) reads across the entire error history to schedule resurfacing. Built on today's read path it inherits CODE-02's full-store scan on every scheduling pass, so the `by-status` index is a prerequisite for the roadmap and not only a fix.

## Recommended Refactoring

The smallest set of structural changes, in the order I would do them:

1. **Add a `by-status` index to the `entries` store** in a guarded `oldVersion < 2` upgrade step, and route `getQueuedEntries`, the Write screen's active-claim poll and `reclaimStaleAnalysing` through it. Removes CODE-02 entirely and unblocks the roadmap's read patterns. One file (`db.ts`) plus one call site.
2. **Add a global hourly spend counter and charge it per upstream call.** One extra KV key inside the existing `chargeQuota`, plus moving the charge into `runPipeline`'s loop. Addresses CODE-01 without pretending the Origin header is authentication.
3. **Move `per100`, `topCategories` and the analysed count into `stats.ts`**, and cap the two unbounded lists at a first page. One structural change covering CODE-03 and CODE-08, and it moves the app's headline number into the layer the tests can reach.
4. **Separate the two writes in `runAnalysis`** so a `clearDraft` failure is logged rather than reported as a lost entry (CODE-04) — one line, and it removes a duplicate-entry-plus-double-charge path.
5. **Retype `StoredCorrection` as the read-back shape** (CODE-10). This is the change that makes the remaining legacy-data handling compiler-enforced instead of convention-enforced, and it should land before any new screen reads corrections.
6. **One documentation pass** over `project.md`, `CLAUDE.md` and `README.md` (CODE-07), plus the two inaccurate code comments (CODE-11) and the category-list snapshot test (CODE-18). No behaviour change, and it restores the map the next contributor navigates by.

Items 4, 5 and 6 are each under half a day. Items 1–3 are the ones that decide whether this codebase is still fast at entry one thousand.
