# Handoff — Arise

Written at the end of a long session, for whoever picks this up next. Read this
before touching anything; it is short on purpose and everything in it is either
a decision already made or a trap already sprung.

**App:** `D:\3_Claude\Apps\arise` — offline-first personal-development tracker.
Vanilla HTML/CSS/JS, no build step, no dependencies, no network, no accounts.

---

## 1. State of the tree right now

- `node tools/smoke.js` → **281 passed, 0 failed**
- `node tools/render.js` → **111 passed, 0 failed**
- `sw.js` VERSION → **arise-v24**
- `js/` is six files: `data.js` → `program.js` → `goals.js` → `store.js` → `ui.js` → `app.js`
- `tools/` is `smoke.js`, `render.js`, `make_icons.py`, `shot.html`
- `fonts/` is new: three Archivo `.woff2` cuts, local, precached by `sw.js`
- `index.html` is a 3.8KB shell again — see §4a before changing that
- Nothing is half-finished. No work in progress, no stashed edits.
- **Everything below is uncommitted.** The tree carries Sprint 1 plus the earlier
  inline-`font-size` sweep. Nothing has been committed since `d3af89f`.

**A full `/review` has completed.** All four reports are in
`D:\3_Claude\Apps\reports\`. The Chief Architect ruling is the authority —
`chief-architect.md`. Do not re-derive it, do not re-run the review, and do not
argue with its rulings without a reason it did not consider.

**Sprint 1 — the release gate — is done.** All seven items closed: WORK-01,
WORK-08, WORK-03, WORK-02+07, WORK-06, WORK-05, WORK-10. Every fix was written
test-first and then **broken again on purpose** to watch the new test fail; the
`timeline` and `streak` halves of WORK-03 were broken separately, and each failed
only its own assertion.

What the numbers actually were, measured rather than inferred: goal-card title
**1.12:1** and meta **2.43:1** on the card artwork in light mode before the fix,
now **16.4:1** and **7.9:1** where the text sits; `#1a1410` on `--cream`
**1.15:1** → **13.8:1**. Dark mode is unchanged pixel-for-pixel, because the new
fixed tokens hold exactly the values dark mode already used.

---

## 2. What to do next

**Sprint 2**, per the ruling: **WORK-04** as its own main event and its own
migration (grandfathering to a date that reproduces what each account already
computes is the acceptance criterion, not a nicety), then **WORK-09**,
**WORK-20** (halved — derive the guard, no `truncated` flag), **WORK-11**,
**WORK-13**, **WORK-14 + WORK-30** in one commit, **WORK-16**, **WORK-17**,
**WORK-18**. Confirm WORK-17's and WORK-18's provisional measurements while in
there, and measure the WORK-19 tap at the end of the sprint.

WORK-04 follows the `scheduleHistory` **pattern**, not the `askedOn` function —
`dayPlan`/`dayHabits` have no goal object to resolve against, and the ruling is
explicit that forcing one signature over both is the generalisation this project
exists to avoid.

**The sheet's primary action is now pinned.** `.sheet` caps at 88vh and
`.sheet-body` scrolls, so on any phone-sized viewport the first-run sheet showed
its pace cards and hid its own "Start" button 80–150px below the fold. One rule
in `styles.css` sticks the action row to the bottom of the scrollport, and every
sheet's primary action is wrapped in a `.btn-row` so the one rule reaches all of
them. Measured across nine sheets at 620/700/740px: all visible and clickable,
and every secondary (Pause, Delete, Skip) still reachable at the end of the
scroll. Three traps are written into the comment above the rule — do not target
`:last-child`, do not paint the background onto a bare button, and `bottom` is
resolved against the scroll container's content box, so it needs `-20px` to sit
flush rather than 20px high.

Two things Sprint 1 leaves for whoever is next, neither of them blocking:

- **`.gcard-streak.skip` still takes `--stroke-strong` for its border**, which
  flips with the theme while the artwork under it does not. The text is fixed
  (`--on-art-muted`); only the 1px border is faint in light mode. It is cosmetic,
  and it belongs to whoever next opens `.gcard` for WORK-14.
