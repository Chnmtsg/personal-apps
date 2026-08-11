/**
 * Error taxonomy v2, ported from `error_taxonomy.yaml` (the source document —
 * edit there first, then mirror here; the Worker cannot parse YAML at runtime
 * without a dependency this app does not need).
 *
 * The category *ids* are versioned data: they are stored inside every entry's
 * corrections, so renaming or removing one rewrites history. The labels,
 * rules, notes and bridges are presentation and prompting material — safe to
 * reword.
 *
 * A `bridge` is what a plain rule is not: the thing the learner ALREADY has
 * in their first language that the English form attaches to. "English needs
 * an article" demands; "you already mark this with -ыг; English uses a
 * separate word" explains.
 */

export const TAXONOMY_VERSION = 2;

export const CATEGORY_IDS = [
  "article",
  "copula",
  "subject_verb_agreement",
  "pronoun",
  "preposition",
  "verb_tense",
  "word_order",
  "plural",
  "question_form",
  "countability",
  "relative_clause",
  "gerund_infinitive",
  "collocation",
  "verb_form",
  "word_choice",
  "conditional",
  "possessive",
  "run_on",
  "capitalisation",
  "spelling",
  "punctuation",
  "register",
  "missing_word",
  "extra_word",
  "other",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const SEVERITIES = ["blocking", "noticeable", "minor"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface CategoryInfo {
  label: string;
  severityDefault: Severity;
  /** Teaching priority from the guide; lower is more urgent. 99 = catch-all. */
  priority: number;
  /** Rule wording for A1–A2 readers. */
  ruleA2?: string;
  /** Rule wording for B1+ readers. Falls back to ruleA2 when absent. */
  ruleB1?: string;
  /** What Mongolian does instead — factual contrast from the guide. */
  l1NoteMongolian?: string;
  /** The Mongolian structure the English form can be attached to. */
  bridgeMongolian?: string;
  /** Minimum level before this is worth raising at all (e.g. register). */
  gate?: "B1";
}

export const TAXONOMY: Record<CategoryId, CategoryInfo> = {
  article: {
    label: "Articles (a / an / the)",
    severityDefault: "noticeable",
    priority: 1,
    ruleA2:
      "English needs a small word before a noun: 'a' for any one, 'the' for the one we both know.",
    ruleB1:
      "Use a/an to introduce something new; use the once the reader knows which one you mean.",
    l1NoteMongolian: "Mongolian has no articles. The guide calls this the biggest single enemy.",
    bridgeMongolian:
      "Mongolian DOES mark definiteness — the accusative -ыг / -ийг goes on specific objects, and indefinite ones stay bare. The concept is already there. English just uses a separate word instead of a suffix.",
  },
  copula: {
    label: "Missing 'to be'",
    severityDefault: "noticeable",
    priority: 2,
    ruleA2: "English needs am, is, or are before an adjective or a noun: I am tired.",
    l1NoteMongolian:
      "Mongolian omits the linking verb. 'Би геологич' is literally 'I geologist'.",
    bridgeMongolian:
      "Use the guide's day-one sentence: Би геологич -> I am a geologist. Four words, two things English forces you to add that Mongolian does not.",
  },
  subject_verb_agreement: {
    label: "Subject-verb agreement (-s)",
    severityDefault: "noticeable",
    priority: 3,
    ruleA2: "With he, she, or it, add -s to the verb: he works, she goes.",
    l1NoteMongolian:
      "Mongolian verbs change for tense and mood but never for person, so the -s carries no information a Mongolian speaker expects to need.",
    bridgeMongolian:
      "Name the redundancy openly. English repeats information the sentence already has. Arguing with it wastes energy; it has to become reflex.",
  },
  pronoun: {
    label: "He / she",
    severityDefault: "blocking",
    priority: 4,
    ruleA2:
      "English uses he for a man and she for a woman. The reader cannot follow your story if these swap.",
    l1NoteMongolian:
      "Mongolian «тэр» covers he, she, it and that. English forces a gender choice every single time.",
    bridgeMongolian:
      "This is a SPEED problem, not a knowledge problem. The learner knows the rule and still fails under time pressure. Do not re-explain the rule — acknowledge briefly and route to a timed drill instead.",
  },
  preposition: {
    label: "Prepositions",
    severityDefault: "noticeable",
    priority: 5,
    ruleA2: "In English these small words come BEFORE the noun: in the mine, on the table.",
    l1NoteMongolian:
      "Mongolian uses postpositions — уурхайд is literally 'mine-in'. The word exists; the position is reversed.",
    bridgeMongolian:
      "Also the source of 'About the report, it is late' — тухай translated in its Mongolian position. English cannot front a topic with 'about'.",
  },
  verb_tense: {
    label: "Verb tense, incl. present perfect",
    severityDefault: "noticeable",
    priority: 6,
    ruleA2: "Finished past actions use the past form: go becomes went.",
    ruleB1:
      "Present perfect connects a past action to now. Past simple is a finished, disconnected event.",
    l1NoteMongolian:
      "Mongolian has no direct present-perfect equivalent, producing 'I work here since 2019'.",
    bridgeMongolian:
      "The timeline image: past simple is a DOT in the past; present perfect is an ARROW from the past touching today. The trigger words — since, for, already, yet, just, ever, never — cover about 80% of correct usage.",
  },
  word_order: {
    label: "Word order",
    severityDefault: "blocking",
    priority: 7,
    ruleA2: "English order is subject, verb, object: I read a book.",
    l1NoteMongolian:
      "Mongolian is strictly SOV and head-final. The verb drifts to the end, and errors increase with sentence length.",
    bridgeMongolian:
      "Expect word-order errors to RISE as ambition rises — a sudden increase is often a sign of progress, not regression.",
  },
  plural: {
    label: "Plural -s",
    severityDefault: "minor",
    priority: 8,
    ruleA2: "After a number greater than one, English nouns add -s: three samples.",
    l1NoteMongolian:
      "Mongolian plural marking is optional and usually dropped after a numeral, since the number already carries it.",
    bridgeMongolian:
      "Said plainly: English repeats itself, this is not logical, accept it. Naming the illogic ends the argument faster than defending it.",
  },
  question_form: {
    label: "Question form (do-support)",
    severityDefault: "noticeable",
    priority: 9,
    ruleA2: "English questions put a helping verb first: Do you like coffee?",
    l1NoteMongolian:
      "Mongolian forms questions with a particle and no reordering, so learners produce statement-shaped questions.",
    bridgeMongolian:
      "Do-support is the strangest thing in English. Treat it as an arbitrary ritual to memorise, not a logic to derive.",
  },
  countability: {
    label: "Countable / uncountable",
    severityDefault: "minor",
    priority: 10,
    ruleB1: "Some nouns cannot be counted: much information, not many informations.",
    l1NoteMongolian:
      "Mongolian does not draw this line the same way, so English uncountables feel arbitrary.",
    bridgeMongolian:
      "Teach as a closed trap list, not a rule: information, equipment, advice, news, research, staff, evidence, data, work.",
  },
  relative_clause: {
    label: "Relative clauses",
    severityDefault: "noticeable",
    priority: 11,
    ruleB1: "The describing part comes AFTER the noun: the hole that we drilled yesterday.",
    l1NoteMongolian:
      "Mongolian puts the description before the noun, producing front-loaded phrases like 'the yesterday drilled hole'.",
    bridgeMongolian:
      "Build from two simple sentences, never show the finished form first. 'I saw a hole. We drilled the hole yesterday.' -> 'I saw the hole that we drilled yesterday.'",
  },
  gerund_infinitive: {
    label: "-ing vs to",
    severityDefault: "noticeable",
    priority: 12,
    ruleB1: "After a preposition, always use -ing: I look forward to hearing from you.",
    l1NoteMongolian: "No equivalent distinction, so the choice looks random.",
    bridgeMongolian:
      "The one reliable rule: after a preposition -> always -ing. Everything else is a memorised verb list.",
  },
  collocation: {
    label: "Collocation",
    severityDefault: "noticeable",
    priority: 13,
    ruleA2: "These words go together in English. Learn them as one block, not as separate words.",
    bridgeMongolian:
      "make vs do is the highest-frequency pair. Teach collocations as whole chunks; single-word translation is what produces 'do a decision'.",
  },
  verb_form: {
    label: "Verb form",
    severityDefault: "noticeable",
    priority: 14,
    ruleA2: "After to and after helping verbs, use the base form: I can swim, I want to go.",
  },
  word_choice: {
    label: "Word choice",
    severityDefault: "noticeable",
    priority: 15,
    ruleA2: "This word exists, but it is not the one English uses here.",
  },
  conditional: {
    label: "Conditionals",
    severityDefault: "noticeable",
    priority: 16,
    ruleB1:
      "If + present, will + base: If it rains, I will stay home. Never 'will' in the if-part.",
  },
  possessive: {
    label: "Possessive",
    severityDefault: "minor",
    priority: 17,
    ruleA2: "Show belonging with 's: my mother's birthday. Note 'its' has no apostrophe.",
  },
  run_on: {
    label: "Run-on / fragment",
    severityDefault: "noticeable",
    priority: 18,
    ruleB1: "Two complete sentences need a full stop or a joining word, not a comma.",
  },
  capitalisation: {
    label: "Capital letters",
    severityDefault: "minor",
    priority: 19,
    ruleA2: "Names, countries, languages, months and days always take a capital. So does I.",
  },
  spelling: {
    label: "Spelling",
    severityDefault: "minor",
    priority: 20,
    l1NoteMongolian:
      "Mongolian Cyrillic is nearly 1:1 sound to letter. English is not, so spelling cannot be derived from pronunciation.",
    bridgeMongolian:
      "Never let a learner meet a written word without its sound. In Mongolian, spelling gives the sound for free. In English it does not.",
  },
  punctuation: {
    label: "Punctuation",
    severityDefault: "minor",
    priority: 21,
  },
  register: {
    label: "Register and politeness",
    severityDefault: "noticeable",
    priority: 22,
    ruleB1: "English softens requests. 'I want' sounds blunt; 'I'd like' or 'Could you' is normal.",
    l1NoteMongolian:
      "Mongolian carries politeness in verb morphology. English carries it in modal verbs, so direct translation reads as rude.",
    bridgeMongolian:
      "Modals ARE the English politeness system. A learner being blunt is not being rude — they are missing a grammatical channel their own language handles elsewhere.",
    gate: "B1",
  },
  missing_word: {
    label: "Missing word",
    severityDefault: "blocking",
    priority: 23,
  },
  extra_word: {
    label: "Extra word",
    severityDefault: "minor",
    priority: 24,
  },
  other: {
    label: "Other",
    severityDefault: "minor",
    priority: 99,
  },
};

/**
 * The taxonomy that shipped before v2, mapped onto v2 ids. Stored entries
 * from that era carry these keys forever, so stats and screens normalise
 * through this map instead of crashing on a name the enum no longer has.
 */
export const LEGACY_CATEGORY_MAP: Record<string, CategoryId> = {
  articles: "article",
  noun_number: "plural",
  verb_agreement: "subject_verb_agreement",
  verb_tense: "verb_tense",
  verb_form: "verb_form",
  copula: "copula",
  word_order: "word_order",
  preposition: "preposition",
  topic_fronting: "word_order",
  pronoun: "pronoun",
  determiner: "word_choice",
  question_form: "question_form",
  embedded_question: "question_form",
  comma_splice: "run_on",
  punctuation: "punctuation",
  capitalization: "capitalisation",
  collocation: "collocation",
  word_choice: "word_choice",
  register: "register",
  spelling: "spelling",
};

const CATEGORY_SET = new Set<string>(CATEGORY_IDS);

/** A v2 id passes through; a legacy id maps; anything else is "other". */
export function normalizeCategory(raw: string): CategoryId {
  if (CATEGORY_SET.has(raw)) return raw as CategoryId;
  return LEGACY_CATEGORY_MAP[raw] ?? "other";
}

/** Pre-v2 severities, mapped onto the v2 scale for display. */
export function normalizeSeverity(raw: string): Severity {
  if ((SEVERITIES as readonly string[]).includes(raw)) return raw as Severity;
  if (raw === "major") return "blocking";
  if (raw === "moderate") return "noticeable";
  return "minor";
}

/**
 * The taxonomy's rule wording for a category at the learner's band, or
 * undefined when the taxonomy has none (e.g. spelling — the correction pair
 * itself is the best explanation there).
 */
export function ruleFor(id: CategoryId, level: string | undefined): string | undefined {
  const info = TAXONOMY[id];
  const b1Plus = level !== undefined && level !== "A1" && level !== "A2";
  if (b1Plus) return info.ruleB1 ?? info.ruleA2;
  return info.ruleA2 ?? info.ruleB1;
}
