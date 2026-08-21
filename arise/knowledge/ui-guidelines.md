# UI Guidelines — Discipline

## Design Philosophy

Simple.

Clean.

Focused.

The user opens this at 6am or last thing at night. It must be obvious what today
asks of them and one tap to record it.

Never make a missed day feel like a verdict. The app walks down to meet the user;
the interface should read the same way.

---

## Colors

Dark by default, light-aware via `prefers-color-scheme`. **One theme, in two
blocks** — the ground, the cards, the strokes, the type colours and every
meaning hue are identical on all five screens. The one thing that varies by
screen is the header band, and that is the deviation described below.

> This sentence used to read "maintain consistent themes", and read strictly,
> five header hues is five themes and the Plumage direction fails. The argument
> that it does not is the paragraph above: a single slab moves and nothing else.
> But it *is* a deviation from the sentence as it was written, and amending the
> sentence is more honest than claiming it still holds.

Avoid excessive colors. Everything comes from the tokens at the top of
`styles.css` — never hard-code a hex in a view.

High contrast.

Neither an icon nor a colour may carry two meanings. The flame is the streak; it
is not also Hard mode. That rule cost three sites and one whole glyph set.

### Two colour systems, kept apart

The palette is **Plumage** (2026-08-21) — the decision record, including the four
things the direction proposed that did not land as written, is in
`colour-direction-plumage.md`. A peacock ground, an iridescent jade
accent, violet in the ramp, one magenta→saffron gradient. Its whole idea is
that on a feather, hue tells you *where on the bird you are* — it does not tell
you how the bird is doing. Without that split a colourful app either dilutes the
meaning of its accent or ends up with eleven colours and no argument.

**Location colour is free.** Five header bands, one per tab — `--band-today`
teal, `--band-plan` cyan, `--band-read` indigo, `--band-stats` violet,
`--band-more` plum. A band says which screen you are on and nothing else, so it
can be as saturated as it likes.

**Meaning colour is rationed: three hues carrying four jobs.**

- `--accent` (jade) is **the live action, and anything done**. `--good` is the
  same jade on purpose: a thing you can do now and a thing you have done are the
  two ends of one idea, and giving them separate colours was what made a screen
  of ticks read as a fairground.
- `--gold` (saffron) is **anything that pays out or is waiting on you** — an
  earned reward, a summary not yet written, a freeze you still hold.
- `--ember` (magenta) is **only a block whose subject is progress through a fixed
  length of time**, in two forms — see below.
- `--flame` is **the streak**, and it is ember's hue lifted rather than a hue of
  its own, so it is a fourth *job* inside three hues.

`--bad` stays destructive-only. **Do not add a fourth meaning hue, and do not
promote a band hue into a meaning.** The moment violet is both "Stats" and a
state, the split collapses. It is also why the active tab is jade on every
screen rather than the band's hue: nothing but the band may claim to tell you
where you are.

### Ember's two forms, still on exactly three things

- the **gradient** (`--ember-grad`) on **the run counter** — Today's header
  while a challenge is running;
- the **solid** (`--ember`) on **the pinned strip** and on **the run screen's
  own header**.

Same count as before; the rule now just names a gradient as one of the two
forms. Putting the gradient on both headers would make it a texture instead of a
statement. `--on-ember` is near-black in dark mode because white on that magenta
is 3.7:1.

### Measured

Every band was checked against every header ink, in both blocks — ten pairs.

- `--text` on a band: 8.69:1 worst (dark teal). `--muted` on a band: 5.10:1
  worst (dark plum), 5.36:1 worst in light.
- `--faint` clears AA on **no** band in either block — 3.59:1 on the dark teal,
  4.21:1 on the pale violet. So `.screenhead` and `.dayhead` step `--faint` up
  to `--muted` for their own subtree. Darkening five bands to suit one line of
  label would have been the wrong end to fix.
- `--faint` on `--surface-2`: 4.81:1 dark, 4.85:1 light — the light block was
  4.46:1 before Plumage, so that one got better.
- `--on-ember` across the dark gradient: 5.03:1 → 9.08:1. White across the light
  gradient: 6.68:1 → 8.79:1.
