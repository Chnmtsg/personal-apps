# Integrating the contrastive guide

Three changes. One is architectural, two are content.

---

## 1. New node: known-pattern matcher (architectural)

The guide's Top 100 is not just teaching material — it's a **detection asset**.
64 of the 100 errors are lexically fixed, and 46 of those can be found and
corrected by regex *right now*, with no model call:

```
depends of      -> depends on
discuss about   -> discuss
married with    -> married to
different than  -> different from
good in English -> good at English
say me          -> tell me
learn me        -> teach me
open the light  -> turn on the light
strong rain     -> heavy rain
turn on it      -> turn it on
```

Run this **before** the corrector, not after:

```
triage -> pattern_matcher -> corrector -> diff_engine -> ...
```

Why before, and why it matters more than it looks:

- **Zero cost, zero latency, zero hallucination.** These edits are certain in a
  way no model output is.
- **The corrector gets an easier job.** Feeding it text with the mechanical
  errors already removed means it can spend its attention on the contextual
  ones — articles, tense, word order — where it actually adds value.
- **Every match carries an ID.** When the matcher fires on pattern 53, you know
  exactly which checklist item it was, which rule explains it, and which drill
  practises it. No classification step, no ambiguity.

The matcher's edits merge into the same `edits` list as the diff engine's, with
`source: "pattern"` instead of `source: "model"`. Downstream nothing else
changes. Set `severity` and `explanation` from the taxonomy directly — the
Error Tutor doesn't need to be called for these at all.

One caution: run the matcher on the raw text but keep the original for the
diff, so the learner still sees *their* sentence, not a half-fixed one.

---

## 2. Product feature: the 100 as a progress map

This is the strongest retention mechanic in the material, and it's better than
a streak counter.

A streak measures attendance. "You have fixed 34 of the 100 most common
Mongolian-speaker errors" measures **competence**, against a finite, visible,
externally-defined list. The learner can see the end of it.

Implementation:

```
pattern_status  pattern_id -> {first_seen, last_seen, hits, clean_streak, status}
status: unseen | active | fading | fixed
```

- `active` — has occurred in the last 14 entries
- `fading` — no occurrence in 14+ entries but fewer than 5 clean entries since
- `fixed` — 5+ consecutive entries where the learner used the structure
  correctly (not merely avoided it — check they attempted it)

That last distinction matters. A learner who stops writing sentences that need
articles has not fixed articles. Track *attempts*, not just *errors*, or you
will congratulate people for avoidance.

Show it as a 100-cell grid on the progress screen. It is the map the guide's
own introduction tells learners to print and mark.

---

## 3. Prompt changes

**Error Tutor** — add the bridge to the explanation instruction:

```
<l1_bridge>
When the taxonomy supplies a `bridge` for this category, use it. A bridge names
what the learner ALREADY has in Mongolian that the English form attaches to.
"You already mark this with -ыг; English uses a separate word" teaches; "English
requires an article" only demands.

Do not use a bridge for category `pronoun`. Per the guide, he/she confusion is a
speed problem, not a knowledge problem — the learner knows the rule. Re-explaining
it is condescending. Acknowledge briefly and route to a timed drill instead.
</l1_bridge>
```

**Corrector** — inject the 8-10 contextual patterns from `top_100_patterns.yaml`
matching the categories present in this learner's recent history, as few-shot
examples. Not all 100. Relevance beats coverage, and a long prompt of mostly
irrelevant examples makes the corrector worse, not better.

**Teacher voice** — one added line, and it changes how feedback lands:

```
When a correction matches a numbered pattern, name it: "This is #53 on your
list — the third time it has come up." A finite numbered list the learner is
working through feels like progress. An endless stream of corrections feels
like failure. Same information, opposite emotional result.
```

**Drill generator** — the guide supplies a correct/incorrect pair for every
pattern. Use the wrong form as a distractor. Distractors drawn from real L1
transfer are far more diagnostic than randomly plausible alternatives.

---

## What I did not merge, and why

**Pronunciation (§1.5–1.7).** Roughly a fifth of the guide, and unusable in a
text journaling app. Worth flagging as a distinct product later — the guide's
six-week protocol is well-specified and would work as a standalone module.

**Mining and geology register (§CC, §KK 97–100).** Excellent content, wrong
audience. A beginner writing about their day does not need JORC terminology, and
surfacing it would make the app feel like it was built for someone else. Kept in
the taxonomy under `excluded_from_journal_app` for a professional tier.

**IELTS material (Volume 5).** A different product with a different loop:
timed, scored, exam-shaped. Journaling is the opposite — untimed, unscored,
personal. Mixing them would weaken both.

---

## One honest caveat

The guide's own note applies to this integration too: the Mongolian examples
are drawn from linguistic sources, and the frequency ordering in the taxonomy
is *predicted* from typology, not measured from your learners.

The Top 100 counts **distinct error types**, not incidence. Verbs have 18 entries
and articles 12, but that does not make verbs the bigger problem — one article
error type can fire fifty times in a single entry. The guide is right that
articles are the biggest single enemy; the checklist counts just don't show it.

So: ship with this ordering, then recompute `priority` from your own corpus at
around 200 entries. Real frequencies from real learners beat both my inference
and the checklist's structure.
