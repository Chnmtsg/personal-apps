# UI Review — Arise

## Executive Summary

Arise is a carefully built PWA with more design discipline than most vanilla projects ever reach: a real focus trap on its sheets, a deliberate 44px touch-target strategy with documented reasoning, contrast tokens that were actually computed against the right surface, and copy that is honest about what the app can and cannot do. That craft makes the gaps more conspicuous. The single biggest problem is that Today — the screen the whole product exists to serve — leads with the streak, level, rank and XP, and pushes "what today asks and the tick to record it" below roughly 470px of chrome, which directly contradicts the screen order written in `knowledge/ui-guidelines.md`. Behind that sit two silent failure paths (a save that fails and a saved state that cannot be read both resolve with nothing on screen), a full view re-render that destroys keyboard focus on every single tap, a set of dead weekday checkboxes in the goal editor, and a top bar that ignores the iOS safe area on the exact device this app is built to be installed on. Below High, the app has drifted off its own spacing, radius and type rules far enough that the drift is now the norm rather than the exception.

This review was performed against source only. I could not run the app in a browser or on a device; contrast ratios were computed from the tokens in `styles.css`, and layout and overlap conclusions are derived from the CSS and markup, not measured on hardware. Where that matters, the finding says so.

## Overall Score

**66 / 100** — Usable but fragile.

Six High findings spread across the primary screen's hierarchy, keyboard accessibility, error states and mobile chrome mean a real user hits at least one of them in normal use, but nothing here is unusable and no hard constraint from `project.md` is broken; the substantial Medium tier is consistency drift from the project's own guidelines rather than breakage.

## Strengths

- **Sheet accessibility is genuinely done, not claimed.** `js/ui.js:939-1000` moves focus in on open, keeps Tab inside via a real keydown trap, returns focus to the opener on close, and guards against the opener having been re-rendered away. `openConfirm` focuses the *safe* button on a destructive prompt (`js/ui.js:1196-1198`). `alert`/`confirm`/`prompt` appear nowhere.
- **Touch targets were solved properly.** `.icon-btn`, `.goal > .tick`, `.switch input`, `.wd-chip input`, `.mood` and `.section-head .link` all reach 44px by growing the *target* and painting smaller chrome on a pseudo-element (`styles.css:176-190, 534-548, 437-447, 616-627, 592-597, 153-160`), which is exactly what the guidelines prescribe.
- **Contrast tokens were derived, not guessed.** `--faint: #868db4` computes to ~5.0:1 on `--surface-2` in dark mode and ~4.6:1 in light — the comment at `styles.css:11-13` states the correct measurement surface and the numbers hold up.
- **Cancel genuinely means nothing happened.** `goal-delete` and `read-clear` both pass an `onCancel` that reopens the sheet they interrupted (`js/app.js:244, 305`), and `closeSheet` drops armed callbacks so a dismissed confirmation cannot fire against a later sheet (`js/ui.js:966-967`).
- **The import failure path is a model error state** (`js/app.js:602-606`): it names the problem, reassures that existing data is untouched, and tells the user exactly where to get a valid file.
- **Copy respects the user.** "Skipped — this one breaks the chain", the reminders disclaimer at `js/ui.js:887-891`, and the difficulty explanation at `js/ui.js:827-831` explain mechanics honestly without moralising, which is what "never make a missed day feel like a verdict" asks for.

## Findings

---

**UI-01 — Today leads with the streak and XP; what the day asks is below the fold**

- **Severity:** High
- **Location:** `js/ui.js:291-331` (`renderToday`), rendered order: banners → daypager → `.hero` → weekly card → "Today's goals"
- **Evidence:** `knowledge/ui-guidelines.md` states: "On Today that order is: what today asks, then the tick to record it, then progress toward the next step. A streak is context, never the headline." The rendered order is the opposite. The `.hero` (`js/ui.js:300-317`) contains a 96px progress ring, a headline, and three stats whose **first and most prominent** is `<b class="fire">🔥 ${streak}</b> <span>day streak</span>`, followed by rank, total XP and an XP bar — then a second full card for the weekly strip (`js/ui.js:319-323`) — and only then `<h2>Today's goals</h2>` at line 325. Measuring the CSS: topbar ~62px (`styles.css:89`), daypager ~50px, hero ≈ 96px ring + 16px padding ×2 + 14px xpbar block ≈ 230px, weekly card ≈ 130px. On a 667px viewport the first goal row begins around y≈470; on a 568px device it is entirely below the fold.
- **Impact:** The user opens this at 6am to answer one question — what do I do and where do I tap — and is shown a scoreboard first. The primary action of the primary screen requires a scroll. It also inverts the product's own stated psychology: the streak becomes the headline, which is precisely the framing that makes a missed day feel like a verdict.
- **Recommendation:** Do not redesign the hero — reorder. Move `goalsBlock(k)` and `readCard` directly under the daypager, and demote the hero to a compact strip (headline + ring, or headline + XP bar) placed after the goals; keep the weekly strip card where the hero is now. The streak and rank are already permanently visible in the top bar chips (`index.html:28-33`), so nothing is lost by removing them from the hero's stat row.
- **Effort:** M

---

**UI-02 — Every state change destroys keyboard focus**

- **Severity:** High
- **Location:** `js/ui.js:1516-1529` (`render`), `js/app.js:706-715` (`S.subscribe`)
- **Evidence:** `render()` does `el.innerHTML = fn()` on the whole `#view` and every mutation routes through `commit()` → `emit()` → `render()` (`js/store.js:250-256`). Scroll position is explicitly preserved (`js/ui.js:1520-1523`); focus is not. Completing a goal, toggling an exercise or a habit, adding an extra, or removing a bonus item therefore replaces the focused button with a new node and drops focus to `<body>`. The pattern is clearly known to the codebase — `pickerQ` gets a manual refocus with cursor restoration (`js/app.js:630-638`) and `setJournal` deliberately skips the emit for the same reason (`js/store.js:571-573`) — but nothing equivalent exists for the main view.
- **Impact:** A keyboard or switch user must Tab from the top of the document again after every single tick. Today can carry 40+ controls, so completing five goals is roughly 100 wasted Tab presses. Screen-reader users additionally lose their reading position with no announcement of what changed.
- **Recommendation:** In `render()`, capture a stable identifier for `document.activeElement` before the swap (e.g. `data-act` + `data-id` + `data-date`) and, after `innerHTML` is assigned, re-focus the matching element if one exists. Guard the whole block for the stub DOM (`document.activeElement` does not exist in `tools/render.js`), consistent with the existing guards at `js/ui.js:970`.
- **Effort:** M

