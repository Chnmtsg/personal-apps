# English Feedback Project

## Project Vision

English Feedback is a writing-feedback application for anyone learning English.

The learner describes themselves in Settings — first language, what they do,
their level, their goal — and every field is optional. That profile is sent as
context with each analysis and shapes the teaching: which transfer errors to
look for, which examples land, and what reading level the feedback is written
at. With nothing filled in the app still works; it teaches the English rule
plainly and does not guess where the learner is from.

Its first user is a native Mongolian speaker, a geologist in mining, at roughly
IELTS 4.0–4.5, aiming at IELTS 7.5 and professional business English. That is
now one profile among many rather than the app's definition — but it is the
profile the curated Mongolian dossier was written for and verified against.

The goal is NOT to correct a piece of writing. A chat can do that, and the
correction disappears when the conversation does.

The goal is to make error *patterns* visible over time. Every correction is
stored with a category, so after two hundred entries the application can say
"articles: 47 errors this month — your number one pattern" and show every past
example of it.

---

## Core Modules

A core module is one the application ships today and can be reached by name.

| Module | Where it lives |
|---|---|
| Write | Tab bar — the entry editor, with a 30-word minimum and draft autosave |
| Feedback | Reached by opening an analysed entry; a card per correction (category, rule, the exact changed span), any sentence the teacher flagged as ambiguous rather than guessed, the teacher's message, and the corrected text in full. Entries analysed before ADR 0001 also carry scores, a CEFR estimate, fluency notes, vocabulary and drills — those screens still render for old entries, but nothing analysed today produces them |
| Patterns | Tab bar — top categories, the trend chart, all-time totals, per-category examples, and a map of the 49 Top-100 patterns the deterministic matcher can actually detect |
| History | Tab bar — every entry with its status |
| Settings | Tab bar — privacy statement, export, import a backup, delete all |

**Patterns** is the module that carries the vision. Everything else feeds it.
Its per-category example list is what turns a pile of corrections into
something a learner can study.

Corrections are ranked and cited using the learner's recurring-category
counts — computed **client-side** from their own local entries and sent along
with that one request as context, so the teacher's message can say a category
is recurring and, when a checklist number applies, name it. Nothing about a
learner's error history is stored server-side; the Worker never persists
anything about the requester between requests (see Privacy below).

The **trend** is deliberately errors per **100 words**, not raw error counts.
Raw counts rise as entries get longer, so they would show a learner getting
worse while improving. Do not add a raw-count chart alongside it.

---

## Architecture

Two deployed pieces plus shared code.

| Folder | What it is |
|---|---|
| `app/` | React + TypeScript + Vite PWA. Tailwind, IndexedDB via `idb`, Recharts, `vite-plugin-pwa`. |
| `worker/` | Cloudflare Worker proxy. Holds the Anthropic API key, enforces the origin allowlist and rate limit, runs the analysis pipeline (`worker/src/pipeline.ts`): a deterministic pattern matcher fixes known errors first, then ONE runtime agent — the teacher — checks risk, corrects minimally, and labels its own changes; a code diff against the learner's own text computes every changed span (`worker/src/diff.ts`). See `docs/adr/0001`. |
| `shared/` | The Zod feedback schema, the error-category taxonomy (`taxonomy.ts`), the Top-100 pattern list (`patterns.ts`), and the pipeline's system prompt — imported by both. |

The PWA never calls `api.anthropic.com`. The key exists only as a Worker secret.

---

## Project Principles

The application must be

- Private by default — entries live only on the device
- Offline-first — writing must never be blocked by the network
- Fast
- Simple
- Mobile-friendly
- Easy to understand

---

## Hard Constraints

These are not preferences. Breaking one is a Critical finding.

1. **The API key never reaches the client.** Not in code, not in `[vars]`, not
   in a build-time variable.
2. **An entry is never lost.** It is written to IndexedDB before any network
   call, and every failure path leaves the text readable in History.
3. **The category taxonomy is versioned data.** The 25 v2 category ids in
   `shared/taxonomy.ts` are stored inside every past entry. Renaming or removing
   one silently rewrites history — treat a change as a migration. Entries from
   before v2 carry the legacy 20-name taxonomy; `normalizeCategory` maps them
   at read time, and `LEGACY_CATEGORY_MAP` must never lose an entry.
4. **Stored feedback stays interpretable.** Each entry records the `modelId`
   and `promptVersion` it was judged under. Bump `PROMPT_VERSION` whenever any
   of the pipeline's system prompts change (`shared/schema.ts`).
5. **Every system prompt is byte-identical on every request.** Each is a
   cached prefix; interpolating anything into any of them silently disables
   prompt caching for that call.
6. **The worker logs counts, never entry text.**

---

## Model Behaviour That Constrains the Code

`MODEL_ID` is `claude-opus-5`. Two properties of it are load-bearing:

- **Thinking is on by default,** and `max_tokens` bounds thinking *and*
  response text together. A `max_tokens` sized for the response alone truncates
  under load. This is why the worker sets it explicitly and why truncation is
  reported as a permanent failure rather than a retryable one.
- **Safety classifiers can decline a request** with `stop_reason: "refusal"` on
  an HTTP 200. That is a verdict on the text, not an outage — it must never be
  retried.

---

## Target User

Anyone learning English, reading feedback written in English.

Feedback is written at the learner's stated level, and at B1 when they have not
said. That is the ceiling the whole interface is designed against: a learner
who cannot read the feedback has not been taught anything. A correction without
a reason teaches nothing either, so every correction carries a one-sentence
rule.

The reason is where the learner's first language matters. Most errors are
systematic transfer from it, so naming that system is what separates this from
a spell-checker. Curated contrastive notes live as `l1NoteMongolian` /
`bridgeMongolian` fields on each category in `TAXONOMY` (`shared/taxonomy.ts`)
— today only Mongolian is curated; where there is none, the model uses its own
knowledge of the stated language, and where no language is given it must not
guess. Adding a language's notes is additive and needs no migration — but
write them only from real contrastive knowledge. A confident wrong explanation
of why someone made a mistake is worse than no explanation.

---

## Long-term Vision

Not built. Do not describe these as if they ship.

- Spaced repetition over past errors — resurfacing old errors at scheduled
  intervals. Not the same as the retired practice-drills agent (pre-ADR-0001),
  which generated drills fresh per entry rather than scheduling or resurfacing
  them over time — a different feature even if it returns.
- Speaking / pronunciation feedback
- Multi-device sync
