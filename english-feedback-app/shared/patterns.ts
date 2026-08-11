/**
 * The Top 100 error patterns, ported from `top_100_patterns.yaml` (the source
 * document — edit there first, then mirror here).
 *
 * tier "deterministic" with a `find` regex = catchable and fixable in code,
 * before any model call: zero cost, zero latency, zero hallucination risk.
 * A deterministic entry whose YAML `replace` was null (needs a lemma table or
 * a restructure) is carried without a regex and behaves like "contextual".
 * tier "contextual" = corrector few-shot material and drill distractors.
 * tier "professional" = mining/technical register, out of scope for the
 * journaling app; kept so a later professional tier needs no re-derivation.
 *
 * Regexes are RegExp literals rather than strings so the escaping in the YAML
 * survives review; the matcher clones them before use (a shared `g` regex
 * carries `lastIndex` state).
 */

import type { CategoryId } from "./taxonomy";

export type PatternTier = "deterministic" | "contextual" | "professional";

export interface PatternSpec {
  id: number;
  category: CategoryId;
  tier: PatternTier;
  wrong: string;
  right: string;
  /** Present only when the fix is safe to apply without review. */
  find?: RegExp;
  /** `$n` backreference template. Omitted when `fixId` names a replacer. */
  replace?: string;
  /** Names a code replacer in worker/src/patterns.ts (lemma-table fixes). */
  fixId?: "strip_progressive" | "irregular_past" | "modal_s" | "no_negation";
}

