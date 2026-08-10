import type { ErrorCategory } from "../../../shared/schema";

export const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  articles: "Articles (a / an / the)",
  noun_number: "Singular / plural",
  verb_agreement: "Verb agreement",
  verb_tense: "Verb tense",
  verb_form: "Verb form",
  copula: "Missing “to be”",
  word_order: "Word order",
  preposition: "Prepositions",
  topic_fronting: "Topic fronting (“About X…”)",
  pronoun: "Pronouns",
  determiner: "Determiners",
  question_form: "Question form",
  embedded_question: "Embedded questions",
  comma_splice: "Comma splices",
  punctuation: "Punctuation",
  capitalization: "Capitalisation",
  collocation: "Collocations",
  word_choice: "Word choice",
  register: "Register / formality",
  spelling: "Spelling",
};

/** Why an entry ended up in the `failed` state, in the user's terms. */
export const FAIL_REASON_LABELS: Record<string, string> = {
  refusal: "Couldn't analyse",
  too_long: "Too long to analyse",
  rejected: "Rejected by the server",
  gave_up: "Gave up after several tries",
  server: "Couldn't analyse",
};

export const SEVERITY_STYLES: Record<string, string> = {
  minor: "bg-slate-100 text-slate-600",
  moderate: "bg-amber-100 text-amber-700",
  major: "bg-red-100 text-red-700",
};

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
