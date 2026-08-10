# UI Guidelines — Arise

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

Maintain consistent themes. Dark by default, light-aware via
`prefers-color-scheme`.

Avoid excessive colors. Everything comes from the tokens at the top of
`styles.css` — never hard-code a hex in a view.

High contrast.

Semantic colours have fixed jobs: `--good` for done, `--bad` for destructive,
`--flame` for streaks, `--gold` for rewards and level-ups. Do not add a fifth
without a reason.

Never carry meaning in colour alone — pair it with a label, an icon or a shape.

---

## Typography

Readable.

Clear hierarchy.

Consistent sizing. Every piece of **text** takes a rung on the scale — never a
literal `px`:

`--fs-xs` 11 · `--fs-sm` 12 · `--fs-md` 13 · `--fs-base` 14 · `--fs-lg` 15 ·
`--fs-xl` 17 · `--fs-2xl` 20 · `--fs-3xl` 26

`--fs-xs` is the floor for anything carrying meaning, including navigation
labels. Emoji, medals and icon glyphs are sized literally on purpose — they are
iconography, and putting glyphs on a text scale is a category error.

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
chip or a pill may stay literal, and should say why.

Avoid cramped layouts.

---

## Cards

Consistent padding, from the `--sp` tokens.

Consistent border radius — use the `--r` tokens. `--r` is the standard row and
card, `--r-xs` is every control (buttons, inputs, small chrome), `--r-sm` and
`--r-lg` are the tighter and looser variants. Pills stay `999px`.

Consistent shadows: `--shadow` for a raised surface, `--shadow-sm` for the accent
glows. Nothing else defines its own.

Text on a filled background uses `--on-accent` or `--on-good`, never a hex — a
repainted accent must not strand black text on it.

---

## Screens

Most important information first.

On Today that order is: what today asks, then the tick to record it, then progress
toward the next step. A streak is context, never the headline.

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

No horizontal scrolling.

Respect `env(safe-area-inset-bottom)` for anything fixed to the bottom.

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