export const PATTERNS: PatternSpec[] = [
  // ---------- Articles (1-12) ----------
  { id: 1, category: "article", tier: "contextual", wrong: "I am geologist.", right: "I am a geologist." },
  { id: 2, category: "article", tier: "contextual", wrong: "She is engineer.", right: "She is an engineer." },
  { id: 3, category: "article", tier: "contextual", wrong: "I work in mining industry.", right: "I work in the mining industry." },
  { id: 4, category: "article", tier: "contextual", wrong: "We found new deposit.", right: "We found a new deposit." },
  { id: 5, category: "article", tier: "contextual", wrong: "The deposit is in Gobi.", right: "The deposit is in the Gobi Desert." },
  { id: 6, category: "article", tier: "deterministic", wrong: "I live in the Mongolia.", right: "I live in Mongolia.",
    find: /\bthe\s+(Mongolia|Ulaanbaatar|China|Russia|Japan|Korea|England)\b/gi, replace: "$1" },
  { id: 7, category: "article", tier: "deterministic", wrong: "He speaks the English.", right: "He speaks English.",
    find: /\bthe\s+(English|Mongolian|Chinese|Russian|Japanese)\b(?!\s+(language|word|teacher|class|test))/gi, replace: "$1" },
  { id: 8, category: "article", tier: "deterministic", wrong: "I go to the work at 8.", right: "I go to work at 8.",
    find: /\bto\s+the\s+(work|school|bed|home)\b/gi, replace: "to $1" },
  { id: 9, category: "article", tier: "contextual", wrong: "The geology is interesting.", right: "Geology is interesting." },
  { id: 10, category: "article", tier: "deterministic", wrong: "It took a hour.", right: "It took an hour.",
    find: /\ba\s+(hour|honest|honour|heir)/gi, replace: "an $1" },
  { id: 11, category: "article", tier: "deterministic", wrong: "She is an university student.", right: "She is a university student.",
    find: /\ban\s+(university|user|European|one|uniform|unit)/gi, replace: "a $1" },
  { id: 12, category: "article", tier: "contextual", wrong: "I saw a rock. A rock was heavy.", right: "I saw a rock. The rock was heavy." },

  // ---------- Nouns and number (13-22) ----------
  { id: 13, category: "plural", tier: "contextual", wrong: "three sample", right: "three samples" },
  { id: 14, category: "countability", tier: "deterministic", wrong: "many informations", right: "much information",
    find: /\b(many|few)\s+informations?\b/gi, replace: "much information" },
  { id: 15, category: "countability", tier: "deterministic", wrong: "new equipments", right: "new equipment",
    find: /\bequipments\b/gi, replace: "equipment" },
  { id: 16, category: "countability", tier: "deterministic", wrong: "He gave me an advice.", right: "He gave me a piece of advice.",
    find: /\ban\s+advice\b/gi, replace: "a piece of advice" },
  { id: 17, category: "subject_verb_agreement", tier: "deterministic", wrong: "The news are good.", right: "The news is good.",
    find: /\bnews\s+are\b/gi, replace: "news is" },
  { id: 18, category: "countability", tier: "deterministic", wrong: "I have many works.", right: "I have a lot of work.",
    find: /\bmany\s+works\b/gi, replace: "a lot of work" },
  { id: 19, category: "countability", tier: "contextual", wrong: "two researches", right: "two research projects" },
  { id: 20, category: "countability", tier: "deterministic", wrong: "The datas show", right: "The data show",
    find: /\bdatas\b/gi, replace: "data" },
  { id: 21, category: "countability", tier: "deterministic", wrong: "staffs were present", right: "staff were present",
    find: /\bstaffs\b/gi, replace: "staff" },
  { id: 22, category: "countability", tier: "deterministic", wrong: "evidences suggest", right: "evidence suggests",
    find: /\bevidences\b/gi, replace: "evidence" },

  // ---------- Verbs and tense (23-40) ----------
  { id: 23, category: "subject_verb_agreement", tier: "contextual", wrong: "He work here.", right: "He works here." },
  { id: 24, category: "subject_verb_agreement", tier: "deterministic", wrong: "She don't know.", right: "She doesn't know.",
    find: /\b(he|she|it)\s+don.?t\b/gi, replace: "$1 doesn't" },
  { id: 25, category: "verb_tense", tier: "contextual", wrong: "I work here since 2019.", right: "I have worked here since 2019." },
  { id: 26, category: "verb_form", tier: "deterministic", wrong: "I am knowing the answer.", right: "I know the answer.",
    find: /\b(am|is|are)\s+(knowing|wanting|needing|liking|believing|understanding)\b/gi, fixId: "strip_progressive" },
  { id: 27, category: "copula", tier: "deterministic", wrong: "I am agree.", right: "I agree.",
    find: /\b(am|is|are)\s+agree\b/gi, replace: "agree" },
  { id: 28, category: "copula", tier: "contextual", wrong: "He is teacher.", right: "He is a teacher." },
  { id: 29, category: "verb_tense", tier: "contextual", wrong: "Yesterday I go to site.", right: "Yesterday I went to the site." },
  { id: 30, category: "verb_form", tier: "deterministic", wrong: "I have went there.", right: "I have gone there.",
    find: /\b(have|has|had)\s+went\b/gi, replace: "$1 gone" },
  { id: 31, category: "verb_form", tier: "deterministic", wrong: "The report was wrote.", right: "The report was written.",
    find: /\b(was|were|been)\s+wrote\b/gi, replace: "$1 written" },
  { id: 32, category: "verb_form", tier: "deterministic", wrong: "The accident was happened.", right: "The accident happened.",
    find: /\b(was|were)\s+(happened|occurred|arrived)\b/gi, replace: "$2" },
  { id: 33, category: "verb_form", tier: "deterministic", wrong: "I didn't went.", right: "I didn't go.",
    find: /\b(didn.?t)\s+(went|saw|came|took|made|got|had|did|ate|gave)\b/gi, fixId: "irregular_past" },
  { id: 34, category: "verb_form", tier: "deterministic", wrong: "He can to swim.", right: "He can swim.",
    find: /\b(can|could|will|would|should|must|may|might)\s+to\s+([a-z]+)\b/gi, replace: "$1 $2" },
  { id: 35, category: "verb_form", tier: "deterministic", wrong: "He cans drive.", right: "He can drive.",
    find: /\b(cans|musts|wills|shoulds)\b/gi, fixId: "modal_s" },
  { id: 36, category: "gerund_infinitive", tier: "contextual", wrong: "I enjoy to work here.", right: "I enjoy working here." },
  { id: 37, category: "gerund_infinitive", tier: "contextual", wrong: "I look forward to hear.", right: "I look forward to hearing." },
  { id: 38, category: "verb_form", tier: "contextual", wrong: "He suggested me to go.", right: "He suggested that I go." },
  { id: 39, category: "conditional", tier: "contextual", wrong: "If it will rain, we stop.", right: "If it rains, we will stop." },
  { id: 40, category: "word_choice", tier: "contextual", wrong: "I am interesting in geology.", right: "I am interested in geology." },

  // ---------- Word order (41-48) ----------
  { id: 41, category: "word_order", tier: "contextual", wrong: "I the samples analysed.", right: "I analysed the samples." },
  { id: 42, category: "word_order", tier: "contextual", wrong: "He examined carefully the core.", right: "He examined the core carefully." },
  { id: 43, category: "word_order", tier: "contextual", wrong: "We drilled last week three holes.", right: "We drilled three holes last week." },
  { id: 44, category: "relative_clause", tier: "contextual", wrong: "The yesterday drilled hole", right: "the hole we drilled yesterday" },
  { id: 45, category: "word_order", tier: "contextual", wrong: "a wooden black old box", right: "an old black wooden box" },
  { id: 46, category: "word_order", tier: "deterministic", wrong: "I always am careful.", right: "I am always careful.",
    find: /\b(always|never|often|usually|sometimes|already)\s+(am|is|are|was|were)\b/gi, replace: "$2 $1" },
  { id: 47, category: "word_order", tier: "contextual", wrong: "Always I check the data.", right: "I always check the data." },
  { id: 48, category: "word_choice", tier: "contextual", wrong: "Very I like it.", right: "I like it very much." },

  // ---------- Prepositions (49-62) ----------
  { id: 49, category: "word_order", tier: "contextual", wrong: "About the report, it's late.", right: "The report is late." },
  { id: 50, category: "preposition", tier: "deterministic", wrong: "We arrived to the site.", right: "We arrived at the site.",
    find: /\barriv(e|ed|ing)\s+to\b/gi, replace: "arriv$1 at" },
  { id: 51, category: "preposition", tier: "deterministic", wrong: "Let's discuss about it.", right: "Let's discuss it.",
    find: /\bdiscuss(ed|ing|es)?\s+about\b/gi, replace: "discuss$1" },
  { id: 52, category: "preposition", tier: "contextual", wrong: "Explain me the data.", right: "Explain the data to me." },
  { id: 53, category: "preposition", tier: "deterministic", wrong: "It depends of the grade.", right: "It depends on the grade.",
    find: /\bdepend(s|ed|ing)?\s+of\b/gi, replace: "depend$1 on" },
  { id: 54, category: "preposition", tier: "deterministic", wrong: "I listen music.", right: "I listen to music.",
    find: /\blisten(s|ed|ing)?\s+(?!to\b)(music|radio|him|her|me|them|it)\b/gi, replace: "listen$1 to $2" },
  { id: 55, category: "preposition", tier: "deterministic", wrong: "She is married with him.", right: "She is married to him.",
    find: /\bmarried\s+with\b/gi, replace: "married to" },
  { id: 56, category: "preposition", tier: "deterministic", wrong: "in the internet", right: "on the internet",
    find: /\bin\s+the\s+internet\b/gi, replace: "on the internet" },
  { id: 57, category: "preposition", tier: "deterministic", wrong: "I'm good in English.", right: "I'm good at English.",
    find: /\bgood\s+in\s+(English|maths?|science|sports?|cooking|drawing)\b/gi, replace: "good at $1" },
  { id: 58, category: "preposition", tier: "deterministic", wrong: "different than", right: "different from",
    find: /\bdifferent\s+than\b/gi, replace: "different from" },
  { id: 59, category: "preposition", tier: "deterministic", wrong: "consist in three units", right: "consist of three units",
    find: /\bconsist(s|ed|ing)?\s+in\b/gi, replace: "consist$1 of" },
  { id: 60, category: "preposition", tier: "deterministic", wrong: "responsible of safety", right: "responsible for safety",
    find: /\bresponsible\s+of\b/gi, replace: "responsible for" },
  { id: 61, category: "preposition", tier: "deterministic", wrong: "on July", right: "in July",
    find: /\bon\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b(?!\s+\d)/gi, replace: "in $1" },
  { id: 62, category: "preposition", tier: "deterministic", wrong: "enter into the room", right: "enter the room",
    find: /\benter(s|ed|ing)?\s+into\s+the\b/gi, replace: "enter$1 the" },

  // ---------- Pronouns and determiners (63-70) ----------
  { id: 63, category: "pronoun", tier: "contextual", wrong: "My wife, he works...", right: "My wife, she works..." },
  { id: 64, category: "spelling", tier: "deterministic", wrong: "Its ready.", right: "It's ready.",
    find: /\bIts\s+(ready|good|fine|late|ok|okay|nice|cold|hot|true)\b/gi, replace: "It's $1" },
  { id: 65, category: "possessive", tier: "deterministic", wrong: "the deposit and it's grade", right: "the deposit and its grade",
    find: /\bit's\s+(grade|name|size|colour|color|price|value|quality|shape)\b/gi, replace: "its $1" },
  { id: 66, category: "possessive", tier: "deterministic", wrong: "the my report", right: "my report",
    find: /\bthe\s+(my|your|his|her|our|their)\b/gi, replace: "$1" },
  { id: 67, category: "possessive", tier: "deterministic", wrong: "a my friend", right: "a friend of mine",
    find: /\ba\s+my\s+(\w+)\b/gi, replace: "a $1 of mine" },
  { id: 68, category: "word_choice", tier: "deterministic", wrong: "another samples", right: "other samples",
    find: /\banother\s+(\w+s)\b/gi, replace: "other $1" },
  { id: 69, category: "subject_verb_agreement", tier: "contextual", wrong: "Every students know.", right: "Every student knows." },
  { id: 70, category: "extra_word", tier: "contextual", wrong: "I have somes.", right: "I have some." },

  // ---------- Questions and negation (71-76) ----------
  { id: 71, category: "question_form", tier: "contextual", wrong: "Where you work?", right: "Where do you work?" },
  { id: 72, category: "question_form", tier: "contextual", wrong: "You work here?", right: "Do you work here?" },
  { id: 73, category: "question_form", tier: "contextual", wrong: "Does she works here?", right: "Does she work here?" },
  { id: 74, category: "question_form", tier: "contextual", wrong: "He asked where did I work.", right: "He asked where I worked." },
  { id: 75, category: "question_form", tier: "deterministic", wrong: "I no have time.", right: "I don't have time.",
    find: /\b(I|you|we|they)\s+no\s+(have|want|know|like|need)\b/gi, fixId: "no_negation" },
  { id: 76, category: "word_choice", tier: "deterministic", wrong: "I don't have no samples.", right: "I don't have any samples.",
    find: /\b(don't|doesn't|didn't|can't|won't)\s+(\w+)\s+no\b/gi, replace: "$1 $2 any" },

  // ---------- Sentence structure and punctuation (77-84) ----------
  { id: 77, category: "run_on", tier: "contextual", wrong: "I'm tired, I'll stop.", right: "I'm tired. I'll stop." },
  { id: 78, category: "punctuation", tier: "contextual", wrong: "The samples, were analysed.", right: "The samples were analysed." },
  { id: 79, category: "capitalisation", tier: "deterministic", wrong: "i am a geologist", right: "I am a geologist",
    find: /\bi\b/g, replace: "I" },
  { id: 80, category: "capitalisation", tier: "contextual", wrong: "I speak english.", right: "I speak English." },
  { id: 81, category: "run_on", tier: "contextual", wrong: "Because it was late.", right: "We stopped because it was late." },
  { id: 82, category: "register", tier: "contextual", wrong: "And I want to add...", right: "In addition, ..." },
  { id: 83, category: "plural", tier: "contextual", wrong: "a 500-metres hole", right: "a 500-metre hole" },
  { id: 84, category: "possessive", tier: "contextual", wrong: "sample's (plural)", right: "samples" },

  // ---------- Vocabulary and collocation (85-94) ----------
  { id: 85, category: "collocation", tier: "contextual", wrong: "do a decision", right: "make a decision" },
  { id: 86, category: "collocation", tier: "contextual", wrong: "make research", right: "do research" },
  { id: 87, category: "collocation", tier: "deterministic", wrong: "open the light", right: "turn on the light",
    find: /\bopen\s+the\s+(light|lights|TV|television|radio|computer)\b/gi, replace: "turn on the $1" },
  { id: 88, category: "word_choice", tier: "deterministic", wrong: "say me the results", right: "tell me the results",
    find: /\bsay\s+(me|him|her|us|them)\b/gi, replace: "tell $1" },
  { id: 89, category: "word_choice", tier: "deterministic", wrong: "learn me English", right: "teach me English",
    find: /\blearn\s+(me|him|her|us|them)\b/gi, replace: "teach $1" },
  { id: 90, category: "word_choice", tier: "deterministic", wrong: "I speak good.", right: "I speak well.",
    find: /\b(speak|talk|write|work|sing|play|do)\s+good\b/gi, replace: "$1 well" },
  { id: 91, category: "collocation", tier: "deterministic", wrong: "strong rain", right: "heavy rain",
    find: /\bstrong\s+(rain|snow|traffic|smoker)\b/gi, replace: "heavy $1" },
  { id: 92, category: "register", tier: "contextual", wrong: "big difference (technical)", right: "significant difference" },
  { id: 93, category: "word_order", tier: "deterministic", wrong: "turn on it", right: "turn it on",
    find: /\bturn\s+(on|off)\s+(it|them|him|her)\b/gi, replace: "turn $2 $1" },
  { id: 94, category: "word_order", tier: "contextual", wrong: "look the samples after", right: "look after the samples" },

  // ---------- Register and style (95-100) ----------
  { id: 95, category: "register", tier: "contextual", wrong: "I want the report.", right: "I'd like the report." },
  { id: 96, category: "register", tier: "contextual", wrong: "Send me the data.", right: "Could you send me the data?" },
  { id: 97, category: "register", tier: "professional", wrong: "We got a lot of samples.", right: "We obtained a substantial number of samples." },
  { id: 98, category: "register", tier: "professional", wrong: "This proves the model.", right: "This suggests the model is correct." },
  { id: 99, category: "register", tier: "professional", wrong: "The ore is 200 Mt.", right: "The mineralisation is 200 Mt." },
  { id: 100, category: "register", tier: "professional", wrong: "We have 50 Mt of reserves.", right: "We have 50 Mt of Mineral Resources." },
];

/** Everything the journaling app tracks — the professional tier is out of scope. */
export const JOURNAL_PATTERNS: PatternSpec[] = PATTERNS.filter((p) => p.tier !== "professional");

/** The regex-fixable subset the matcher runs before the corrector. */
export const DETERMINISTIC_PATTERNS: PatternSpec[] = PATTERNS.filter(
  (p) => p.tier === "deterministic" && p.find !== undefined
);

/** Contextual examples for a set of categories — corrector few-shot material. */
export function contextualExamplesFor(categories: CategoryId[], limit = 10): PatternSpec[] {
  const wanted = new Set(categories);
  return PATTERNS.filter((p) => p.tier === "contextual" && wanted.has(p.category)).slice(0, limit);
}