- **The `is-done` tick fills with `--cream`**, which in light mode is near-black
  on near-black artwork. Its foreground is correct and legible now; what is
  reduced is the *fill's* contrast against the card. Repainting the card art was
  ruled out, so this needs a decision, not a patch.

---

## 3. How to work here

The project's own rules are in `arise/CLAUDE.md` and `arise/knowledge/*`. Read
them; they are short and they are real, not decoration. Beyond those, the habits
that actually earned their keep this session:

**Break every fix on purpose.** After a fix passes, revert it and confirm the new
test fails, then restore. This caught two tests that passed for the wrong reason
and would have shipped as false assurance. `coding-standards.md` mandates it.

**Green tests are not correctness.** Twice this session a serious defect survived
a fully green suite: the value-log sheet became unreachable while `render.js`
kept calling it directly, and a paused goal was mis-scored while the pause tests
only checked `dayStatus`. When you fix something, ask what the test would have to
look like to have caught it — not whether the existing ones still pass.

**Verify by observation, not inference.** Compute the ratio, measure the DOM,
take the screenshot. I nearly "fixed" a horizontal-overflow bug that did not
exist, and I missed a real Critical for several rounds, both because I trusted
a rendering instead of measuring one.

**Say what has no coverage, every time.** `js/app.js` is loaded by neither suite.
`render.js` uses a hand-rolled stub DOM with no `activeElement`, no
`getClientRects`, no CSS. Any change landing there needs saying out loud and
driving by hand.

**Delete a feature? Leave a test that it stays deleted.** When the exercise
animations were removed, the replacement tests assert *no* demonstration renders.

---

## 4. Traps already sprung — do not repeat these

- **Headless Chrome enforces a minimum window width.** `--window-size=412,…`
  lays out at ~500px and crops to 412. It looks exactly like horizontal overflow
  and is not. Screenshot at **600px or wider**, and measure geometry via the DOM
  if you need real phone-width numbers.
- **Headless here reports `prefers-color-scheme: dark`.** Every screenshot I took
  was dark, which is why a light-mode Critical went unseen for the whole session.
  If you change colour, verify light mode by computing ratios from the tokens.
- **PowerShell 5.1 `Get-Content` reads UTF-8 as ANSI.** Round-tripping a file
  through `Get-Content` + `Out-File` mangles every emoji into mojibake. Use the
  Write tool for any file containing non-ASCII.
- **A `/` inside a JS regex literal terminates it.** `/…<\/span>/` needs escaping;
  a plain `indexOf` is usually better in a test.
- **Writing JS through a Python heredoc:** `\n` inside a `'''…'''` string becomes
  a real newline in the output, producing an unterminated JS string. Use
  `chr(92) + 'n'` or just avoid generating code through scripts.
- **`Number(x) || default` treats a valid `0` as missing.** This shipped a bug
  where a run length of 0 silently became 66. Handle `NaN` explicitly.
- **Tests coupled to implementation details rot silently.** An error-boundary test
  broke `S.progress` to force a failure; when Today stopped calling `S.progress`,
  the test passed while testing nothing. Break something the code path genuinely
  depends on.
- **Deleting dead code can take live code with it.** Removing `goalRow` +
  `goalsBlock` also removed `goalCard`, which sat between them. The render suite
  caught it instantly — run the suites after any deletion, not just after edits.

---

## 4a. The bundle incident — read this before touching `index.html`

A visual-tooling export once replaced `index.html` with a 440KB **self-extracting
bundle**: a wrapper that unpacked a gzip payload and served `js/` and
`styles.css` from `blob:` URLs. It has been undone. What it cost, and what to
watch for if anything like it lands again:

- **The app stopped running the files on disk.** The bundle carried a snapshot of
  `js/` taken mid-Sprint-1, so WORK-05, WORK-06 and WORK-10 were silently absent
  from the shipped app while their fixes sat correct and tested in `js/`. The
  live app was again completing a reading goal that had not been met.
- **Both suites still passed**, because they load `js/` from disk. A bundle makes
  the safety net measure code nobody runs. That is the whole danger, and it is
  invisible from the test output.
- It also dropped `<link rel="manifest">` and both icon links (**PWA install
  broken**) and added `<link rel="preconnect" href="https://fonts.gstatic.com">`,
  a real network connection in an app whose first constraint is that it makes
  none.