- The two chart marks were re-run through the six-check dataviz validator in
  both modes and pass. **They are not `--accent` and `--gold`** — see the note
  in `styles.css`, which records the two steps the direction proposed that
  failed and why.

Never carry meaning in colour alone — pair it with a label, an icon or a shape.

---

## Typography

Readable.

Clear hierarchy.

Consistent sizing. Every piece of **text** takes a rung on the scale — never a
literal `px`:

`--fs-xs` 11 · `--fs-sm` 12 · `--fs-md` 13 · `--fs-base` 14 · `--fs-lg` 15 ·
`--fs-xl` 17 · `--fs-2xl` 20 · `--fs-3xl` 26 · `--fs-4xl` 38 · `--fs-5xl` 54

The last two are display rungs, for the day counter and nothing else. They exist
because the scale used to stop at 26 while the largest numeral on screen was 54,
so the two biggest things in the app had nowhere to sit and became literals. A
scale that cannot express the largest thing on the screen invites the next one.

`--fs-xs` is the floor for anything carrying meaning, including navigation
labels.

**Every icon that sits beside a label is sized in `em`**, so it grows with that
label when the reader raises their system text size — the likeliest
accessibility setting on a phone. Exactly seven rules may use pixels, and they
are all fixed boxes a graphic sits inside rather than icons tracking type:
`.gcard-plate`, `.linkrow-plate`, `.screenhead-plate`, `.lvlrow-plate`,
`.promptrow-plate`, `.dest-plate`, and the medal. Anything else in pixels is a
finding. There were eleven once, and a 12px flame beside 15px text is a smudge.

The four glyph BOXES — `.empty .big`, `.item .emoji`, `.plan-main .emoji`,
`.myreward-icon` — are literal for the same reason and say so in a comment.
Putting a graphic on a text scale is a category error; letting text off the scale
is drift.

---

## Icons

Chrome icons are **drawn, not typed**. An emoji is a picture of someone else's
idea of the thing, painted in the platform's own colours at its own weight; a row
of them is what made this app read as a toy.

Every icon comes from the table in `js/ui.js` via `UI.icon(name)`: a 24×24 grid,
2px stroke, round caps, `fill: none`, and `stroke: currentColor` — so an icon is
always exactly the colour of the text beside it and inherits every theme change
for free. Sized in `em` so it tracks its label. Inline SVG, never a file: the app
ships no image assets and makes no network calls.

Define an icon once. The tab bar names its icon with `data-icon` and `ui.js`
paints it in; the same shape inlined in both `index.html` and `js/ui.js` is two
copies that will drift.

**Proof a new icon at the size it is actually used**, not at 48px. A flame is a
water droplet unless it leans and its base is wider than its point; a dumbbell at
13px is a horizontal line with two ticks. If it does not read at 13px, redraw it
or choose a different metaphor.

Icons are decorative: each sits beside its own label and is `aria-hidden`. An
icon that stands alone — the info button on a plan row — needs an `aria-label` on
the *control*, never on the glyph.

### A glyph the user chose beats one a seed gave them

**Neither editor offers an icon field any more**, so this rule now applies to one
thing: an exercise that was given a glyph before the field was removed.

`exGlyph` in `js/ui.js` decides, and returns ready-to-insert HTML — user text is
escaped *inside* it, so call sites must not escape a second time. Which of the
two it is, is **derived** by comparing against `STOCK_EX_ICON` and the seed the
item came from, never stored. No flag, no migration, nothing overwritten.

`goalGlyph` and `sectionGlyph` used to sit beside it and had no callers anywhere
in the tree — Today and Plan both went straight to `icon(SECTION_ICON[…])`, so
the goal editor's Icon field wrote a value that rendered on no screen. Both
resolvers and both fields are gone. The stored `icon` keys stay on goals,
exercises, habits and rewards: they cost nothing, and removing a stored field is
the one thing the migration rules forbid.

A native `<option>` cannot hold an SVG, and `openSheet` puts its title through
`textContent`. Those two places take the plain name — which argues for no glyph
at all, not for an emoji, and that is what they do.

**There is no emoji left in the app, and the three carve-outs that used to be
here are gone.** The rule held on one screen and not the next for a long time,
which read as unfinished rather than as a deliberate mix. Each carve-out failed
for its own reason:

- *Mood faces.* The emoji was doing SEMANTIC work, which makes it the least
  defensible rather than the most. Two of the five are not reliably
  distinguishable at the rendered size, and which picture appears is the
  platform's decision — the same stored index drew a different face on iOS,
  Android and Windows. The archive printed the face **alone**, so a picture the
  reader could not identify was the only carrier of the value. It is five
  labelled pills now; the stored value is still an index.
- *Difficulty glyphs.* A seedling, a balance scale and a fire are three unrelated
  metaphors for one ordinal scale, and the fire already means "streak" everywhere
  else in the app. One glyph, two meanings. The card already carries a bold name,
  a blurb and a live step preview, so the glyph is simply gone.
- *Milestone medals.* Eleven different emoji is eleven decisions, and the locked
  state depended on `filter: grayscale(1)` treating a colour emoji identically on
  every platform, which it does not. One drawn trophy now, whose locked state is
  a `currentColor` change; the name and the day count carry identity.

The one sentinel that must stay is `STOCK_EX_ICON` in `js/ui.js`: `exGlyph`
compares a stored exercise icon against it to tell "the user chose this" from
"a seed handed them this". It is a value to compare against, never rendered.

`tools/render.js` asserts no route and no editor sheet renders a pictograph. The
tick, the cross, the arrows and the chevrons are carved out of that check on
purpose — they take `currentColor`, inherit the text weight, and read as
typography rather than as pictures.

This covers inline `style="font-size:…"` in `js/ui.js` as well as `styles.css`.
The view layer was exempt for one round and it immediately drifted; there is no
version of "the scale, except over there" that survives contact with a deadline.

An off-scale size in new code is a finding.

`--text` for content, `--muted` for supporting detail, `--faint` for the quietest
labels. All three must clear WCAG AA against the surface they sit on — measured
against `--surface-2`, the lightest card a label ever lands on, not against `--bg`,
which flatters the ratio.

---

## Spacing

Use an 8px spacing system, with a 4px half-step where a container genuinely
needs it:

`--sp-xs` 4 · `--sp-sm` 8 · `--sp-md` 12 · `--sp-lg` 16 · `--sp-xl` 24

Container-level values — card, row, banner and section padding and margins — must
come from these. That is what carries the visible rhythm. Optical nudges inside a
chip or a pill may stay literal, and should say why: an unexplained literal is
indistinguishable from a mistake.

**Never in the view layer.** A literal padding or font-size in a `style=` attribute
in `js/ui.js` is a finding even when the number is on the scale — that is how the
last drift started. Give it a class.

Avoid cramped layouts.

---

## Cards

Consistent padding, from the `--sp` tokens.

Consistent border radius — use the `--r` tokens. `--r` is the standard row and
card, `--r-xs` is every control (buttons, inputs, small chrome), `--r-sm` and
`--r-lg` are the tighter and looser variants. Pills stay `999px`.

One shadow token: `--shadow`, for a raised surface. Nothing else defines its own.

There was a second, `--shadow-sm`, described here as "the accent glows" — the
flat-card redesign removed the glow and left the token behind resolving to
`none` in both themes, with one call site that drew nothing. Someone told there
are two shadow tokens reaches for the dead one and concludes shadows are broken.
The redesign's decision was that the accent does not glow; both files say so now.

Text on a filled background uses `--on-accent`, `--on-good`, `--on-gold`,
`--on-ember` or `--on-cream`, never a hex — a repainted accent must not strand
black text on it. Every fixed surface owes one of these.

---

## Screens

Most important information first.

On Today that order is: what today asks, then the tick to record it, then progress
toward the next step. A streak is context, never the headline.

**Every screen carries its own header** — a coloured band with a 26px-radius
base, the screen's name in it, and one line under that saying what the screen is
for. There is no persistent top bar; a brand bar above a screen header is two
headers, and the app's name belongs on the install icon rather than on every
screen. A section inside a screen is announced by an 11px letterspaced `.label`,
not by a card.

**The band is the screen's own hue, and it means location and nothing else.**
Today teal, Plan cyan, Read indigo, Stats violet, More plum — the ramp is in the
token block. Rewards and the run screen have no tab of their own and light
More's, so they take More's band. It replaced five identical charcoal slabs,
which gave no sense of place when you paged between screens at speed.