---

**UI-03 — A failed save has no user-visible state**

- **Severity:** High
- **Location:** `js/store.js:230-239`
- **Evidence:** `save()` wraps `localStorage.setItem` in a try/catch whose entire failure handling is `console.error('Arise: save failed (storage full?).', err)`. Nothing reaches the UI — no toast, no banner, no disabled state. Every tick, log, summary and setting change flows through this function.
- **Impact:** On any storage failure — quota exhausted, or iOS Safari private browsing, where `setItem` throws on the first write — the user logs a full day, sees every tick turn green, earns XP and toasts, and loses all of it on reload with no indication anything was wrong. `knowledge/project.md` calls stored data sacred and names Export as "the only recovery there is"; the user is never told they need it. Against the States review area ("Is there an error state, and does it tell the user what to do next?") this is a missing state, not merely weak handling.
- **Recommendation:** In the catch, set a module flag and surface a persistent banner on Today (reuse the existing `.banner.warn` pattern at `js/ui.js:181-186`) reading that changes are not being saved on this device, with an Export button. A transient toast is not sufficient — the condition does not go away.
- **Effort:** S

---

**UI-04 — Unreadable saved data reseeds the app silently, with no explanation**

- **Severity:** High
- **Location:** `js/store.js:107-124`
- **Evidence:** If `JSON.parse` or `migrate` throws, `load()` logs `console.warn('Arise: could not read saved data, starting fresh.')`, then runs `state = seedState(); save();`. The user sees a brand-new app: zero streak, Level 1, onboarding auto-opening 400ms later (`js/app.js:769`). No banner, no toast, no mention that data existed, and no pointer to More → Import.
- **Impact:** Indistinguishable from a first install. A user whose months of history just disappeared gets no explanation and no prompt to restore the backup that would fix it — the worst possible moment for the interface to say nothing. This is the same missing-state class as UI-03 but a different trigger and a different fix, so it is reported separately.
- **Recommendation:** Set a `meta.recoveredFromError` flag in the catch and render a persistent `.banner.warn` on Today: "Saved data could not be read and a fresh start was created" plus a **Restore from backup** button wired to the existing `import` action. Do not change the reseed behaviour itself — only surface it.
- **Effort:** S

---

**UI-05 — The goal editor always shows seven weekday checkboxes, including when the schedule is "Every day"**

- **Severity:** High
- **Location:** `js/ui.js:1378-1384`; `styles.css:615`; comment claiming otherwise at `js/ui.js:929-931`
- **Evidence:** `openGoalEditor` renders `<div class="wd-picker" id="gg_days">` unconditionally, immediately after the Schedule select. The only rule for `.wd-picker` is `display: grid` — there is no `display: none` state anywhere in `styles.css`, and no JS toggles it (verified by search: the only other references are the read in `js/app.js:122` and the render itself). The comment at `js/ui.js:930` explicitly assumes "the weekday checkboxes are display:none while a goal is scheduled daily"; that CSS does not exist. `readGoalForm` (`js/app.js:139`) discards `days` entirely when the schedule type is `daily`. The same pattern repeats at `js/ui.js:1395-1396`, where "Consecutive misses before stepping back" stays visible and editable when the `gg_reg` switch is off.
- **Impact:** Creating a goal is the most consequential flow in the app and it presents controls that look interactive, respond to taps, and do nothing. An untrained user with "Every day" selected who unchecks Sunday will reasonably believe the goal now skips Sundays. It does not. That is a wrong mental model about scheduling, which feeds directly into what the app judges them on.
- **Recommendation:** Wrap the `wd-picker` and the `gg_miss` field in a container carrying a `hidden` attribute driven by the current select/switch value at render time (the sheet already re-renders on `gg_sched` change — `js/app.js:653-662`). `hidden` also removes them from the tab order, which the existing `sheetFocusable()` filter already anticipates.
- **Effort:** XS

---

**UI-06 — The top bar ignores the iOS safe area on a home-screen install**

- **Severity:** High
- **Location:** `index.html:5, 10`; `styles.css:28, 86-92`
- **Evidence:** `index.html` sets `viewport-fit=cover` and `apple-mobile-web-app-status-bar-style="black-translucent"`, which places web content underneath the iOS status bar. `styles.css` defines only `--safe-b: env(safe-area-inset-bottom, 0px)` (line 28) — a search across all CSS, HTML and JS returns no other `safe-area` reference. `.topbar` is `position: sticky; top: 0` with `padding: 14px 16px 10px` and no top inset. `manifest.webmanifest` declares `"display": "standalone"`.
- **Impact:** On a notched or Dynamic Island iPhone installed to the home screen — the stated primary target in `knowledge/ui-guidelines.md` ("This is installed to a phone home screen") — the brand mark and both header chips render under the status bar clock and battery indicator on every launch. The streak chip is one of the two persistent status surfaces in the app and would be partially obscured or untappable. I could not verify this on a device; the conclusion follows from the meta tags and the absence of any top inset.
- **Recommendation:** Add `--safe-t: env(safe-area-inset-top, 0px)` beside `--safe-b` and change `.topbar` padding to `calc(14px + var(--safe-t)) 16px 10px`. One token, one property.
- **Effort:** XS

---

**UI-07 — Type is far below a readable floor in several places**