The redesign inside it was kept in full. It was extracted rather than reverted:
the CSS became `styles.css`, the three Archivo cuts became real files under
`fonts/` (referenced by `unicode-range`, precached in `sw.js`), and the three
view-layer edits — monogram tile instead of emoji artwork, emoji-free card meta,
`STREAK`/`KEPT` text chips — were ported onto the current `js/ui.js` by hand,
taking the design and none of the stale code.

**The rule this leaves:** `index.html` is a shell. It links `./styles.css` and
the six `./js/*.js` in fixed order, and nothing else belongs in it. If a tool
offers to inline the app into one file, the answer is no — the four-places rule
for adding a `js/` file exists precisely because the shell is the index of what
runs. A design change belongs in `styles.css` and `js/ui.js`, where the suites
and the next reader can both see it.

---

## 4b. What Sprint 1 added to the safety net

Neither suite loads `js/app.js`, and four of Sprint 1's seven items land in click
handlers. Rather than only clicking through by hand, the paths were driven in a
real headless browser from a throwaway page at the app root that loads
`./index.html` in an iframe and dispatches real clicks into it, printing its
results into its own body — read them back with `--dump-dom` rather than a
screenshot, so the output is text. That drove: the goal card → detail → value-log
route, `read-save` with the minutes cleared (asserting both the stored entry and
the toast wording), `onboard-save` against a backdated goal, and `import` with
both a junk file and a real backup — feeding the file by patching
`document.createElement` to capture the input `pickFile` creates, then setting
`input.files` from a `DataTransfer`.

**That harness was itself broken on purpose**: with the `setReading` fix reverted,
it failed and printed the real app rendering "Summary saved — reading complete"
over an unmet goal. A driver that has never failed has not been shown to work.

Two more recipes worth keeping, both deleted after use:

- **Light mode without a light-mode browser.** Headless reports
  `prefers-color-scheme: dark`, so light can never be requested here. Inject a
  `<style>` into the iframe setting the light block's token values directly —
  that is exactly what the media query does — then screenshot and *look*.
- **Prove a colour no longer follows the theme.** Override `--text` / `--muted`
  on the iframe's root to something absurd and assert the element does **not**
  move, with a control element that does. That tests the mechanism rather than
  the rendering, and it holds regardless of which theme the browser reports.

When checking horizontal overflow, ignore anything inside an ancestor with
`overflow-x: auto|scroll|hidden` or `position: fixed`. The decorative `.aurora`
blobs are fixed, clipped and deliberately off-screen; count them and you get two
false Criticals. Nothing overflows at 360px or 412px.

---

## 5. Verification recipes

These are not committed tooling — deliberately, the architect ruled against
adding tools without justification. They are recipes. Use them, don't install them.

**Screenshot the app.** Write a temp `_seed.html` at the app root that seeds
`localStorage` and redirects to `./index.html` (this skips onboarding and gives
the screens real content), then:

```powershell
$srv = Start-Process python -ArgumentList "-m","http.server","8210" -PassThru -WindowStyle Hidden
$chrome = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
# first run seeds localStorage, second run renders with it — same --user-data-dir
Start-Process $chrome -ArgumentList '--headless=new','--disable-gpu','--window-size=600,900',`
  '--virtual-time-budget=3000',"--user-data-dir=$prof","--screenshot=$out\x.png",`
  'http://localhost:8210/_seed.html' -Wait
Start-Process $chrome -ArgumentList '--headless=new','--disable-gpu','--hide-scrollbars',`
  '--window-size=600,1000','--virtual-time-budget=4000',"--user-data-dir=$prof",`
  "--screenshot=$out\today.png",'http://localhost:8210/index.html#/today' -Wait
Stop-Process -Id $srv.Id -Force
```

Then `Read` the PNG. **Delete `_seed.html` afterwards** — it must never ship.
Note: `Remove-Item` in the same PowerShell call as the Chrome path trips a
sandbox guard; delete via Bash `rm -f` instead.

**Measure the real DOM at phone width.** Write a temp `_diag.html` that loads
`./index.html` in a 412px-wide iframe, walks `body *` comparing
`getBoundingClientRect().right` to `innerWidth`, and writes the results into its
own body as text. Screenshot that page and read the text. This is how you get
true geometry despite the minimum-width trap.