Two rules hang off it and neither is optional:

- **No meaning hue may be used as a band, and no band hue may be promoted into a
  meaning.** The day the band and the accent share a hue is the day neither means
  anything.
- **Nothing card-coloured sits on a band.** `--surface` and `--surface-2` are
  card colours; a teal chip dropped on the plum band reads as a foreign object.
  A chip inside a header — the day stepper, the segmented tray, the round plate,
  a quiet pill — is transparent with a hairline of `currentColor`, so it insets
  into whichever band it lands on and no band owes a chip colour of its own.

Five tabs: Today, Plan, Read, Stats, More. Rewards is reached from the top of
More — it is the one screen you open after the fact rather than to do something,
and the four daily screens are worth more thumb than it is. A route without a tab
still lights the tab it lives under, or the bar goes blank and the user loses
track of where they are.

Reduce visual clutter.

---

## Mobile

Design mobile-first. This is installed to a phone home screen.

**Minimum touch target 44x44 px.** This includes the goal tick, icon buttons, list
rows, toggles and header chips.

Where a control must stay visually small, grow the *target* rather than the
graphic: give the button the full 44px and paint the smaller chrome on an inner
pseudo-element. Never grow a hit area so far that it overlaps its neighbour — two
overlapping targets are worse than one small one.

No horizontal scrolling — with exactly one written exception, because a rule with
two silent violations is weaker than a rule with one stated one.

**Data plots may scroll sideways; controls may not.** `.heat` (eighteen weeks)
and `.rungs` (the full ladder) have no honest form at 360px, and clipping either
would hide the data the screen exists to show. Both carry an edge fade so the
overflow is visible rather than silent. Everything else wraps: the category
filter used to scroll with its scrollbar hidden in both engines, which made its
off-screen entries undiscoverable on the screen you reach while adding an
exercise. `body` stays `overflow-x: hidden` regardless.

Respect `env(safe-area-inset-bottom)` for anything fixed to the bottom.

**The day's work belongs in the bottom third.** A phone is held in one hand, and
the top corners of a 6-inch screen are the hardest pixels on it to reach. The
primary action of a screen goes near the tab bar, not under the clock — which is
why Today ends in a fixed strip carrying the next thing by name and one tap to
keep it. Anything fixed there must clear the tab bar *and* be cleared in turn by
the toasts, or a message lands behind the thing that raised it.

**A gesture is an accelerator, never the only route.** Swipe right to keep a goal,
left to skip, press and hold to log part of it — all three end in the same
functions a tap goes through, and every one of them is still reachable by tapping
a visible control. A gesture nobody is told about is a gesture nobody has, so
Today carries one line saying what they are.

**Give a destructive or lossy action an undo where it happened.** A completion
toast carries UNDO for five seconds rather than making the user find the sheet
that could reverse it. `.toasts` is `pointer-events: none` so a toast can never
eat a tap — a toast that carries an action has to opt its own taps back in.

---

## Accessibility

WCAG AA contrast.

Keyboard friendly.

Visible focus indicators — `:focus-visible` is styled globally; do not remove it.

Every control has an accessible name. An icon or an emoji is not a name; give it
`aria-label`.

Decorative icons get `aria-hidden="true"`.

A sheet is a modal dialog and must behave like one: focus moves into it on open,
Tab stays inside it, focus returns to whatever opened it on close.

Announce transient messages politely — toasts live in an `aria-live` region.

---

## Sheets and Dialogs

Never use `alert()`, `confirm()` or `prompt()`. They ignore the theme and bypass
the app's own validated inputs. Use the confirm and text-prompt sheets.

Anything asking for a value uses the field that matches its unit — a clock for
times, a number for counts.

Cancel means nothing happened. If a confirmation interrupted another sheet,
cancelling returns to it.

On a destructive confirmation, focus the safe button.

---

## States

Every screen needs its empty state as well as its populated one.

An empty state says what to do next and offers the control that does it.

A future day is read-only and must look it — but its reference material, like
how-to notes, stays readable.

Never render nothing and leave the user guessing.