- **Severity:** Medium
- **Location:** `styles.css:421` (8.5px), `330` (9.5px), `655` (9px), `504` (9.5px), `635` (10px), `319` (10px), `392` (10px), `228` (10px), `610` (10.5px)
- **Evidence:** `.reward.claimed::after` renders "✓ CLAIMED" at `font-size: 8.5px`. The "TODAY" marker on the current day in the weekly plan is 9.5px (`styles.css:330`). Tab bar labels are 9.5px, dropping to 9px below 360px width (`styles.css:504, 655`). Ladder rung level numbers are 10px (`styles.css:635`), weekly-strip day letters 10px, ring caption 10px, difficulty card blurbs 10.5px.
- **Impact:** These sit well under the ~11px practical floor for body-adjacent UI text on a phone and are unreadable for anyone with even mild presbyopia — a group that overlaps heavily with "person tracking their own life at 6am". Tab labels and the "TODAY" marker are navigation and orientation cues, not decoration. `knowledge/ui-guidelines.md` opens the Typography section with "Readable."
- **Recommendation:** Set a floor of 11px for any text that carries meaning. The tab labels and the "TODAY" marker have room to grow without reflow; "✓ CLAIMED" is redundant next to the `+XP` pill and can simply be dropped or replaced with a larger check.
- **Effort:** S

---

**UI-08 — There is no type scale: roughly 24 distinct font sizes**

- **Severity:** Medium
- **Location:** `styles.css`, throughout; plus inline `style="font-size:..."` in `js/ui.js:352, 415, 417, 474, 477, 515, 525, 570, 579, 589, 592, 646, 677, 695, 715, 718, 763, 772, 827, 887, 917, 1106, 1186, 1213, 1244, 1247, 1296, 1306, 1309`
- **Evidence:** Sizes in use: 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 17, 19, 20, 21, 22, 26, 30, 32, 34px. Half-pixel steps like 11.5 vs 12 and 13.5 vs 14 appear side by side (`.next-reward p` 12.5px vs `.reward h4` 13.5px vs `.reward .days` 11px, all in one card). Roughly thirty view-level font sizes are set with inline `style` attributes in `js/ui.js` rather than classes.
- **Impact:** No two screens can be visually consistent, and there is no reliable rule for a future change, so every new element invents a size. `knowledge/ui-guidelines.md` requires "Consistent sizing." Reported separately from UI-07 because that finding is about legibility and this one is about maintainable consistency; fixing one does not fix the other.
- **Recommendation:** Define six or seven `--fs-*` tokens beside the existing `--r-*` tokens and map the existing values onto the nearest rung. This can be done token-first without touching markup, then the inline `style="font-size"` uses replaced opportunistically.
- **Effort:** M

---

**UI-09 — The layout is not on the 8px system**

- **Severity:** Medium
- **Location:** `styles.css:135, 141, 156, 164, 187, 194, 254, 287, 292, 297, 311, 336, 348, 356, 401, 411, 423, 429, 464, 465, 479, 511, 529, 570, 584, 592, 605, 615, 624, 631`
- **Evidence:** `knowledge/ui-guidelines.md`: "Use an 8px spacing system." Padding values in active use include 14px (`.card`), 13px 14px (`.banner`), 10px 12px (`.goal`), 12px (`.item`), 9px 6px (`.rung`), 11px 16px (`.btn`), 11px 12px (inputs), 13px 8px (`.mode-card`), 16px 12px (`.reward`), 22px 12px (`.empty`), 12px 14px (`.plan-day-head`), 9px 8px (`.plan-main`). Gaps: 6, 7, 9, 10, 11, 12, 14px. Margins: 3, 5, 7, 9, 18, 20px. Non-multiples outnumber multiples of 8 by a wide margin.
- **Impact:** Vertical rhythm never lines up, so cards, list rows and section heads each sit on their own grid — the reason the app reads slightly "off" without any single element looking wrong. It also means every new component requires a judgement call rather than a rule.
- **Recommendation:** Introduce `--s1: 8px` through `--s4: 32px` plus a `--s0-5: 4px`, and snap the container-level values first (`.card`, `.item`, `.goal`, `.banner`, `.hero`, section-head margins) — those alone carry most of the visible rhythm. Leave optical adjustments inside chips and pills as documented exceptions.
- **Effort:** M

---

**UI-10 — Card radii ignore the `--r` tokens**

- **Severity:** Medium
- **Location:** `styles.css:24-26` (tokens) vs `164, 187, 194, 253, 311, 336, 570, 584, 593, 615, 624, 632, 386, 376`
- **Evidence:** Three tokens exist (`--r-sm: 10px`, `--r: 16px`, `--r-lg: 22px`). Distinct radii actually rendered: 3px (`.legend b`), 3.5px (`.heat i`), 6px (`.lvl`, `:focus-visible`), 9px (`.brand-mark`, `.goal .tick::before`), 10px (`.icon-btn::before`, `.btn.tiny`, `.wd-chip span`), 11px (`.plan-main`), 12px (`.btn`, inputs, `.mood`, `.wd .dot`, `.rung`), 14px (`.item`), 16px, 22px, 999px. The two most common interactive shapes in the app — `.item` at 14px and `.goal` at 16px — sit adjacent on Today with different corners. `knowledge/ui-guidelines.md`: "Consistent border radius — use the `--r` tokens."
- **Impact:** Rows that are conceptually the same object (a thing you tick off) look like two different components stacked on one screen. Low individual impact, but it is the most visible consistency defect on the primary screen.
- **Recommendation:** Set `.item` to `var(--r)` so it matches `.goal`, and map `.btn`, inputs, `.mood`, `.wd .dot` and `.rung` onto a single value — adding a `--r-xs` token if 12px is genuinely wanted for controls. Leave `999px` pills and the heat map alone.
- **Effort:** S

---

**UI-11 — The exercise picker's sticky search bar is transparent in dark mode**

