import type { ErrorCategory } from "../../../shared/schema";
import {
  TAXONOMY,
  normalizeCategory,
  normalizeSeverity,
  type CategoryId,
} from "../../../shared/taxonomy.ts";
import type { Entry } from "./db";
export { countWords } from "../../../shared/schema.ts";
export { normalizeCategory, normalizeSeverity };

/**
 * Display names only. The taxonomy *ids* are versioned data stored inside
 * every past entry — these strings are not, so rewording one is
 * presentation, never a migration.
 *
 * Written for a reader at A2+/B1: this is the list the learner taps to study
 * their own patterns, so a name they cannot read is a pattern they will not
 * open.
 */
export const CATEGORY_LABELS: Record<ErrorCategory, string> = Object.fromEntries(
  (Object.keys(TAXONOMY) as CategoryId[]).map((id) => [id, TAXONOMY[id].label])
) as Record<ErrorCategory, string>;

/** Label for any stored category string — v2 or legacy — without crashing. */
export function labelFor(category: string): string {
  return CATEGORY_LABELS[normalizeCategory(category)];
}

type FailReason = NonNullable<Entry["failReason"]>;

/**
 * Short enough for a History badge. Typed to the failReason union so adding a
 * reason is a compile error here rather than a blank badge at runtime.
 */
export const FAIL_REASON_LABELS: Record<FailReason, string> = {
  refusal: "Could not check",
  too_long: "Too long",
  rejected: "Not accepted",
  gave_up: "Could not check",
  server: "Could not check",
};

/** The same reasons as a full sentence, for the Feedback screen. */
export const FAIL_REASON_MESSAGES: Record<FailReason, string> = {
  refusal: "We could not check this writing.",
  too_long: "This writing is too long to check in one piece. Try splitting it into two entries.",
  rejected: "The server did not accept this writing.",
  gave_up: "We tried five times and could not reach the server.",
  server: "We could not check this writing.",
};
