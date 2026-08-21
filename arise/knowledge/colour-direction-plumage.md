# Colour Direction — Plumage

**Date:** 2026-08-21
**Status:** adopted and shipped. This file is the decision record; the rules it
established live in `ui-guidelines.md` and the values live in the token blocks at
the top of `../styles.css`.

**Brief:** "richer and more colourful", not a specific bird. Dark and light both.
4–5 colours may carry meaning. Colour to land on screen headers, cards and
surfaces, charts and the heat map, rewards and milestones, and one iridescent
gradient.

**Anchors:** peacock ground, iridescent jade accent, violet in the ramp,
magenta→saffron gradient. No feather photograph was supplied, so the palette is
designed rather than sampled.

---

## The idea

On a feather, hue tells you *where on the bird you are*. It does not tell you how
the bird is doing.

That is the split the palette uses, and it is what lets the app be colourful
without losing its argument:

- **Grounds and header bands carry hue freely** — hue there means location.
- **Only three hues carry meaning**, and they never appear as a band.

Without the split, a colourful app either dilutes the meaning of its accent or
ends up with eleven colours and no argument.

The full statement of both systems, the hard rule between them and the measured
contrast table is in `ui-guidelines.md` → Colors. It is not repeated here; two
copies of a rule is one copy that will drift.

---

## Where the colour landed

- **The five header bands** tint each screen's header and nothing else. Resolved
  from `#view[data-route]`, which `js/ui.js` already wrote for scroll
  restoration, so the view layer gained nothing.
- **The iridescent gradient** is on one element: the run counter — Today's header
  while a challenge is running. It is literally "progress through a fixed length
  of time", so the gradient *is* ember rather than decoration next to it. The
  solid magenta stays on the pinned strip and the run screen's own header.
- **The two ramps differ on purpose.** Dark runs magenta→saffron. Light runs
  magenta→violet→indigo, because in light mode both ends must stay dark enough to
  carry white text and a dark magenta ramping to a dark saffron passes through
  brown. The cool ramp stays iridescent and echoes the band ramp.
- **`--cream`** is the one panel per screen the guidelines allow, and it still
  inverts between blocks.

---

## Four things the direction proposed that did not land as written

Each was measured rather than argued, and each is documented where it was
decided rather than only here.

1. **`--faint` on a band.** The document expected the pale light bands to be the
   risky half. They were not the only ones: `--faint` clears AA on **no** band in
   **either** block — 3.59:1 on the dark teal, 4.21:1 on the pale violet. The
   headers step `--faint` up to `--muted` for their own subtree, which is AA on
   all ten pairs. Darkening five bands to suit one line of label would have been
   the wrong end to fix.

2. **The two chart marks.** The document set the light `--chart-did` to
   `#0B7A67` — which is `--accent` exactly, i.e. the tidying-back that the token
   comment has warned against since the marks were introduced. The six-check
   validator failed it on the chroma floor (0.094 against a 0.10 floor: it reads
   as grey). The dark `--chart-ask` `#C48A1E` failed the lightness band at
   L 0.674. Both were snapped to the nearest passing step — `#027C64` and
   `#C2891A` — and both pairs now pass all six checks in both modes.

3. **The heat map.** The document proposed a three-step jade ramp. The heat map
   is not a sequential ramp; its five states are *status* colours — rest,
   partial, complete, missed, future — and a kept day already draws from
   `--good`, so it turned jade for free when `--good` did. Re-cutting it as a
   ramp would have put magnitude encoding on categorical data and cost the
   missed-day red, which is the one cell a user scans for.

4. **Card-coloured chips on a band.** Not anticipated by the document and found
   on contact: the day stepper's plate, the segmented tray in Plan's header, the
   round icon plate on Rewards and the quiet pill on Read were all `--surface` or
   `--surface-2`. Those are card colours, and a teal chip dropped on the plum
   band reads as a foreign object. Each is transparent with a `currentColor`
   hairline now, so it insets into whichever band it lands on. The rule is in
   `ui-guidelines.md` → Screens.

While fixing (4): `.dayhead.ember .dayline-nav .icon-btn { border-color: … }` had
never painted anything. `.icon-btn` is `border: 0` and the border it meant to
recolour is on `::before`. It is gone, and the band treatment covers that button
in every header including the ember one.

---

## The rule this direction amended

`ui-guidelines.md` opened with "Maintain consistent themes". Read strictly, five
header hues is five themes and this direction fails.

The argument that it does not: the ground, the cards, the strokes, the type
colours and every meaning hue are identical on all five screens — only a single
slab moves. But it *is* a deviation from the sentence as written, so the sentence
was amended rather than quietly reinterpreted. The amendment, and the note saying
what it used to be, are in the Colors section.

**The fallback, if that ever needs reversing:** one band hue for all five screens
(teal). Everything else in this document stays intact and the app loses its sense
of place. In code that is deleting the four route rules under "location colour"
in `styles.css` — nothing else.

---

## Where this leaves slate

The slate direction was the safer proposal: it changed no rule, only values.
Plumage is more colourful and cost two sentences of the guidelines. Both were
real options and they must not be merged — a peacock ground with a sky accent is
neither.