- **Severity:** Medium
- **Location:** `styles.css:3` (`--bg-2: #10132247`), `styles.css:351` (`.picker-search`)
- **Evidence:** `.picker-search` is `position: sticky; top: 0` with `background: var(--bg-2)`. In dark mode `--bg-2` is the 8-digit hex `#10132247` — alpha `0x47` ≈ 28% opacity. In light mode the same token is `#ffffff`, fully opaque (`styles.css:37`).
- **Impact:** In the default theme, scrolling the exercise picker draws the list rows through the pinned search field. On a dense list with a search box the user is typing into, this reads as a rendering glitch. The light theme, which is not the default, is correct.
- **Recommendation:** Give `.picker-search` an opaque background — the sheet sits on `var(--bg)` (`styles.css:459`), so `background: var(--bg)` is the smallest correct fix and leaves `--bg-2` untouched for whatever else expects the tint.
- **Effort:** XS

---

**UI-12 — The disabled "next day" arrow looks exactly like the enabled one**

- **Severity:** Medium
- **Location:** `js/ui.js:297`; `styles.css:347`
- **Evidence:** The daypager renders `<button class="icon-btn" data-act="date-next" ... ${offset >= 6 ? 'disabled' : ''}>›</button>`. The only disabled styling for icon buttons is scoped: `.plan-row .icon-btn:disabled { opacity: 0.3; }` (`styles.css:347`). There is no unscoped `.icon-btn:disabled` rule, so the daypager's button retains full opacity and its normal chrome. Contrast: `.btn:disabled` at `styles.css:173` does get `opacity: 0.45`.
- **Impact:** The user taps forward through the week, hits the 6-day ceiling, and the button silently stops responding while still looking pressable. There is no explanation of why, and no cue that a limit exists.
- **Recommendation:** Move the disabled rule from `.plan-row .icon-btn:disabled` to `.icon-btn:disabled` so it applies everywhere, and add `pointer-events: none` to match `.btn:disabled`.
- **Effort:** XS

---

**UI-13 — "Copy from…" overwrites a whole training day with one unconfirmed tap**

- **Severity:** Medium
- **Location:** `js/ui.js:1104-1118` (`openCopyDay`), `js/app.js:457-461`
- **Evidence:** The copy sheet body says "Replaces {day} with a copy of another day", then lists seven single-tap rows. `case 'plan-copy-from'` calls `S.copyDayPlan(...)`, closes the sheet and toasts "Day copied" — no confirmation, no undo. By comparison, **clearing** the same day *is* confirmed (`js/app.js:445-453`), as are deleting a goal, a habit, an exercise, a summary, a day's log and the whole app.
- **Impact:** Replacing a day the user has spent time configuring is destructive in exactly the same way clearing it is, and the destructive action next to it is protected while this one is not. A mistap on the wrong source day loses that configuration with no way back.
- **Recommendation:** Route `plan-copy-from` through the existing `UI.openConfirm` when the target day is non-empty, with `onCancel: () => UI.openCopyDay(day)` so cancelling returns to the picker — the same pattern already used for `goal-delete`.
- **Effort:** XS

---

**UI-14 — Past summaries and journal entries give no sign that they open**

- **Severity:** Medium
- **Location:** `styles.css:582-586`; `js/ui.js:545-551, 561-563`
- **Evidence:** Archive rows are `<details class="entry"><summary>…`, and `.entry > summary` sets `list-style: none` with `::-webkit-details-marker { display: none; }`. Nothing replaces the removed disclosure triangle — no chevron, no `+`, no affordance of any kind. The rendered row is a bold date on the left and a faint "Book · 12 min" on the right, visually identical to the read-only stat rows used elsewhere in the app.
- **Impact:** `knowledge/project.md` calls the summary archive "the most useful thing in the app". A user who does not discover that these rows expand never reads a single past summary — the archive appears to be a list of dates. The `<details>` element also flips state with no visual indication of which state it is in.
- **Recommendation:** Add a rotating chevron via `.entry > summary::after` (`content: '⌄'`, rotated by `.entry[open] > summary::after`). One rule, no markup change.
- **Effort:** XS

---

**UI-15 — Header chips announce as "0" and "Lv 1"; the active tab is not exposed to assistive tech**

- **Severity:** Medium
- **Location:** `index.html:28-34, 39-46`; `js/ui.js:1525-1528`
- **Evidence:** Both chips place their emoji in `aria-hidden` spans and their value in a `<b>`, so the accessible name computes from content — "0" and "Lv 1" — and the `title="Current streak"` / `title="Rank & level"` attributes are never used, because `title` is only a fallback when content is empty. `render()` rewrites `innerHTML` on these elements, so any name would need to survive that. For the tab bar, `render()` toggles only a CSS class: `t.classList.toggle('active', ...)`. There is no `aria-current`, and `.tab.active` is expressed as colour plus an icon scale/grayscale change (`styles.css:129-130`).
- **Impact:** A screen-reader user hears "0, button" in the header with no idea what it counts, and cannot determine which of six tabs is current — the guidelines require that every control has an accessible name and the review area asks whether the current location is always obvious. Sighted users are fine; the tab state is legible visually.
- **Recommendation:** Put `aria-label="Current streak"` / `aria-label="Rank and level"` on the two chip buttons in `index.html` (labels survive `innerHTML` rewrites of the children), and add `t.setAttribute('aria-current', ...)` alongside the existing `classList.toggle` in `render()`.
- **Effort:** XS

---

**UI-16 — Future-day rows fall below AA and block the reference material the guidelines protect**