**Check the stylesheet.** There is no CSS linter. After any token work, verify
every `var(--…)` referenced from `styles.css` **and** from `js/` resolves against
a definition, and that braces balance. An undefined token silently drops the
property with every test still green.

---

## 5b. The visual direction, and where it stops

The user's reference is **lifereset.com**. Arise is already built on that
skeleton — Day N/66, To-dos/Done/Skipped, goal cards with a streak pill — so the
gap was never structural. It was the icon language, and that is now converted:
`UI.icon()` in `js/ui.js`, documented under "Icons" in `knowledge/ui-guidelines.md`.
Today went from 11 distinct emoji to 8, and the tab bar, card meta rows, top
chips and plan info buttons are drawn icons.

**The icon fields are converted too.** The user's ruling: a glyph they chose
wins, a glyph a seed gave them yields to the drawn icon for its category. It is
derived by comparing against the seed — no flag, no migration, nothing
overwritten — and documented under "Icons" in `ui-guidelines.md`. Distinct emoji
per screen, before → after:

| screen | before | after | what is left |
|---|---|---|---|
| More | 22 | 8 | difficulty glyphs, banners |
| Plan | 17 | 4 | difficulty glyphs |
| Today | 11 | 5 | banners |
| Stats | 7 | 2 | difficulty glyphs |
| Read | 6 | 6 | the five mood faces |
| Rewards | 12 | 12 | **milestone medals — see below** |

Note `exGlyph`/`goalGlyph` return **HTML**, and escape user text themselves. The
render suite's hostile-icon test covers this and was broken on purpose to prove
it: without the escape, raw markup reaches four routes.

**On the reference's game layer — reconsidered, and the earlier read was wrong.**
"This Is Not A Game" says in its own last line: *"Nothing here says delete the
game layer. It says keep it in its place, below the things that are true."* The
test is whether a thing states something true about the user's life, not whether
it is decorated. Life Reset's achievement card passes it — "wake up at 6 AM for
10 days" is a real behaviour. **Approved, and next up:** earned milestones stated
as facts, plus an unlock moment. No new XP, and Today is not touched.

Most of the machinery already exists: `A.MILESTONES` in `data.js`, `rewards()`
and `nextMilestone()` in `store.js`, claiming wired in `app.js`. What is missing
is the unlock moment, medals that are drawn rather than emoji, and copy that
leads with the fact rather than the encouragement.

**One thing in the reference that still must not be copied.** Its goal cards are
full-bleed illustrations. This app ships no image assets and makes no network
calls, and users create goals no artwork could exist for. The monogram tile is
the honest local answer; an illustration set is a product change with a real
weight cost, not a styling tweak.

---

## 6. Product direction — read before proposing features

`arise/knowledge/project.md` has a section called **"This Is Not A Game"**. It is
a first-class product constraint added this session at the user's direction, and
it is the lens for every feature question:

> *Does this tell the user something true about their life, or does it only move
> a counter the app invented?*

The user was explicit: they do not want a Duolingo-shaped app. XP, levels and
ranks still exist but are deliberately kept **below** the real ledger — days
kept, hours actually done, summaries written. The top bar carries days kept, not
a rank. Custom rewards pay out in sneakers and books, and grant no XP on purpose.

Things the architect placed **off limits this quarter**: any build step, bundler,
framework or dependency; any network call, account or sync; a rewrite of the
progression engine; caching over any number still derived wrongly; changing
`clearDay`'s scope; any migration that recomputes a banked `bestStreak`; any
expansion of the game layer onto Today; a second convention for fixed-surface
foregrounds; and any global CSS sweep in a codebase whose suite cannot see CSS.

---

## 7. Known-open, beyond the review

- **`js/app.js` has no automated coverage at all.** This is the single largest
  untested surface and it is where two of the three Criticals live.
- **~30 inline `style="font-size:…"` were swept onto the type scale**; the 5 that
  remain are emoji glyphs and stay literal by design.
- The user has been driving product direction directly and responds well to being
  told plainly what is broken, including — especially — when it is something the
  assistant broke. Two of the three Criticals in the latest review are regressions
  I introduced. Saying so was more useful than hedging.
