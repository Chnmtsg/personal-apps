/**
 * Demo entries for local development. DEV ONLY — see seedDemo.ts, which is
 * the only importer and is itself behind `import.meta.env.DEV`.
 *
 * This exists because the Feedback screen cannot be looked at without data,
 * and the only other way to get data is a live `claude-opus-5` call against a
 * deployed Worker. Reviewing a layout should not cost money or require a key.
 *
 * Every id is prefixed `demo-`, so demo data is always distinguishable from
 * the learner's own writing — including by a human reading Settings → Export.
 *
 * The shape is deliberately built by hand rather than imported from
 * shared/schema.ts: this is a FIXTURE, and a fixture that drifts silently
 * with the schema stops catching the thing it exists to catch. It is fed
 * through `importEntries`, which validates it, so a drift shows up as
 * entries being skipped rather than as a wrong screen.
 */

const DAY = 86_400_000;

/** One correction, in the stored (v2) shape. */
function correction(
  original: string,
  corrected: string,
  category: string,
  explanation: string,
  extra: Record<string, unknown> = {}
) {
  return {
    original,
    corrected,
    category,
    severity: "noticeable",
    explanation,
    source: "model",
    ...extra,
  };
}

const ARTICLE_RULE =
  "English needs a small word before a noun: 'a' for any one, 'the' for the one we both know.";
const PAST_RULE = "For finished past actions, use the past form: go becomes went.";

/**
 * Nineteen earlier entries, so the 14-entry PATTERN_ACTIVE_WINDOW can actually
 * be crossed on screen: "spelling" appears only in the oldest, which is what
 * makes the "has not come up in your last N entries" line appear at all.
 */
function earlier(i: number, now: number) {
  const corrections = [];
  if (i % 2 === 0) {
    corrections.push(correction("I am geologist", "I am a geologist", "article", ARTICLE_RULE));
  }
  if (i % 3 === 0) corrections.push(correction("I go", "I went", "verb_tense", PAST_RULE));
  if (i === 1) {
    corrections.push(correction("recieved", "received", "spelling", "I before E, except after C."));
  }

  const text =
    `Entry ${i}. Today I worked on the survey near the river and wrote up my notes ` +
    `in the evening. The weather was cold but the work went well.`;

  return {
    id: `demo-${String(i).padStart(2, "0")}`,
    createdAt: now - (20 - i) * 2 * DAY,
    text,
    wordCount: text.trim().split(/\s+/).length,
    status: "analysed",
    modelId: "claude-opus-5",
    promptVersion: 9,
    taxonomyVersion: 2,
    feedback: {
      risk: "none",
      corrected_text: text,
      corrections,
      teacher_feedback: "Steady work this week — your sentences are getting longer.",
    },
  };
}

/**
 * The entry worth opening. Carries every section the screen can render:
 * a repeated category (so rule de-duplication is visible), a pattern-sourced
 * correction, alternatives on two corrections, and one natural phrasing.
 */
function current(now: number) {
  const text =
    "Yesterday I go to shop with my sister for buy some food. I am geologist and I work in " +
    "mining company near the mountains. I want to visit my sister next week. We meet in Monday " +
    "at the station and after we walk to the old market together.";

  return {
    id: "demo-20-current",
    createdAt: now,
    text,
    wordCount: text.trim().split(/\s+/).length,
    status: "analysed",
    modelId: "claude-opus-5",
    promptVersion: 9,
    taxonomyVersion: 2,
    feedback: {
      risk: "none",
      corrected_text:
        "Yesterday I went to the shop with my sister to buy some food. I am a geologist and I " +
        "work in a mining company near the mountains. I want to visit my sister next week. We " +
        "are meeting on Monday at the station and afterwards we walk to the old market together.",
      corrections: [
        correction("go", "went", "verb_tense", PAST_RULE),
        correction("to shop", "to the shop", "article", ARTICLE_RULE),
        correction(
          "for buy",
          "to buy",
          "preposition",
          "Use to + base form to say why you do something, not 'for'."
        ),
        correction("I am geologist", "I am a geologist", "article", ARTICLE_RULE),
        correction("in mining company", "in a mining company", "article", ARTICLE_RULE),
        correction(
          "We meet",
          "We are meeting",
          "verb_tense",
          "For a fixed future arrangement, use am/is/are + -ing."
        ),
        correction("in Monday", "on Monday", "preposition", "Days of the week take 'on'.", {
          source: "pattern",
          pattern_id: 53,
        }),
      ],
      alternatives: [
        { for: 0, phrasings: ["Yesterday I popped down to the shop with my sister."] },
        { for: 3, phrasings: ["I work as a geologist.", "Geology is my field."] },
      ],
      natural_phrasings: [
        {
          original: "I want to visit my sister next week.",
          phrasing: "I'd like to visit my sister next week.",
          note: "Both are correct. “I'd like to” sounds a little softer, and it is what people say most often.",
        },
      ],
      teacher_feedback:
        "Your second sentence is doing a lot and it holds together well — “near the mountains” " +
        "is exactly the kind of detail that makes writing worth reading. The big one this time is " +
        "articles: English wants a small word before a noun, and it came up three times here. Say it " +
        "out loud as “a geologist”, “a mining company”, and it starts to feel automatic. " +
        "What did you buy at the market?",
    },
  };
}

/** Raw entry objects, newest last. Fed to `importEntries`, which validates them. */
export function demoEntries(now: number = Date.now()): unknown[] {
  const out: unknown[] = [];
  for (let i = 1; i <= 19; i++) out.push(earlier(i, now));
  out.push(current(now));
  return out;
}