- **Severity:** Medium
- **Location:** `styles.css:279-281, 549-550`; `js/ui.js:128-145, 221-231`
- **Evidence:** `knowledge/ui-guidelines.md`: "A future day is read-only and must look it — but its reference material, like how-to notes, stays readable." Locked rows are dimmed to `opacity: 0.5`. `.item .sub` and `.goal-main .sub` use `--muted` (#9aa1c4); at 50% opacity over `--bg` that composites to ≈ #52576D, a contrast ratio of **2.7:1** against the background — below the 4.5:1 AA threshold. The `.sub` line is where a future day states what it will ask ("by 6:30", "3 × 8–12 · Strength"). Separately, `.item.locked` correctly re-enables the how-to button (`styles.css:281`), but `.goal.locked { pointer-events: none }` (line 550) has no equivalent escape, so `goal-detail` — the sheet showing the ladder and what the next step requires — is unreachable on any future day.
- **Impact:** Paging forward to see what tomorrow asks is a natural and supported gesture (the daypager allows six days), and it is exactly then that this text needs to be readable and the goal detail needs to open. Both are degraded.
- **Recommendation:** Raise the locked opacity to ~0.65 and drop `.sub` to `--faint` (which already clears AA) rather than dimming the whole row, or dim only the tick chrome. Add `.goal.locked .goal-main { pointer-events: auto }` to mirror the treatment already applied to how-to notes.
- **Effort:** S

---

**UI-17 — Step progress and heat-map days carry their meaning only in a `title` tooltip**

- **Severity:** Medium
- **Location:** `js/ui.js:138` (`<span class="steps" title="${advanceHint(...)}">`), `js/ui.js:614` (`<i class="..." title="${k} · ${st}">`)
- **Evidence:** On Today, each goal row's advance progress is a bare 4px bar (`styles.css:560`) whose only explanation is a `title` attribute. In the 18-week heat map, each cell's date and status live solely in a `title`. `title` tooltips do not surface on touch devices, and this app is declared mobile-first with `"display": "standalone"` in the manifest.
- **Impact:** On the target device the step bar is an unlabelled coloured sliver — the user cannot learn that it means "3 more good days → 6:15", which is the single most motivating number in the product and is already computed by `advanceHint()`. In the heat map, no cell can be identified at all. The heat map's colour legend (`js/ui.js:707-712`) is good and does cover status; the date does not exist anywhere reachable.
- **Recommendation:** Render `advanceHint(g, tl)` as visible `.faint` text under the bar on Today, as it already is on Plan (`js/ui.js:391`) and Stats (`js/ui.js:695`). For the heat map, add `aria-label` to each cell so it is at least reachable non-visually, and consider a tapped-cell caption line.
- **Effort:** S

---

**UI-18 — The exercise editor shows the wrong labels for time and distance exercises**

- **Severity:** Medium
- **Location:** `js/ui.js:1090-1093`; consumed at `js/app.js:527-546`
- **Evidence:** The editor always renders a two-column grid: field `e_a` labelled **"Sets / min"** and field `e_b` labelled **"Reps"**. When "Measured in" is set to *Kilometres*, `e_a` holds a km value under a label that names neither kilometres nor distance, and the "Reps" field remains fully visible and editable while `js/app.js:529` discards it (`reps` is only read when `unit === 'reps'`). The same applies to *Minutes*: "Reps" stays on screen and is ignored. The adjacent field "Reps — upper end (optional)" also stays visible for non-rep units.
- **Impact:** The user cannot tell what number the app is asking for on a running or plank exercise, and edits a field that has no effect — the same dead-control problem as UI-05, in a different flow. Creating exercises is a core part of Plan.
- **Recommendation:** The editor already re-renders on other selects; drive `e_a`'s label from the selected unit ("Sets" / "Minutes" / "Kilometres") and hide `e_b` and `e_max` with `hidden` unless the unit is `reps`.
- **Effort:** S

---

**UI-19 — The archives silently show only the first 40 entries while the header states the true total**

- **Severity:** Medium
- **Location:** `js/ui.js:541, 558` (`.slice(0, 40)`) against the counts rendered at `js/ui.js:589, 592`
- **Evidence:** "Past summaries" and "Past journal" render `past.length` and `jDays.length` in their section headers, then map only `.slice(0, 40)`. There is no "show more" control and no note that the list is truncated.
- **Impact:** A user past 40 entries sees "Past summaries · 96" above a list that stops at 40 with nothing after it, and reasonably concludes the app has lost the rest. `knowledge/project.md` lists "Honest" as a project principle and the archive is described as the app's most valuable artefact; a header that disagrees with the list beneath it is the opposite of honest.
- **Recommendation:** Append a "Show all 96" button below the list when `past.length > 40` that re-renders without the slice, or state "showing the most recent 40" in the section head. Either is one line.
- **Effort:** XS

---

**UI-20 — The exercise library renders an empty card with no empty state**

- **Severity:** Medium
- **Location:** `js/ui.js:783-794` (`libRows`), used at `js/ui.js:879`
- **Evidence:** `libRows` is a plain `.map().join('')` with no fallback, dropped into `<div class="card">${libRows}</div>`. Every other list on More has one — habits get "No habits yet." (`js/ui.js:806`), and Plan, Today, Read, Stats and the picker all have empty states. If the user deletes their last exercise (deletion is offered per-row at `js/ui.js:791`), the Exercise library section renders as a blank bordered rectangle.
- **Impact:** `knowledge/ui-guidelines.md`: "Every screen needs its empty state as well as its populated one… Never render nothing and leave the user guessing." The `＋ New` control does sit in the section head, so the user is not stranded, but the blank card reads as a bug.
- **Recommendation:** `${libRows || '<div class="empty">No exercises yet.<br><button class="link" data-act="lib-add">Create one →</button></div>'}` — one expression, matching the existing habits pattern.
- **Effort:** XS

---

**UI-21 — Goal targets are stated in maths notation or with no verb at all**

- **Severity:** Medium
- **Location:** `js/ui.js:82-87` (`targetPhrase`), surfaced at `js/ui.js:114-123, 525-527, 1264-1266, 1304`
- **Evidence:** `targetPhrase` returns `(direction === 'down' ? '≤ ' : '') + v` for every non-time unit. A "less is better" goal therefore reads **"≤ 12"**, and an "up" goal reads **"30 min"** — a bare value with no indication that it is a floor rather than a record of what was done. The function's own docstring claims it "reads as an instruction, not a number", which holds only for the time/`down` branch ("by 6:30"). On an untouched goal row, the `.sub` line is this string alone.
- **Impact:** `knowledge/project.md` states "No training required… Every screen should be understandable without explanation." `≤` is a mathematical operator many users do not read fluently, and "30 min" beside an unchecked box is genuinely ambiguous — it could equally be the target, the elapsed time, or the logged value (which is how the *done* variant reads: "Done · logged 30 min").
- **Recommendation:** Replace the two non-time branches with words: `'at most ' + v` and `'at least ' + v`. No data model change; the function is the single source for all four call sites.
- **Effort:** XS

---

**UI-22 — Flame, warn and gold do not hold their assigned meanings**

- **Severity:** Medium
- **Location:** `styles.css:18-21, 242, 505`; `js/ui.js:667-668, 763, 138`
- **Evidence:** `knowledge/ui-guidelines.md` assigns `--flame` to streaks and `--gold` to rewards and level-ups. Three violations: (1) on Stats, current streak is `.stat.fire` and best streak is `.stat.gold` (`js/ui.js:667-668`) — the same concept in two semantic colours; (2) on Rewards, the count of claimable milestones uses `<span class="pill fire">` (`js/ui.js:763`) — flame for a reward count; (3) the *at-risk* progress bar renders as `.bar.warn`, defined as `linear-gradient(90deg, var(--warn), var(--flame))` (`styles.css:505`), while the *streak* bar is `.bar.flame` = `linear-gradient(90deg, var(--flame), var(--gold))` (`styles.css:242`) — a warning and a celebration drawn in near-identical orange, with `--flame` #ff8a3d, `--warn` #ffb020 and `--gold` #ffcc4d all within a narrow hue band.
- **Impact:** The user cannot learn the colour language, so the strongest signal in the app — "you are about to step back a level" (`js/ui.js:1311`) — is rendered in the same warm gradient as "your streak is growing". Note the at-risk state *is* also carried in text, so this is not colour-alone; it is colour-inconsistent.
- **Recommendation:** Make best streak `.stat.fire` to match current streak; change the claimable pill to `.pill.good`; and re-point `.bar.warn` at `--warn` alone (or `--warn → --bad`) so it cannot be confused with `.bar.flame`.
- **Effort:** XS

---

**UI-23 — Missed and future days are distinguished only by colour in the weekly strip**

- **Severity:** Medium
- **Location:** `js/ui.js:73-76`; `styles.css:309-319`
- **Evidence:** The strip's marker is `d.status === 'complete' ? '✓' : rest ? '·' : partial ? d.pct + '%' : ''` — so both **missed** and **future** render an empty dot, separated only by `.missed { color: var(--faint) }` versus `.future { opacity: 0.4 }`. On the Stats heat map the legend covers Complete/Partial/Rest/Missed but omits "future/no data", while `.heat i.future` and the default `--surface-2` fill are two further unexplained states (`js/ui.js:707-712`, `styles.css:374-384`).
- **Impact:** `knowledge/ui-guidelines.md`: "Never carry meaning in colour alone — pair it with a label, an icon or a shape." A user glancing at this week cannot tell a day they missed from a day that has not happened, and those two facts have opposite emotional weight.
- **Recommendation:** Give missed days a mark ("·" is taken by rest — "✕" or "–" works) and leave future days blank, or invert. Add the future/no-data swatch to the heat map legend.
- **Effort:** XS

---

**UI-24 — Design tokens are bypassed by hard-coded colours in view code**

- **Severity:** Low
- **Location:** `js/ui.js:50` (ring gradient `#7c6cff` / `#35d6ff`), `js/ui.js:1472` (confetti palette, five hexes including `#ff5fa2`); `styles.css:81-83, 96, 169, 243, 275, 360, 447, 480, 547, 627`
- **Evidence:** `knowledge/ui-guidelines.md`: "Everything comes from the tokens at the top of `styles.css` — never hard-code a hex in a view." The Today ring's SVG gradient literally hard-codes the two accent hexes inside `js/ui.js`, duplicating `--accent-grad`. The confetti palette hard-codes five, including `#ff5fa2`, which is not a token at all and also appears as the third aurora blob (`styles.css:83`). Within CSS: `#08091a` (three places), `#06301f` (two), `#0b0d17`, `#fff0a8`, `#fff`.
- **Impact:** A theme change or an accent adjustment updates the tokens and leaves the ring, the confetti and every "on-accent" foreground behind. Nothing is broken for the user today.
- **Recommendation:** Add `--on-accent: #08091a` and `--on-good: #06301f` tokens and use them in CSS; for the SVG gradient, either read the computed token values or accept the duplication with an explicit comment naming it as such.
- **Effort:** S

---

**UI-25 — Card shadows are inconsistent and partly hard-coded**

- **Severity:** Low
- **Location:** `styles.css:27` (`--shadow`), applied at `217, 460, 481`; hard-coded at `97, 169, 318, 612`
- **Evidence:** `--shadow` is used on `.hero`, `.sheet` and `.toast`. `.card`, `.stat`, `.reward`, `.banner`, `.goal` and `.item` have **no** shadow, while `.brand-mark` (`0 4px 14px`), `.btn.primary` (`0 8px 22px`), `.mode-card.on` (`0 6px 18px`) and `.wd .dot.today` (a `0 0 0 2px` ring) each define their own. `knowledge/ui-guidelines.md`: "Consistent shadows."
- **Impact:** Elevation carries no consistent meaning — `.hero` and `.card` sit at the same conceptual level but only one floats. Cosmetic only.
- **Recommendation:** Add `--shadow-sm` for the three accent glows and either give `.card`/`.stat` the same elevation as `.hero` or remove it from `.hero`. Do not touch the sheet or toast, which are correct.
- **Effort:** XS

---

**UI-26 — `theme-color` is pinned to the dark palette in both themes**

- **Severity:** Low
- **Location:** `index.html:8`; `manifest.webmanifest:10`
- **Evidence:** `<meta name="theme-color" content="#0b0d17">` with no `media="(prefers-color-scheme: light)"` counterpart, while `styles.css:35-51` fully supports a light theme with `--bg: #f4f5fb`.
- **Impact:** A light-mode user gets a near-black browser/status chrome above a near-white app. Purely cosmetic, but visible on every launch for that group.
- **Recommendation:** Add a second `theme-color` meta with `media="(prefers-color-scheme: light)"` and `content="#f4f5fb"`.
- **Effort:** XS

---

**UI-27 — Number formatting is inconsistent within a single card**

- **Severity:** Low
- **Location:** `js/ui.js:309` vs `314`; `js/ui.js:675, 677`
- **Evidence:** In the Today hero, total XP uses `prog.xp.toLocaleString()` (line 309) while the XP bar three lines below prints `${prog.into} / ${prog.need} XP` raw (line 314). The Stats level card repeats the pattern: `${prog.into}/${prog.need} XP` raw at line 675, `prog.xp.toLocaleString()` at line 677. Milestone XP values up to `+6000` (`js/data.js:254`) are printed raw throughout Rewards.
- **Impact:** At high levels the same screen shows "12,480" and "1240 / 2200" together. Readability of large figures degrades and the inconsistency looks unfinished. There is no currency in this app, and no value has an ambiguous sign.
- **Recommendation:** Route every XP figure through a single `fmtXp()` helper using `toLocaleString()`.
- **Effort:** XS

---

**UI-28 — Empty states that state a problem without offering the control that fixes it**

- **Severity:** Low
- **Location:** `js/ui.js:262` (habits), `js/ui.js:566` (journal archive), `js/ui.js:420` and `701` ("No goals yet.")
- **Evidence:** `knowledge/ui-guidelines.md`: "An empty state says what to do next and offers the control that does it." The habits empty state reads "No habits yet — add them in **More**." and contains no button, unlike the goals and workout empty states on the same screen, which both offer a `.link` (`js/ui.js:151-152, 234-235`). "No goals yet." on Plan and Stats offers nothing.
- **Impact:** Minor extra navigation. The habits case is the weakest, since it names a destination in bold as if it were a link but is plain text.
- **Recommendation:** Replace the bold "More" with `<button class="link" data-nav="more">Add one →</button>`; give "No goals yet." on Stats a `data-nav="plan"` link. The Plan instance already has `＋ New goal` in its section head and can be left alone.
- **Effort:** XS

---

**UI-29 — The plan editor's sheet title double-escapes exercise names**

- **Severity:** Low
- **Location:** `js/ui.js:1062` against `js/ui.js:947`
- **Evidence:** `openPlanEditor` calls `openSheet(esc(ex.name), …)`, and `openSheet` assigns the title with `$('#sheetTitle').textContent = title`. Because `textContent` does no HTML parsing, the escape is applied and never undone. Every other call site passes the raw name (`js/ui.js:1151, 1263, 1295`), which is correct.
- **Impact:** An exercise named "Farmer's walk" opens a sheet titled `Farmer&#39;s walk`. Cosmetic and limited to names containing `& < > " '`, but it looks like a broken app.
- **Recommendation:** Drop the `esc()` at line 1062.
- **Effort:** XS

---

**UI-30 — The Stats module is called three different things**

- **Severity:** Low
- **Location:** `index.html:43` (tab label "Stats"), `js/ui.js:665` (heading "Your progress"), route id `progress` (`js/ui.js:1512`), `manifest.webmanifest:17-22` (omits it from shortcuts)
- **Evidence:** The tab reads "Stats", the screen it opens is headed "Your progress", the URL fragment is `#/progress`, and `knowledge/project.md` names the module "Stats". The streak chip navigates here via `data-nav="progress"`.
- **Impact:** Minor orientation friction — the user taps "Stats" and lands on a screen that does not say "Stats" anywhere. Nothing fails.
- **Recommendation:** Change the `<h2>` at `js/ui.js:665` to "Stats". Leave the route id alone; changing it would break existing bookmarks and the hash router for no user benefit.
- **Effort:** XS

---

**UI-31 — The daypager can walk back indefinitely into days that never existed**

- **Severity:** Low
- **Location:** `js/ui.js:294` and `js/app.js:397-400`; contrast with the floor used at `js/ui.js:608` (`S.historyStart()`)
- **Evidence:** `date-next` is bounded at `offset >= 6` (`js/ui.js:297`) but `date-prev` has no lower bound and `S.setViewDate(A.addDays(date, -1))` is unconditional. The Stats heat map correctly clamps to `S.historyStart()`; Today does not.
- **Impact:** A user can page back past their install date into arbitrarily old dates, each rendering as a fully-formed "missed" day complete with a "Use a streak freeze on this day" button (`js/ui.js:357-363`). It suggests a history the user never had. Low frequency, low consequence.
- **Recommendation:** Disable `date-prev` when `A.daysBetween(S.historyStart(), viewDate) <= 0`, mirroring the existing forward bound. Depends on UI-12 for the disabled styling to be visible.
- **Effort:** XS

---

**UI-32 — Pressing Enter on a locked row is a silent no-op**

- **Severity:** Low
- **Location:** `styles.css:280, 550`; `js/store.js:394, 405, 856, 865`
- **Evidence:** `pointer-events: none` blocks mouse and touch on locked rows but does not remove the buttons from the tab order or prevent keyboard activation, so a keyboard user can focus a future day's tick — whose `aria-label` still reads "Complete Wake up" (`js/ui.js:130`) — and press Enter. The store correctly refuses (`if (isFuture(dateKey)) return false;` in all four mutators), so no data is affected, but nothing is rendered and no message appears.
- **Impact:** A keyboard user gets an actionable-looking, focusable control that does nothing and says nothing. Correct behaviour, wrong feedback. The invariant itself holds.
- **Recommendation:** Add the `disabled` attribute to the tick, the `item-main` button and the action button when `locked` is true in `goalRow` and the workout row builder. `disabled` removes them from the tab order and lets the browser communicate the state, and the existing `.item.locked .icon-btn` escape hatch for how-to notes stays untouched.
- **Effort:** XS

---

## Areas Reviewed Clean

- **Navigation reachability.** All six modules named in `knowledge/project.md` are present as persistent tab-bar destinations with text labels, the route survives reload via the hash router (`js/ui.js:1535`, `js/app.js:725-727`), and every sheet has a header close button plus Escape and backdrop dismissal (`js/app.js:686, 699-702`). The only navigation defect is the assistive-tech gap recorded in UI-15.
- **Cancel and back inside flows.** Every sheet is dismissible three ways, cancelling a confirmation restores the sheet it interrupted where one existed, and destructive confirmations focus the safe button. This area is better than most production apps.
- **Destructive confirmation coverage.** Nine of ten destructive actions are confirmed with body copy that states the consequence; the exception is UI-13.
- **Horizontal scrolling.** No screen scrolls horizontally. The three horizontal scrollers (`.cat-tabs`, `.rungs`, `.heat`) are deliberate, contained, and sized to fit a 360px viewport — the 18-week heat map computes to 288px inside a ~300px content box. `body { overflow-x: hidden }` (`styles.css:66`) is a belt-and-braces measure rather than a mask for a real overflow.
- **Reduced motion.** `@media (prefers-reduced-motion: reduce)` neutralises all animation (`styles.css:491-493`) and confetti checks the same query in JS before firing (`js/ui.js:1464`).
- **Text escaping in the UI layer.** Every user-controlled string reaching `innerHTML` goes through `esc()`, including toasts built in `js/app.js` via the exported `UI.esc`.
- **Focus indicator.** `:focus-visible` is styled globally at `styles.css:73` and is not removed anywhere.

## Areas Not Assessed

- **Loading states.** There is effectively nothing to assess: all state is synchronous `localStorage`, and the only asynchronous user actions are Export (`Blob` download) and Import (`FileReader`), both sub-perceptual for a file of this size. No loading state is missing because no wait exists. The genuine gap in this area is the *error* half, recorded as UI-03 and UI-04.
- **Rendered visual fidelity.** I could not launch a browser or a device. Contrast figures in UI-16 are computed from token values via the WCAG relative-luminance formula; the notch overlap in UI-06 and the above-the-fold measurements in UI-01 are derived from CSS box values and the declared meta tags. All are stated with their inputs so they can be checked in five minutes on hardware.
- **Currency formatting.** Not applicable — Arise handles no monetary values. Numeric formatting is covered by UI-27, and no value in the app has an ambiguous sign.

## Quick Wins

- **UI-05** (XS, High) — one `hidden` attribute stops the goal editor from lying about scheduling; highest impact-per-minute finding in the report.
- **UI-06** (XS, High) — one token and one padding change fixes the header on every notched iPhone install.
- **UI-11** (XS, Medium) — swapping `var(--bg-2)` for `var(--bg)` on one selector removes a glitch-looking transparency in the default theme.
- **UI-12** (XS, Medium) — unscoping one existing `:disabled` rule makes every disabled icon button look disabled app-wide.
- **UI-13** (XS, Medium) — routing one action through the confirm sheet that already exists closes the last unprotected destructive path.
- **UI-14** (XS, Medium) — one `::after` chevron makes the summary archive, the app's most valuable content, look openable.
- **UI-15** (XS, Medium) — two `aria-label`s and one `aria-current` call.
- **UI-19** (XS, Medium) — one conditional stops the archive headers from contradicting their own lists.
- **UI-20** (XS, Medium) — one `||` fallback removes a blank card.
- **UI-21** (XS, Medium) — replacing `≤` with "at most" in one function fixes the phrasing at all four call sites.
- **UI-22** (XS, Medium) — three class swaps restore the semantic colour contract.
- **UI-23** (XS, Medium) — one character makes missed days distinguishable from future days without colour.
- **UI-03** and **UI-04** (S, High) — both reuse the existing `.banner.warn` component and the existing import action; no new UI is needed for either.
- **UI-10**, **UI-16**, **UI-17**, **UI-18** (S, Medium) — each is confined to a handful of rules or one render function.

## Estimated UX Impact

Fixing the six High findings changes the app's first impression and its floor. Today stops opening on a scoreboard and opens on the day's asks with the tick beside them, which is what the product's own guidelines specify and what a 6am user needs (UI-01). Keyboard and switch users can complete a day without re-tabbing from the top after every action (UI-02). Creating a goal stops presenting controls that do nothing, so the user's model of when a goal counts matches the app's (UI-05). On the primary device, the header stops hiding under the status bar (UI-06). And the two silent failure paths gain a voice: a user whose storage fails learns it while they can still export, and a user whose data could not be read is told so and offered the restore that recovers it — closing the gap between "backup is the only recovery there is" and the app never mentioning it (UI-03, UI-04).

The Medium tier is where the app stops feeling half-finished. The archive becomes visibly openable and stops under-reporting itself, disabled controls look disabled, the last unconfirmed destructive action is protected, targets are stated in words rather than maths symbols, the colour language means one thing consistently, and the type, spacing and radius rules the project wrote for itself are actually the rules the app follows. None of that is visible as a feature; all of it is visible as competence.

**Files reviewed:** `D:\3_Claude\Apps\arise\index.html`, `D:\3_Claude\Apps\arise\styles.css`, `D:\3_Claude\Apps\arise\sw.js`, `D:\3_Claude\Apps\arise\manifest.webmanifest`, `D:\3_Claude\Apps\arise\js\data.js`, `D:\3_Claude\Apps\arise\js\store.js`, `D:\3_Claude\Apps\arise\js\ui.js`, `D:\3_Claude\Apps\arise\js\app.js`
**Measured against:** `D:\3_Claude\Apps\arise\knowledge\ui-guidelines.md`, `D:\3_Claude\Apps\arise\knowledge\project.md`, `D:\3_Claude\Apps\arise\knowledge\review-conventions.md`, `D:\3_Claude\Apps\arise\CLAUDE.md`
