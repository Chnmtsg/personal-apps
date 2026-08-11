/**
 * Builds the learner-specific blocks that go in USER messages.
 *
 * This exists as its own pure module for one architectural reason: everything
 * here varies per user, and the system prompts are byte-identical cached
 * prefixes. Splicing any of this into a system prompt would give every
 * learner their own cache entry and roughly triple the input cost of every
 * call — silently, with no error. Keeping the assembly here makes that
 * boundary visible, and makes it testable without a network or a Worker
 * runtime.
 *
 * The curated contrastive knowledge itself now lives in shared/taxonomy.ts
 * (ported from the English–Mongolian Contrastive Guide); this module only
 * selects and formats it.
 */

import { TAXONOMY, type CategoryId } from "../../shared/taxonomy.ts";
import type { LearnerProfile } from "../../shared/schema.ts";

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** The band prompts should write at. B1 is the app-wide default ceiling. */
export function effectiveLevel(profile: LearnerProfile | undefined): string {
  return profile?.level ?? "B1";
}

/**
 * Whether curated first-language notes exist for this learner. Only
 * Mongolian is curated today; the check tolerates case and whitespace, and
 * uses an exact comparison rather than an object index so learner-typed text
 * ("constructor") can never dredge something up from Object.prototype.
 */
export function hasCuratedL1(nativeLanguage: string | undefined): boolean {
  return nativeLanguage?.trim().toLowerCase() === "mongolian";
}

/**
 * The l1_notes block for the Error Tutor: per-category contrast notes and
 * bridges. A bridge names what the learner already has in their language that
 * the English form attaches to — the thing a plain rule cannot give.
 */
export function l1NotesFor(nativeLanguage: string | undefined): string | undefined {
  if (!hasCuratedL1(nativeLanguage)) return undefined;
  const lines: string[] = [];
  for (const id of Object.keys(TAXONOMY) as CategoryId[]) {
    const t = TAXONOMY[id];
    if (!t.l1NoteMongolian && !t.bridgeMongolian) continue;
    const note = t.l1NoteMongolian ? ` ${t.l1NoteMongolian}` : "";
    const bridge = t.bridgeMongolian ? ` Bridge: ${t.bridgeMongolian}` : "";
    lines.push(`- ${id}:${note}${bridge}`);
  }
  return lines.join("\n");
}

/**
 * The learner facts block shared by the tutor, fluency, coach and teacher
 * user messages.
 *
 * An absent profile is a normal state, not an error: someone can install the
 * app and write their first entry before filling anything in. In that case
 * the block says so explicitly, because the alternative — silence — invites
 * the model to invent a first language and explain errors that never
 * happened.
 */
export function learnerContext(profile: LearnerProfile | undefined): string {
  const nativeLanguage = clean(profile?.nativeLanguage);
  const field = clean(profile?.field);
  const goal = clean(profile?.goal);

  const facts: string[] = [`- Level: ${profile?.level ?? "not stated — assume B1"}`];
  if (nativeLanguage) facts.push(`- First language: ${nativeLanguage}`);
  if (field) facts.push(`- Works or studies in: ${field}`);
  if (goal) facts.push(`- Goal: ${goal}`);

  const sections = ["THE LEARNER", facts.join("\n")];

  if (!nativeLanguage) {
    sections.push(
      "Their first language was not given. Teach the English rule plainly; do not guess where they are from or invent a transfer explanation."
    );
  } else if (!hasCuratedL1(nativeLanguage)) {
    sections.push(
      `There are no curated notes for ${nativeLanguage}. Use your own knowledge of how ${nativeLanguage} differs from English, and be specific about the mechanism — say what ${nativeLanguage} does instead, not merely that it is different.`
    );
  }

  return sections.join("\n\n");
}
