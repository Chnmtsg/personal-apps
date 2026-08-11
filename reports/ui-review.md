# UI Review — english-feedback-app

## Executive Summary

This is a carefully made interface. The token system, the copy discipline, the failure states and the offline handling are better than most production apps at this size, and the ink-on-paper palette is applied with real restraint. Two things pull it down. First, the Feedback screen's opening card leads with a correction count and an error rate set at 30px — a scoreboard placed before the teaching, which is the exact framing `ui-guidelines.md` and the product's philosophy exist to prevent. Second, the two lightest ink tokens (`--color-ink-faint`, `--color-ink-ghost`) fail WCAG AA at 3.45:1 and 2.62:1, and they carry every metadata label in the app, the inactive tab labels, the textarea placeholder, and the one sentence that stops a learner reading a rising number as failure. The single biggest problem is the first: a learner at A2+/B1 opens their feedback and is shown a number before a teacher.

## Overall Score

**77 / 100 — Solid. High findings exist but are contained.**

No Critical findings; the hard constraints in `project.md` that touch the UI (an entry is never lost, a crisis is never a grammar lesson, the user's own text is preserved and readable) are all honoured on screen. Two High findings — one framing, one accessibility — are real and hit every user, but both are contained fixes rather than rework, and the Medium findings are mostly single-file.

## Strengths

- **The failure and pending states are the best part of the app.** `FAIL_REASON_MESSAGES` is one source of truth shared by the toast and the Feedback screen, so the same failure can never be explained two ways (`app/src/lib/categories.ts:45`). The pending card leads with "Your writing is safe", shows the attempt count as data, and prints the entry in full underneath — that is the right answer to the learner's actual first question.
- **The trend is explained where it is shown.** `app/src/screens/ErrorLog.tsx:245` — "This should get smaller over time. It does not go up just because you write more." This is precisely the sentence that stops a learner misreading the chart, and it is present. (It is the only place the number is explained; see UI-04.)
- **`EditSpan` is a genuinely good accessibility component.** `<del>`/`<ins>` with `sr-only` "removed:" / "changed to:" wording, plus correct handling of pure insertions and deletions (`app/src/components/EditSpan.tsx`). Meaning does not ride on hue.
- **The learner's own writing is shown back at full size in the serif** everywhere it is the subject — Write, the pending card, the acute card, the corrected-text card, all at 16.5px.
- **The acute-distress screen** withholds grammar feedback, says so explicitly, and points at local emergency services and findahelpline.com with no invented phone numbers.
- **Scores are never coloured by value,** the error log's empty state says what to do and is honest about needing 20–30 entries, and the `ErrorBoundary` deliberately keeps export/delete reachable after a bad render.

## Findings

### UI-01 — Feedback card 1 opens with a count and a score, before any teaching

- **Severity:** High
- **Location:** `app/src/screens/Feedback.tsx:307–334` (summary card), cross-referenced at `:539` (closing card)
- **Evidence:** The first card a learner sees renders, in order: an eyebrow, an `<h1>` reading "`{n}` corrections to read.", then a bordered `<dl>` containing the errors-per-100-words figure at `text-[30px]` and (on entries that stored one) the CEFR estimate at `text-[30px]` labelled "This entry". Only *after* that block does `fb.teacher_feedback` appear. `ui-guidelines.md` states: "the card order is the teaching order… Scores live on the closing card — after the teaching, never before it," and "never make the feedback feel like a scoreboard." The same rate is already rendered as the closing card's headline (`:541`), so it is shown twice — once before the teaching and once after.
- **Impact:** The first thing an A2+/B1 learner reads after being told they made mistakes is a tally of them and a rate, typographically the loudest thing on the card. The teacher's message — the part that actually teaches, and the only field the current single-agent pipeline still writes — is pushed below the fold of the card on a small phone. This is the product's stated core risk, realised on its most-used screen.
- **Recommendation:** Delete the `<dl>` from the summary card. Move the CEFR figure to the closing card beside the rate that is already there. Make `teacher_feedback` the card's headline, and demote the correction count to the existing eyebrow line ("Sat 8 Feb · 210 words · 7 corrections"). No new components; a reorder.
- **Effort:** S

### UI-02 — `ink-faint` and `ink-ghost` fail WCAG AA, and carry every label in the app

- **Severity:** High
- **Location:** `app/src/index.css:15–16` (`--color-ink-faint: #8b8578`, `--color-ink-ghost: #a09a8c`) and the `.eyebrow` class at `:49`
- **Evidence:** Measured against `--color-paper` (#faf8f3): `ink-faint` is **3.45:1**, `ink-ghost` is **2.62:1**. Against `--color-sunk` (#f4f1ea, the tab bar) `ink-faint` drops to **3.25:1**. AA requires 4.5:1 for text under 18.66px, and every use here is smaller than that. Affected, non-exhaustively:
  - `.eyebrow` — 10px, `ink-faint`. This is the label under *every* number in the app: "Per 100 words", "Attempts", "Words", "Grammar", "This entry", "The rule", "Hint".
  - Inactive tab labels, `App.tsx:112` — 11px at 3.25:1, the app's primary navigation.
  - "write N more to analyse", `Write.tsx:332` — the only text explaining why the Analyse button is disabled.
  - The trend explanation, `ErrorLog.tsx:245` — 12.5px at 3.61:1 on `bg-card`. The one sentence that defuses "my number went up".
  - The textarea placeholder, `Write.tsx:321` — `ink-ghost` at 2.62:1.
  - Fluency-note "before" text, `Feedback.tsx:447` — the learner's own words at **2.74:1** with a strikethrough over them.
  - Disabled button labels are worse still: `disabled:text-ink-faint` on `disabled:bg-rule-strong` is **2.19:1** for the Analyse button (`Write.tsx:341`), and Settings' disabled Save is `text-paper` on `bg-rule-strong` at **1.58:1** (`Settings.tsx:191`) — effectively an invisible label. Disabled controls are exempt from 1.4.3, but "Analyse" is the state a first-time user meets first.
- **Impact:** The target user is reading a second language in a small typeface. Every explanatory label in the app is the least legible thing next to the thing it explains. Outdoors, on an older screen, or for anyone over 40, the metadata layer disappears — including the sentence that keeps the trend from reading as failure. This is a systematic AA failure across all five screens.
- **Recommendation:** Darken both tokens: `--color-ink-faint` to roughly `#6b6559` (≈5.4:1) and `--color-ink-ghost` to roughly `#767061` (≈4.6:1), then re-check the two on-accent uses in `ErrorLog.tsx:144/153`. Raise `.eyebrow` from 10px to 11px. Give both disabled states an explicit readable label colour (`disabled:text-ink-soft`).
- **Effort:** S

### UI-03 — Three screens render nothing while loading

- **Severity:** Medium
- **Location:** `Feedback.tsx:113`, `History.tsx:55`, `ErrorLog.tsx:66` — all `if (state.status === "loading") return null;`
- **Evidence:** `useLoad` starts in `{ status: "loading" }` and every consumer returns `null` for it. `ui-guidelines.md`: "Every screen needs four: loading, empty, error, and populated… Never render nothing and leave the user guessing."
- **Impact:** On a cold PWA launch, or on a device where IndexedDB is slow to open, the user sees blank paper with only the tab bar. There is no way to tell a slow read from an empty app or a broken one — and tapping a History row into a blank Feedback screen reads as "my entry is gone", which is the one fear this app has otherwise worked hard to answer.
- **Recommendation:** Return the screen's header plus a one-line `role="status"` note ("Opening your writing…") instead of `null`. The headers already exist in the error branch of each file.
- **Effort:** XS

### UI-04 — The errors-per-100-words figure is unexplained everywhere it is a headline

- **Severity:** Medium
- **Location:** `Feedback.tsx:324` (summary), `Feedback.tsx:539` (closing card headline), `History.tsx:91` (column head "/100w")
- **Evidence:** The only explanation of the metric in the app is under the chart on the Patterns screen (`ErrorLog.tsx:245`). On the Feedback closing card the figure is the `<h2>`: "12.5 errors per 100 words this time." — "this time" implies a comparison, but no previous value is shown and nothing says lower is better. In History the column is headed `/100w` with no key. For a new entry the closing card now carries nothing but this headline and two buttons, since scores and the coach reply are legacy-only fields — so the app's last word to the learner is a bare number.
- **Impact:** A learner reads a number they were never taught to read, as the final statement of their feedback. Without a direction ("lower is better") or a reference point, an unremarkable 12.5 is indistinguishable from a bad one, and the metric that was chosen *specifically* to be fair becomes another verdict.
- **Recommendation:** Add one sentence under the closing-card headline: the previous entry's figure and "lower is better — this counts mistakes fairly whether you write 50 words or 400." The previous value is already computable from the entries `getTrend` reads. Expand the History column head to "per 100 words".
- **Effort:** XS

### UI-05 — Advertised keyboard navigation does not work, and no card or screen change is announced

- **Severity:** Medium
- **Location:** `Feedback.tsx:268–271` (`onKeyDown` on a non-focusable `<div>`), `:594` (the hint text), `App.tsx:71–83` (screen switching)
- **Evidence:** The card stack's arrow-key handler is attached to a `<div>` with no `tabIndex`. React delegates events at the root container, so a keydown fired while `document.activeElement` is `<body>` — which is exactly where focus lands after navigating from a History row, since the clicked button unmounts — never reaches the handler. The footer nonetheless tells every user "Drag the card, or use ← →". Separately, changing screen or card moves nothing and announces nothing: the `<article>` is not a live region and focus is never reset to the new screen's heading.
- **Impact:** The on-screen instruction is false until the user happens to Tab into a button. A screen-reader user pressing "Next card" hears silence and has no way to know the content changed; a keyboard user landing on Feedback must Tab blindly to find the entry point. The prev/next buttons keep the flow *possible*, so this is not a blocker.
- **Recommendation:** Put `tabIndex={0}` and an `aria-roledescription`/`aria-label` on the swipe container so it can hold focus, focus it on mount, and add `aria-live="polite"` to the card counter at `:278` so the card number is announced on change. Move focus to the screen's `<h1>` on screen change in `App.tsx`.
- **Effort:** S

### UI-06 — The top-100 map is colour-only, hidden from assistive tech, and its labels are hover-only

- **Severity:** Medium
- **Location:** `ErrorLog.tsx:174–199`
- **Evidence:** 100 cells whose only differentiator is fill colour (`bg-warn/70`, `bg-accent/40`, `bg-ink/[0.07]`), inside a container marked `aria-hidden`. Each cell's identity lives in a `title` attribute — which never appears on touch, and cannot be reached by keyboard since the cells are non-focusable `<span>`s. `ui-guidelines.md`: "Never carry meaning in colour alone — pair it with a label or a shape."
- **Impact:** On a phone — the app's stated primary platform — a learner can see that 34 squares are coloured but can never find out which errors they are. Screen-reader users get nothing at all beyond "34 seen". A person with a red-green or contrast deficiency cannot reliably separate `warn/70` from `accent/40`. The map is the newest and most motivating idea on the Error Log, and it is currently decorative for a large share of users.
- **Recommendation:** Make each cell a `<button>` that opens the same category detail view the ranked list already opens, give it an `aria-label` carrying the pattern text and status, and differentiate the three states by shape as well as fill (filled / ring / empty). Remove `aria-hidden` from the grid.
- **Effort:** S

### UI-07 — The History empty state states the wrong minimum word count

- **Severity:** Medium
- **Location:** `History.tsx:81`
- **Evidence:** "Tap **Write** to add your first piece of writing — fifty words is enough." `MIN_WORDS` is **30** (`shared/schema.ts:32`), and the Write screen counts down to 30.
- **Impact:** This is the first instruction a brand-new user reads, and it contradicts the app's own gate. It asks for 67% more writing than is needed, on the screen whose job is to get someone to write anything at all. It also breaks trust in the app's other numbers, which are its entire premise.
- **Recommendation:** Interpolate `MIN_WORDS` rather than hard-coding a number.
- **Effort:** XS

### UI-08 — "Your number one pattern" is an all-time count that never decays

- **Severity:** Medium
- **Location:** `ErrorLog.tsx:142–161`, ranked from `getErrorCounts` (`app/src/lib/stats.ts:21`), which sums over every entry ever
- **Evidence:** The largest, only-filled-colour element in the app names `counts[0]` from an unweighted all-time tally. Nothing decays. (Listed as a known gap in `CLAUDE.md`; the pattern map's active/fading split covers part of it, but the headline block does not use it.)
- **Impact:** At the scale this app is designed for — "after two hundred entries" — a learner who fixed their article errors in month two will still be told articles are their number one pattern in month eight, in the app's loudest voice, with a rule they no longer need. The module that carries the product's whole reason to exist gradually starts describing a person who no longer exists.
- **Recommendation:** Rank the headline block over a recent window (the last 20 analysed entries, or 90 days), and label it as such — "Your number one pattern lately". Leave the ranked list all-time and label that column too, so the two are visibly answering different questions.
- **Effort:** M

### UI-09 — The Feedback back control is under 44px and inconsistent with every other back control

- **Severity:** Medium
- **Location:** `Feedback.tsx:275` — `className="min-h-11 text-xs text-ink-soft"`, label "Close"
- **Evidence:** `min-h-11` gives 44px of height but no horizontal padding; "Close" at `text-xs` (12px) is roughly 33px wide, so the target is about 33×44. `ui-guidelines.md` requires 44×44 minimum, "including back buttons". Every other back affordance in the app is `text-sm` and reads "‹ History" (`Feedback.tsx:107`) or "‹ Patterns" (`ErrorLog.tsx:88`) — the card view is the only place that says "Close" and the only place it shrinks to 12px.
- **Impact:** The only exit from the card stack is the smallest tap target in the app, and it is placed in the top-left corner where a thumb is least accurate. Two learners reading the same feedback flow are given two different words for the same action.
- **Recommendation:** Reuse the existing `back` element (`Feedback.tsx:103`) in the card view; it is already defined in the file and unused on this branch.
- **Effort:** XS

### UI-10 — Cards scroll internally, against the one-idea-per-card rule

- **Severity:** Low
- **Location:** `Feedback.tsx:300` (`overflow-y-auto` on the `<article>`), `:524` (a second scroll container for the corrected text)
- **Evidence:** `ui-guidelines.md`: "One idea per card. If a card needs a scrollbar to make sense, it is two cards." The card is a fixed-height region (roughly viewport minus 180px); the corrected-text card renders a whole entry inside it, and the summary card holds an eyebrow, an h1, a stats block and a full teacher message.
- **Impact:** Content below the fold of a card is easy to miss, because the card's own scroll offers no affordance and the visible gesture cue is horizontal. Mitigated by `pointercancel` correctly aborting a drag when the browser takes over vertical panning.
- **Recommendation:** Accept the corrected-text card as a deliberate exception and say so in a comment; fix the summary card by moving the stats block off it (UI-01), which is most of the overflow.
- **Effort:** M

### UI-11 — Shadows reintroduced for depth

- **Severity:** Low
- **Location:** `Feedback.tsx:300` (`shadow-[0_6px_18px_rgba(30,26,20,0.07)]`), `Write.tsx:341` (`shadow-[0_2px_8px_rgba(51,65,143,0.3)]`), `App.tsx:89` (`shadow-lg`)
- **Evidence:** `ui-guidelines.md`: "Cards are separated by a hairline rule (`border-rule`) on `bg-card`, not by shadow. Do not reintroduce shadows for depth."
- **Impact:** Cosmetic drift only. The card-stack shadow is the clearest case: the stack already communicates depth with two offset ghost cards and hairline rules, so the shadow adds nothing the rule does not.
- **Recommendation:** Drop the shadow on the card `<article>`. The button and toast shadows are elevation on floating elements rather than card separation — keep them, or note the exception in `ui-guidelines.md`.
- **Effort:** XS

### UI-12 — Hard-coded colours in screens, and dead code carrying banned palette steps

- **Severity:** Low
- **Location:** `ErrorLog.tsx:142/144/145` (`text-[#eceaf6]`, `text-white`), `Feedback.tsx:296` (`bg-[#f6f3ec]`), `Write.tsx:49–56` (the ruled-paper gradient hard-codes `#faf8f3`), `app/src/lib/categories.ts:54–58` (`SEVERITY_STYLES`)
- **Evidence:** `ui-guidelines.md`: "Every colour is a token in `app/src/index.css`. Screens name tokens… never Tailwind palette steps — a `text-slate-600` anywhere in a screen is a bug." `SEVERITY_STYLES` contains `bg-slate-100 text-slate-600`, `bg-amber-100 text-amber-700`, `bg-red-100 text-red-700` — three hues the palette explicitly does not have. It is exported and referenced nowhere (verified by grep across the repo).
- **Impact:** A future palette change silently misses these spots. The ruled-paper gradient is the sharpest risk: it hard-codes the paper colour, so changing `--color-paper` would leave the writing surface a different colour to the page around it. The dead constant is a loaded gun for whoever wires up severity badges next.
- **Recommendation:** Delete `SEVERITY_STYLES` (and `SEVERITY_LABELS` if it stays unused). Replace the arbitrary hexes with tokens — add `--color-paper-dim` for `#f6f3ec` and an on-accent text token for `#eceaf6`, and drive the gradient from `var(--color-paper)`. Recharts' literal hexes are unavoidable; leave a comment saying they mirror the tokens.
- **Effort:** XS

### UI-13 — One module has four names

- **Severity:** Low
- **Location:** `App.tsx:20` ("Patterns"), `knowledge/project.md:38` ("labelled **Errors**"), `Feedback.tsx:400–411` ("your checklist"), `ErrorLog.tsx:169` ("Your top-100 map"), `ErrorLog.tsx:298` ("Copy my error log")
- **Evidence:** The tab reads "Patterns"; the project reference says the tab is labelled "Errors"; the same screen calls its grid "Your top-100 map" while the Feedback correction pill calls the same list "your checklist"; the button on that screen calls the whole thing "my error log".
- **Impact:** A learner who is told "#42 on your checklist" has no way to know where to find the checklist, because nothing is called that. It also means the app's documentation and its UI disagree about what its most important module is called.
- **Recommendation:** Pick one learner-facing name — "Patterns" is the better word for the framing this app wants — and update `project.md` and the pill copy ("#42 in your top-100 patterns") to match.
- **Effort:** XS

### UI-14 — Fluency notes render a before/after pair without `EditSpan`

- **Severity:** Low
- **Location:** `Feedback.tsx:447–449`
- **Evidence:** The pair is `<span className="text-ink-ghost line-through">` + `<span className="text-accent">`, rather than the `EditSpan` component used by every other before/after in the app. No `<del>`/`<ins>`, no `sr-only` "changed to:". This is a legacy-only card — `fluency_notes` is no longer written — but entries that stored them render forever.
- **Impact:** A screen reader announces two bare phrases with nothing to indicate which is the learner's and which is the improvement. The contrast of the "before" span is covered by UI-02.
- **Recommendation:** Use `EditSpan`. If the ghost tone is deliberate — these are not errors — add a variant prop rather than a second implementation.
- **Effort:** XS

### UI-15 — A second toast within four seconds is dismissed early

- **Severity:** Low
- **Location:** `App.tsx:30–33`
- **Evidence:** `showToast` sets a fresh 4s timer on each call but never clears the previous one. A toast raised 3.5s after another is cleared 0.5s later by the first call's timer.
- **Impact:** A message can flash and vanish before it is readable. Reachable in practice: `processQueue`'s "We checked N saved entries" can fire while a save- or failure-toast is on screen.
- **Recommendation:** Keep the timer id in a ref and clear it at the start of `showToast`.
- **Effort:** XS

### UI-16 — A few strings sit above the target reading level

- **Severity:** Low
- **Location:** `ErrorLog.tsx:255` ("N · share"), `Feedback.tsx:318` ("0 corrections to read.")
- **Evidence:** The ranked list's column header is "N · share" — "N" for count and "share" for percentage. `project.md` sets the reading ceiling at the learner's stated level, B1 by default. Separately, when an entry has no corrections the summary headline renders "0 corrections to read."
- **Impact:** Small, but it lands on the Error Log, the screen a learner is meant to study. "Share" as a noun meaning "percentage of total" is not B1 vocabulary, and it collides with the far more common verb. The zero case turns the app's best moment — a clean entry — into an awkward null statement.
- **Recommendation:** "Count · % of all". Special-case zero corrections: "Nothing to correct this time."
- **Effort:** XS

### UI-17 — Focus and label wiring is inconsistent in two places

- **Severity:** Low
- **Location:** `Write.tsx:321` (textarea `outline-none focus:border-accent/50`), `Settings.tsx:171` (the level select's help paragraph)
- **Evidence:** The Settings inputs remove the outline and replace it with `focus:border-accent focus:ring-2 focus:ring-accent/25`; the Write textarea removes the outline and replaces it with only a 1px border at 50% accent opacity — the weakest focus indicator in the app, on its largest control. The level `<select>`'s help text has no `id` and no `aria-describedby`, while all three text inputs are correctly wired via the `field()` helper.
- **Impact:** Marginal — the caret makes textarea focus obvious in practice, and the select's own label is present. Both are one-line consistency fixes.
- **Recommendation:** Give the textarea the same ring treatment as the inputs. Add `id="level-help"` and `aria-describedby="level-help"`.
- **Effort:** XS

## Clean Areas

- **Navigation.** All five modules are reachable without guessing: four tabs plus Feedback via a History row or straight after an analysis. `aria-current="page"` is set, `activeTab` correctly maps Feedback back onto History so the location never goes blank, and back or cancel exists in every sub-flow (Feedback's four states, the category detail view).
- **Spacing and cards.** Padding, radius (`rounded-2xl`/`rounded-[20px]`) and hairline separation are consistent across screens; the 8px rhythm is followed with deliberate half-steps. Nothing is cramped.
- **Horizontal scrolling.** None found. `overflow-wrap: anywhere` on `body` handles pasted URLs and long compounds, the layout is capped at `max-w-xl` and centred, and the 12-column pattern grid fits the narrowest phone.
- **Destructive actions.** There is exactly one — Delete all data — and it is confirmed with an explicit warning that names the consequence and suggests exporting first.
- **Empty states.** Present for both lists (History, Patterns) and each says what to do next. The Feedback pending/failed state is a proper populated state, not an empty one.
- **The user's own text.** Never shrunk below 16.5px serif anywhere it is the subject; the only reduction is the two-line `line-clamp` preview in History at 14.5px, which is a list preview with the full text one tap away — acceptable.
- **Corrections always carry a rule.** `Feedback.tsx:423` renders `c.explanation ?? c.rule` on every correction card, and `ErrorLog.tsx:109` repeats the rule on every stored example.

## Quick Wins

- **UI-07** — one string; it currently tells every new user the wrong word count.
- **UI-03** — three `return null` branches become three header-plus-status lines using markup already in each file.
- **UI-09** — the correct back button is already defined in the same component and unused.
- **UI-04** — one sentence of copy on the closing card removes the app's most likely misreading.
- **UI-02** — two token values plus one font-size bump clears an app-wide AA failure.
- **UI-01** — a block move within one component; the highest-impact change in this report.
- **UI-05** — `tabIndex`, an autofocus and an `aria-live` on the counter already rendered.
- **UI-06** — the destination view the cells should open already exists and is wired to the ranked list.

## Estimated UX Impact

Once UI-01 and UI-02 are fixed, a learner opening their feedback meets their teacher's words first and the arithmetic last, which is what the product says it is for; and every label, count and caption in the app becomes legible on a phone in daylight, including the sentence that stops a rising trend line reading as failure. The Medium fixes remove the three moments where the app currently loses the learner's trust: a blank screen where their entry should be, a wrong word count in the first instruction they read, and a number presented as a final verdict with nothing to compare it to. Together these change the Feedback screen from something that grades to something that teaches, without a redesign — every fix is a reorder, a token value, or a string.
